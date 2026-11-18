import { NextResponse } from "next/server";
import { requireAdminContext } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import { buildStyledExcelBuffer } from "@/lib/exports/buildStyledExcel";
import { formatDateTimeVN } from "@/lib/utils/formatDateTimeVN";

type ActivityExportRow = {
  mssv: string | null;
  full_name: string;
  email: string;
  class_code: string | null;
  status: string;
  import_batch_id: number | null;
  attendance_note: string | null;
  registered_at: string | null;
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
      ar.status,
      ar.import_batch_id,
      ar.registered_at,
      (SELECT note FROM activity_attendance_logs al
       WHERE al.activity_id = ar.activity_id AND al.user_id = ar.user_id AND al.result = 'success'
       ORDER BY al.id DESC LIMIT 1) AS attendance_note
    FROM activity_registrations ar
    INNER JOIN users u ON u.id = ar.user_id
    LEFT JOIN class_members cm ON cm.user_id = u.id AND cm.left_at IS NULL
    LEFT JOIN classes c ON c.id = cm.class_id
    WHERE ar.activity_id = ? AND ar.status <> 'cancelled'
    ORDER BY ar.registered_at DESC, ar.id DESC
    `,
    [activityId],
  )) as ActivityExportRow[];

  const buffer = await buildStyledExcelBuffer({
    sheetName: "Danh sách đăng ký",
    title: `DANH SÁCH ĐĂNG KÝ: ${activity.title.toUpperCase()}`,
    subtitle: `Tổng số: ${rows.length} bản ghi • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
    columns: [
      { header: "STT", width: 8, align: "center" },
      { header: "Họ tên", width: 26, align: "left" },
      { header: "MSSV", width: 15, align: "center" },
      { header: "Lớp", width: 14, align: "center" },
      { header: "Thời gian đăng ký", width: 22, align: "center" },
      { header: "Trạng thái", width: 18, align: "center" },
      { header: "Hình thức điểm danh", width: 24, align: "center" },
    ],
    rows: rows.map((row, index) => [
      index + 1,
      row.full_name,
      row.mssv ?? "",
      row.class_code ?? "—",
      formatDateTimeVN(row.registered_at),
      row.status === "attended" ? "Đã điểm danh" : row.status === "absent" ? "Vắng" : "Chưa xác nhận",
      row.status !== "attended"
        ? "—"
        : row.import_batch_id != null
          ? "Cập nhật từ danh sách"
          : row.attendance_note?.includes("thủ công")
            ? "Thủ công"
            : row.attendance_note
              ? "Quét mã"
              : "—",
    ]),
  });

  const safeFile = `danh-sach-dang-ky-hoat-dong-${activityId}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFile}"`,
      "Cache-Control": "no-store",
    },
  });
}
