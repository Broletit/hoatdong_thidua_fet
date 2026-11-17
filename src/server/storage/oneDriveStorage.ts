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
    root: (process.env.MICROSOFT_STORAGE_ROOT || "MeritTrack/evidence").replace(/^\/+|\/+$/g, ""),
  };
}

export class OneDriveStorageProvider implements StorageProvider {
  readonly kind = "onedrive" as const;
  private token?: { value: string; expiresAt: number };
  private cachedDriveId?: string;

  constructor(private readonly config?: OneDriveConfig) {}

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

    // 1. Nếu có MICROSOFT_USER_EMAIL, lấy Drive của User này
    if (this.settings.userEmail) {
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
      }
    }

    // 2. Nếu có MICROSOFT_SITE_ID, lấy Drive của SharePoint Site
    if (this.settings.siteId) {
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
      }
    }

    // 3. Tự động lấy Drive mặc định đầu tiên của tổ chức
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives?$top=1`, { headers });
    if (res.ok) {
      const data = (await res.json()) as { value?: Array<{ id: string }> };
      if (data.value && data.value.length > 0 && data.value[0]?.id) {
        this.cachedDriveId = data.value[0].id;
        return this.cachedDriveId;
      }
    }

    throw new Error(
      "Không tìm thấy Drive trên OneDrive. Vui lòng cung cấp MICROSOFT_DRIVE_ID hoặc MICROSOFT_USER_EMAIL trong file .env."
    );
  }

  private async graph(path: string, init: RequestInit = {}): Promise<Response> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Thao tác lưu trữ Microsoft Graph thất bại (${response.status}): ${errText}`);
    }
    return response;
  }

  private itemPath(key: string) {
    return `/root:/${this.path(key)}`;
  }

  async put(key: string, content: Buffer, mimeType: string): Promise<ObjectMetadata> {
    const response = await this.graph(`${this.itemPath(key)}:/content`, {
      method: "PUT",
      headers: {
        "content-type": mimeType,
        "content-length": String(content.length),
      },
      body: new Uint8Array(content) as unknown as BodyInit,
    });

    const item = (await response.json()) as GraphItem;
    return {
      size: Number(item.size),
      mimeType: item.file?.mimeType || mimeType,
      etag: item.eTag,
      checksumSha256: createHash("sha256").update(content).digest("hex"),
    };
  }

  async head(key: string): Promise<ObjectMetadata> {
    const response = await this.graph(`${this.itemPath(key)}?$select=id,size,eTag,file`);
    const item = (await response.json()) as GraphItem;
    return {
      size: Number(item.size),
      mimeType: item.file?.mimeType || "application/octet-stream",
      etag: item.eTag,
    };
  }

  async read(key: string): Promise<StoredObject> {
    const metadata = await this.head(key);
    const response = await this.graph(`${this.itemPath(key)}:/content`, { redirect: "follow" });
    if (!response.body) {
      throw new Error("Microsoft Graph trả về luồng tệp rỗng.");
    }
    return { ...metadata, stream: response.body };
  }

  /**
   * Lấy đường dẫn tải trực tiếp phát xuất từ hạ tầng OneDrive/SharePoint CDN của Microsoft.
   * Người dùng khi bấm xem file sẽ được chuyển hướng 302 trực tiếp sang URL này,
   * hoàn toàn không qua server máy chủ host trung gian.
   */
  async getDirectUrl(key: string): Promise<string> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const path = this.itemPath(key);

    // 1. Thử lấy trường @microsoft.graph.downloadUrl từ metadata của item
    try {
      const metaRes = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}${path}?$select=id,@microsoft.graph.downloadUrl`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      if (metaRes.ok) {
        const data = (await metaRes.json()) as GraphItem;
        if (data["@microsoft.graph.downloadUrl"]) {
          return data["@microsoft.graph.downloadUrl"];
        }
      }
    } catch (err) {
      console.warn("[OneDrive] getDirectUrl metadata fetch failed:", err);
    }

    // 2. Fallback: Gọi đến :/content với redirect: manual để lấy Location header 302 của Microsoft CDN
    const contentUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}${path}:/content`;
    const contentRes = await fetch(contentUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      redirect: "manual",
    });

    const location = contentRes.headers.get("location");
    if (location) {
      return location;
    }

    throw new Error("Không thể tạo liên kết xem trực tiếp từ OneDrive.");
  }

  async delete(key: string): Promise<void> {
    const driveId = await this.getDriveId();
    const token = await this.accessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}${this.itemPath(key)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }
    );

    if (response.status === 404) return;
    if (!response.ok) {
      throw new Error(`Xóa tệp trên Microsoft Graph thất bại (${response.status}).`);
    }
  }
}
