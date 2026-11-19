import path from "node:path";

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const formats: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function validateEvidenceMetadata(originalName: string, mimeType: string, size: number) {
  const extension = path.extname(originalName).toLowerCase();
  if (!originalName || originalName.length > 255 || /[\x00-\x1f\\/]/.test(originalName)) {
    throw new Error("Tên tệp minh chứng không hợp lệ.");
  }

  let normalizedMime = (mimeType || "").toLowerCase();
  if (normalizedMime === "image/jpg" || normalizedMime === "image/pjpeg") {
    normalizedMime = "image/jpeg";
  }
  if (!normalizedMime) {
    normalizedMime = formats[extension] || "";
  }

  const expectedMime = formats[extension];
  if (!expectedMime || (normalizedMime !== expectedMime && normalizedMime !== "application/octet-stream")) {
    throw new Error("Minh chứng chỉ chấp nhận tệp định dạng PDF, PNG, JPG hoặc JPEG.");
  }

  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_EVIDENCE_BYTES) {
    throw new Error("Dung lượng minh chứng phải từ 1 byte đến 10 MB.");
  }
  return { extension, mimeType: expectedMime };
}

export function validateEvidenceContent(buffer: Buffer, mimeType: string) {
  const isPdf = mimeType === "application/pdf" && buffer.subarray(0, 5).toString() === "%PDF-";
  const isPng = mimeType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = mimeType === "image/jpeg" && buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

  if (!isPdf && !isPng && !isJpeg) {
    throw new Error("Nội dung tệp không khớp định dạng PDF, PNG, JPG hoặc JPEG.");
  }
}
export async function validateEvidenceFile(file: File) {
  const metadata = validateEvidenceMetadata(file.name, file.type, file.size);
  const buffer = Buffer.from(await file.arrayBuffer());
  validateEvidenceContent(buffer, metadata.mimeType);
  return { ...metadata, buffer };
}
