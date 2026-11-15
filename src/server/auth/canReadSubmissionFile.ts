import type { Database } from "@/server/db/mysql";

/**
 * Kiểm tra quyền đọc tệp minh chứng của người dùng hiện tại:
 * - Chủ hồ sơ luôn được phép đọc.
 * - Admin (đang ở ngữ cảnh admin) được phép đọc mọi tệp.
 * - Cán bộ khoa chỉ được phép đọc tệp của sinh viên thuộc lớp mình phụ trách khi hồ sơ đã nộp hoặc có yêu cầu hỗ trợ.
 */
export async function canReadSubmissionFile(
  db: Database,
  user: {id:number;role:string;loginContext?:string},
  file: {user_id:number;class_id:number|null;submitted_at:string|null;has_support:number},
) {
  const context = user.loginContext ?? "student";
  if (Number(file.user_id) === Number(user.id)) return true;
  if (user.role === "admin" && context === "admin") return true;
  if (!file.submitted_at && !file.has_support) return false;
  if (user.role === "faculty_officer" && context === "faculty_officer") {
    return Boolean((await db.first("SELECT 1 FROM faculty_class_assignments WHERE faculty_officer_id=? AND class_id=? LIMIT 1", [user.id, file.class_id])));
  }
  return false;
}
