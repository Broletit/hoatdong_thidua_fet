import { NextResponse } from "next/server";
import { requireAdminContext } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import { buildStyledExcelBuffer } from "@/lib/exports/buildStyledExcel";

type ActivityExportRow = {
  mssv: string | null;
  full_name: string;
  email: string;
  class_code: string | null;
  attendance_status: string | null;
  attendance_method: string | null;
  checked_in_at: string | null;
  score: number | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdminContext();
  const { id } = await context.params;
  const db = getDatabase();
  const activityId = await db.resolveRouteRecordId(id);

  if (!Number.isFinite(activityId) || activityId <= 0) {
    return NextResponse.json({ error: "Invalid activity id" }, { status: 400 });
  }

  const activity = (await db.first(
    `SELECT id, title FROM activities WHERE id = ? LIMIT 1`,
    [activityId],
  )) as { id: number; title: string } | undefined;

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const rows = (await db.rows(
    `
    SELECT
      u.mssv,
      u.full_name,
      u.email,
      c.code AS class_code,
      ar.attendance_status,
      ar.attendance_method,
      ar.checked_in_at,
      ar.score
    FROM activity_registrations ar
    INNER JOIN users u ON u.id = ar.user_id
    LEFT JOIN class_members cm ON cm.user_id = u.id AND cm.left_at IS NULL
    LEFT JOIN classes c ON c.id = cm.class_id
    WHERE ar.activity_id = ?
    ORDER BY u.mssv ASC, u.full_name ASC
    `,
    [activityId],
  )) as ActivityExportRow[];

  const buffer = await buildStyledExcelBuffer({
    sheetName: "Điểm danh",
    title: `DANH SÁCH THAM GIA HOẠT ĐỘNG: ${activity.title.toUpperCase()}`,
    subtitle: `Tổng số sinh viên: ${rows.length} • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
    columns: [
      { header: "STT", width: 8, align: "center" },
      { header: "MSSV", width: 15, align: "center" },
      { header: "Họ và tên", width: 26, align: "left" },
      { header: "Email", width: 28, align: "left" },
      { header: "Lớp", width: 14, align: "center" },
      { header: "Trạng thái điểm danh", width: 22, align: "center" },
      { header: "Hình thức", width: 16, align: "center" },
      { header: "Thời gian điểm danh", width: 22, align: "center" },
      { header: "Điểm", width: 10, align: "center" },
    ],
    rows: rows.map((row, index) => [
      index + 1,
      row.mssv ?? "",
      row.full_name,
      row.email,
      row.class_code ?? "",
      row.attendance_status === "present" ? "Đã điểm danh" : row.attendance_status ?? "Chưa điểm danh",
      row.attendance_method ?? "",
      row.checked_in_at ? new Date(row.checked_in_at).toLocaleString("vi-VN") : "",
      row.score ?? "",
    ]),
  });

  const safeFile = `activity_${activityId}_attendance.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFile}"`,
      "Cache-Control": "no-store",
    },
  });
}
