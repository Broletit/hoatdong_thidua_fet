import { createHash } from "node:crypto";
import { validateObjectKey } from "./objectKey";
import type { ObjectMetadata, StorageProvider, StoredObject } from "./types";

export type OneDriveConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId?: string;
  userEmail?: string;
  siteId?: string;
  root: string;
};

type GraphItem = {
  id: string;
  size: number;
  eTag?: string;
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
};

/** Đọc và kiểm tra cấu hình kết nối Microsoft Graph OneDrive từ biến môi trường. */
export function getOneDriveConfig(): OneDriveConfig {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || "";
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() || "";
  const driveId = process.env.MICROSOFT_DRIVE_ID?.trim() || "";
  const userEmail = process.env.MICROSOFT_USER_EMAIL?.trim() || "";
  const siteId = process.env.MICROSOFT_SITE_ID?.trim() || "";

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Cấu hình OneDrive yêu cầu ít nhất MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID và MICROSOFT_CLIENT_SECRET trong file cấu hình .env."
    );
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    driveId,
    userEmail,
    siteId,
    root: (process.env.MICROSOFT_STORAGE_ROOT || "thiduafet/evidence").replace(/^\/+|\/+$/g, ""),
  };
}

export class OneDriveStorageProvider implements StorageProvider {
  readonly kind = "onedrive" as const;
  private token?: { value: string; expiresAt: number };
  private cachedDriveId?: string;
  private verifiedFolders = new Set<string>();

  constructor(private readonly config?: OneDriveConfig) { }

  private get settings() {
    return this.config ?? getOneDriveConfig();
  }

  private path(key: string) {
    validateObjectKey(key);
    const root = this.settings.root;
    const segments = [root, key]
      .filter(Boolean)
      .join("/")
      .split("/")
      .filter(Boolean);
    return segments.map(encodeURIComponent).join("/");
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }

    const settings = this.settings;
    const body = new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Xác thực tài khoản Microsoft thất bại (${response.status}): ${errText}`);
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new Error("Phản hồi từ Microsoft không có access token.");
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    };
    return this.token.value;
  }

  private async getDriveId(): Promise<string> {
    if (this.cachedDriveId) return this.cachedDriveId;
    if (this.settings.driveId) {
      this.cachedDriveId = this.settings.driveId;
      return this.cachedDriveId;
    }

    const token = await this.accessToken();
    const headers = { authorization: `Bearer ${token}` };
    const diagnosticErrors: string[] = [];

    // 1. Nếu có MICROSOFT_USER_EMAIL, lấy Drive của User này
    if (this.settings.userEmail) {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.settings.userEmail)}/drive`,
          { headers }
        );
        if (res.ok) {
          const data = (await res.json()) as { id?: string };
          if (data.id) {
            this.cachedDriveId = data.id;
            return data.id;
          }
        } else {
          const err = await res.text().catch(() => "");
          diagnosticErrors.push(`Email ${this.settings.userEmail} [${res.status}]: ${err}`);
        }
      } catch (e) {
        diagnosticErrors.push(`Email ${this.settings.userEmail} lỗi kết nối: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2. Nếu có MICROSOFT_SITE_ID, lấy Drive của SharePoint Site
    if (this.settings.siteId) {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(this.settings.siteId)}/drive`,
          { headers }
        );
        if (res.ok) {
          const data = (await res.json()) as { id?: string };
          if (data.id) {
            this.cachedDriveId = data.id;
            return data.id;
          }
        } else {
          const err = await res.text().catch(() => "");
          diagnosticErrors.push(`SharePoint Site ${this.settings.siteId} [${res.status}]: ${err}`);
        }
      } catch (e) {
        diagnosticErrors.push(`SharePoint Site ${this.settings.siteId} lỗi kết nối: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 3. Tự động lấy Drive mặc định đầu tiên của tổ chức
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/drives?$top=1`, { headers });
      if (res.ok) {
        const data = (await res.json()) as { value?: Array<{ id: string }> };
        if (data.value && data.value.length > 0 && data.value[0]?.id) {
          this.cachedDriveId = data.value[0].id;
          return this.cachedDriveId;
        }
      } else {
        const err = await res.text().catch(() => "");
        diagnosticErrors.push(`drives?$top=1 [${res.status}]: ${err}`);
      }
    } catch (e) {
      diagnosticErrors.push(`drives list lỗi kết nối: ${e instanceof Error ? e.message : String(e)}`);
    }

    const details = diagnosticErrors.length ? ` (Chi tiết: ${diagnosticErrors.join(" | ")})` : "";
    throw new Error(
      `Không tìm thấy Drive trên OneDrive. Vui lòng cung cấp MICROSOFT_DRIVE_ID hoặc MICROSOFT_USER_EMAIL hợp lệ trong file .env.${details}`
    );
  }

  /**
   * Tự động khởi tạo cấu trúc thư mục cha trên OneDrive nếu chưa tồn tại.
   * Microsoft Graph yêu cầu toàn bộ thư mục cha phải hiện diện trước khi ghi tệp;
   * hàm này tạo từng cấp thư mục từ gốc xuống lá và lưu vào cache để các lần sau không cần gọi lại.
   */
  private async ensureParentFolder(key: string): Promise<void> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();

    const fullSegments = [this.settings.root, key]
      .filter(Boolean)
      .join("/")
      .split("/")
      .filter(Boolean);

    // Toàn bộ các cấp thư mục ngoại trừ tên tệp ở cuối
    const folderSegments = fullSegments.slice(0, -1);
    if (folderSegments.length === 0) return;

    const fullFolderPath = folderSegments.join("/");
    if (this.verifiedFolders.has(fullFolderPath)) return;

    for (let i = 1; i <= folderSegments.length; i++) {
      const currentSegments = folderSegments.slice(0, i);
      const currentPath = currentSegments.join("/");
      if (this.verifiedFolders.has(currentPath)) continue;

      const folderName = folderSegments[i - 1];
      const parentSegments = folderSegments.slice(0, i - 1);

      const parentUrl = parentSegments.length === 0
        ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`
        : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${parentSegments.map(encodeURIComponent).join("/")}:/children`;

      const createRes = await fetch(parentUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });

      if (createRes.status === 201 || createRes.status === 200 || createRes.status === 409) {
        this.verifiedFolders.add(currentPath);
      } else {
        // Kiểm tra lại bằng GET xem thư mục đã tồn tại trước đó chưa
        const checkUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${currentSegments.map(encodeURIComponent).join("/")}:`;
        const checkRes = await fetch(checkUrl, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (checkRes.ok) {
          this.verifiedFolders.add(currentPath);
        } else {
          const errText = await createRes.text().catch(() => "");
          throw new Error(`Không thể khởi tạo thư mục "${currentPath}" trên OneDrive (${createRes.status}): ${errText}`);
        }
      }
    }
  }

  async put(key: string, content: Buffer, mimeType: string): Promise<ObjectMetadata> {
    // 1. Đảm bảo toàn bộ cấu trúc thư mục cha đã tồn tại
    await this.ensureParentFolder(key);

    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const encodedPath = this.path(key);

    // 2. Với tệp <= 4MB, ưu tiên PUT trực tiếp 1 lần (chuẩn Microsoft Graph cho tệp nhỏ)
    if (content.length <= 4 * 1024 * 1024) {
      const putUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/content`;
      const response = await fetch(putUrl, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": mimeType,
          "content-length": String(content.length),
        },
        body: new Uint8Array(content) as unknown as BodyInit,
      });

      if (response.ok) {
        const item = (await response.json()) as GraphItem;
        return {
          size: Number(item.size),
          mimeType: item.file?.mimeType || mimeType,
          etag: item.eTag,
          checksumSha256: createHash("sha256").update(content).digest("hex"),
        };
      }

      if (response.status !== 413) {
        const errText = await response.text().catch(() => "");
        console.warn(`[OneDrive] Simple PUT failed (${response.status}), falling back to upload session:`, errText);
      }
    }

    // 3. Với tệp > 4MB (hoặc khi PUT trực tiếp bị từ chối), dùng Upload Session theo khuyến nghị Microsoft Graph
    const sessionUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:/createUploadSession`;
    const sessionRes = await fetch(sessionUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
        },
      }),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text().catch(() => "");
      throw new Error(`Khởi tạo phiên tải lên OneDrive thất bại (${sessionRes.status}): ${errText}`);
    }

    const sessionData = (await sessionRes.json()) as { uploadUrl?: string };
    if (!sessionData.uploadUrl) {
      throw new Error("Phản hồi tạo phiên từ OneDrive không trả về uploadUrl.");
    }

    // Tải toàn bộ nội dung tệp lên uploadUrl (Lưu ý: Không gửi kèm Authorization header theo tài liệu Microsoft)
    const uploadRes = await fetch(sessionData.uploadUrl, {
      method: "PUT",
      headers: {
        "content-length": String(content.length),
        "content-range": `bytes 0-${content.length - 1}/${content.length}`,
      },
      body: new Uint8Array(content) as unknown as BodyInit,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`Tải dữ liệu tệp lên OneDrive thất bại (${uploadRes.status}): ${errText}`);
    }

    const item = (await uploadRes.json()) as GraphItem;
    return {
      size: Number(item.size),
      mimeType: item.file?.mimeType || mimeType,
      etag: item.eTag,
      checksumSha256: createHash("sha256").update(content).digest("hex"),
    };
  }

  async head(key: string): Promise<ObjectMetadata> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${this.path(key)}:?$select=id,size,eTag,file`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Không tìm thấy thông tin tệp trên OneDrive (${response.status}): ${errText}`);
    }
    const item = (await response.json()) as GraphItem;
    return {
      size: Number(item.size),
      mimeType: item.file?.mimeType || "application/octet-stream",
      etag: item.eTag,
    };
  }

  async read(key: string): Promise<StoredObject> {
    const metadata = await this.head(key);
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${this.path(key)}:/content`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      throw new Error(`Không thể đọc nội dung tệp từ OneDrive (${response.status}).`);
    }
    return { ...metadata, stream: response.body };
  }

  async readBuffer(key: string): Promise<Buffer> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${this.path(key)}:/content`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Không thể đọc nội dung tệp từ OneDrive (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Lấy đường dẫn xem trực tiếp (Preview / View URL) từ OneDrive/SharePoint thông qua Microsoft Graph API.
   * Người dùng khi bấm xem minh chứng sẽ mở ở tab mới và hiển thị trực tiếp trình xem của OneDrive
   * (không tự động tải tệp về máy và không đi qua máy chủ host trung gian).
   */
  async getDirectUrl(key: string): Promise<string> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const encodedPath = this.path(key);

    // 1. Lấy thông tin Drive Item ID từ path (Microsoft Graph các thao tác preview/createLink đều yêu cầu /items/{id})
    let itemId: string | undefined;
    try {
      const itemUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encodedPath}:?$select=id,webUrl`;
      const itemRes = await fetch(itemUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (itemRes.ok) {
        const itemData = (await itemRes.json()) as { id?: string; webUrl?: string };
        itemId = itemData.id;
      }
    } catch (e) {
      console.warn("[OneDrive] getDirectUrl: Không lấy được item ID:", e);
    }

    // 2. Ưu tiên số 1: Gọi Microsoft Graph /preview API với itemId để lấy URL xem trực tiếp (embed view) của OneDrive
    if (itemId) {
      try {
        const previewUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/preview`;
        const previewRes = await fetch(previewUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ zoom: 1 }),
        });
        if (previewRes.ok) {
          const previewData = (await previewRes.json()) as { getUrl?: string };
          if (previewData.getUrl) {
            return previewData.getUrl;
          }
        } else {
          const errText = await previewRes.text().catch(() => "");
          console.warn(`[OneDrive] /preview API returned ${previewRes.status}:`, errText);
        }
      } catch (err) {
        console.warn("[OneDrive] getDirectUrl /preview fetch failed:", err);
      }

      // 3. Fallback: Tạo link xem trực tiếp trên OneDrive (type: "view", scope: "anonymous")
      try {
        const shareUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/createLink`;
        const shareRes = await fetch(shareUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            type: "view",
            scope: "anonymous",
          }),
        });
        if (shareRes.ok) {
          const shareData = (await shareRes.json()) as { link?: { webUrl?: string } };
          if (shareData.link?.webUrl) {
            return shareData.link.webUrl;
          }
        }
      } catch (err) {
        console.warn("[OneDrive] getDirectUrl createLink fallback failed:", err);
      }
    }

    throw new Error("Không thể tạo liên kết xem trực tiếp từ OneDrive.");
  }

  async delete(key: string): Promise<void> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${this.path(key)}:`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

    if (response.status === 404) return;
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.warn(`[OneDrive] Xóa tệp thất bại (${response.status}): ${err}`);
    }
  }
}
