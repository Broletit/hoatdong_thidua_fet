import { NextResponse } from "next/server";
import { getDatabase } from "@/server/db/mysql";
import { getSessionUser } from "@/server/auth/getSessionUser";
import { canReadSubmissionFile } from "@/server/auth/canReadSubmissionFile";
import { getStorageProvider } from "@/server/storage/storageFactory";
import { authorizeEvidenceWrite, getLockedPassedCriteriaCodes, getLockedPassedUnitIds, removeEvidenceObjects, refreshEvidenceEvaluation } from "@/server/storage/evidenceService";
import type { StorageKind } from "@/server/storage/types";

type FileRow = {id:number; submission_id:number; criteria_code:string; evidence_unit_id:number|null; original_name:string; object_key:string; storage_provider:StorageKind; mime_type:string; size_bytes:number; user_id:number; class_id:number|null; submitted_at:string|null; has_support:number};
async function findFile(id: string) {
  const numeric = Number(id);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return undefined;
  return getDatabase().first<FileRow>(`SELECT sf.*,s.user_id,s.class_id,s.submitted_at,
    EXISTS(SELECT 1 FROM submission_support_requests sr WHERE sr.submission_id=s.id AND sr.status='open') has_support
    FROM submission_files sf JOIN submissions s ON s.id=sf.submission_id
    WHERE sf.id=? AND sf.status='ready' AND sf.deleted_at IS NULL`, [numeric]);
}
function resolveMimeType(originalName: string, recordedMime: string | null | undefined): string {
  const ext = (originalName || "").split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (recordedMime && recordedMime !== "application/octet-stream") return recordedMime;
  return "application/octet-stream";
}

export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({message:"Vui lòng đăng nhập."}, {status:401});
  const file = await findFile((await context.params).id);
  if (!file) return NextResponse.json({message:"Không tìm thấy tệp."}, {status:404});
  if (!await canReadSubmissionFile(getDatabase(), user, file)) return NextResponse.json({message:"Bạn không có quyền xem tệp này."}, {status:403});
  const provider = getStorageProvider(file.storage_provider);

  const url = new URL(request.url);
  const isForceDownload = url.searchParams.get("download") === "1";

  // Nếu người dùng không ép buộc download, thử dùng Microsoft Graph preview URL nếu khả dụng
  if (!isForceDownload && typeof provider.getDirectUrl === "function") {
    try {
      const directUrl = await provider.getDirectUrl(file.object_key);
      if (directUrl) {
        return NextResponse.redirect(directUrl, {
          status: 302,
          headers: {
            "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        });
      }
    } catch (directErr) {
      console.warn("[Storage] Direct preview URL unavailable, streaming inline via API:", directErr);
    }
  }

  // Phục vụ tệp trực tiếp từ Storage (OneDrive hoặc Local) hiển thị inline trên trình duyệt
  try {
    const mime = resolveMimeType(file.original_name, file.mime_type);
    const cleanAscii = (file.original_name || "evidence")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    const dispositionType = isForceDownload ? "attachment" : "inline";
    const disposition = `${dispositionType}; filename="${cleanAscii}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`;

    if (typeof provider.readBuffer === "function") {
      const buffer = await provider.readBuffer(file.object_key);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(buffer.length),
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const object = await provider.read(file.object_key);
    return new NextResponse(object.stream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(object.size),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({message:"Không tìm thấy tệp."}, {status:404});
    throw error;
  }
}
export async function DELETE(_: Request, context: {params:Promise<{id:string}>}) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({message:"Vui lòng đăng nhập."}, {status:401});
  const file = await findFile((await context.params).id);
  if (!file) return NextResponse.json({message:"Không tìm thấy tệp."}, {status:404});
  try {
    await getDatabase().withTransaction(async () => {
      await authorizeEvidenceWrite(user, file.submission_id, [file.criteria_code]);
      const locked = await getLockedPassedCriteriaCodes(getDatabase(), file.submission_id);
      const lockedUnits = await getLockedPassedUnitIds(getDatabase(), file.submission_id);
      if (locked.has(file.criteria_code) || (file.evidence_unit_id && lockedUnits.has(Number(file.evidence_unit_id)))) {
        throw new Error("Minh chứng đã được duyệt đạt, không thể xóa minh chứng.");
      }
      await getDatabase().execute("UPDATE submission_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", [file.id]);
      await refreshEvidenceEvaluation(file.submission_id);
    });
    await removeEvidenceObjects([file]);
    return NextResponse.json({ok:true});
  } catch (error) { return NextResponse.json({message:error instanceof Error ? error.message : "Không thể xóa minh chứng."}, {status:403}); }
}
