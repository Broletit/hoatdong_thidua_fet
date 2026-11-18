const VIETNAMESE_CHAR_REGEX = /[\u00C0-\u1EF9]/;

export function getUserFacingActionError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.trim();

  if (!message) {
    return fallback;
  }
  if (/body exceeded|body size limit|request entity too large|payload too large/i.test(message)) {
    return "Tổng dung lượng tệp tải lên quá lớn. Mỗi tệp chỉ được tối đa 10 MB; vui lòng chọn tệp nhỏ hơn hoặc lưu từng minh chứng.";
  }
  if (/An error occurred in the Server Components render|omitted in production builds|NEXT_HTTP_ERROR_FALLBACK|digest property/i.test(message)) {
    return fallback;
  }
  if (/\b(EACCES|EPERM|EROFS)\b|permission denied|read-only file system/i.test(message)) {
    return "Máy chủ không có quyền ghi tệp vào thư mục lưu trữ. Vui lòng liên hệ quản trị viên.";
  }
  if (/\bENOSPC\b|no space left/i.test(message)) {
    return "Dung lượng lưu trữ trên máy chủ đã đầy. Vui lòng liên hệ quản trị viên.";
  }
  if (/\bENOENT\b|no such file or directory/i.test(message)) {
    return "Không tìm thấy đường dẫn hoặc tệp minh chứng trên máy chủ.";
  }
  if (/Illegal mix of collations|ONLY_FULL_GROUP_BY|\bER_[A-Z0-9_]+\b|ECONNREFUSED|PROTOCOL_CONNECTION_LOST/i.test(message)) {
    return "Không thể xử lý dữ liệu do lỗi kết nối hoặc cơ sở dữ liệu trên máy chủ. Vui lòng thử lại sau.";
  }
  if (/onedrive|microsoft|graph\.microsoft/i.test(message)) {
    return VIETNAMESE_CHAR_REGEX.test(message) ? message : `Lỗi lưu trữ OneDrive: ${message}`;
  }

  // Chỉ giữ nguyên thông báo nếu là câu tiếng Việt hợp lệ, tránh lộ thông báo kỹ thuật tiếng Anh.
  if (VIETNAMESE_CHAR_REGEX.test(message)) {
    return message;
  }

  return fallback;
}
