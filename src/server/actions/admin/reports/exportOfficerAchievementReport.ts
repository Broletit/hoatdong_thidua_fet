"use server";

import { addCohortFilter } from "@/server/cohorts/sql";
import { requireAdminContext } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import { buildStyledExcelBuffer } from "@/lib/exports/buildStyledExcel";

/** Xuất báo cáo danh sách cán bộ tiêu biểu / bảng xếp hạng hồ sơ cán bộ ra file Excel (.xlsx). */
export async function exportOfficerAchievementReport(formData: FormData) {
  await requireAdminContext();

  const db = getDatabase();

  const termId = Number(formData.get("termId"));
  const eventId = Number(formData.get("eventId") ?? 0);
  const exportType = String(formData.get("exportType") ?? "passed");

  if (!Number.isFinite(termId) || termId <= 0) {
    throw new Error("Học kỳ không hợp lệ.");
  }

  const where: string[] = ["e.type = 'officer'", "e.term_id = ?"];
  const values: unknown[] = [termId];

  if (exportType === "passed") {
    where.push("s.status = 'passed'");
  }

  if (eventId > 0) {
    where.push("e.id = ?");
    values.push(eventId);
  }

  addCohortFilter(where,values,formData.get("cohort"),"u.cohort");
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const rows = (await db.rows(`
      SELECT
        u.full_name,
        u.mssv,
        GROUP_CONCAT(c.code SEPARATOR ', ') AS class_codes,
        e.title AS event_title,
        s.status,
        s.score_total,
        s.submitted_at
      FROM submissions s
      INNER JOIN events e ON e.id = s.event_id
      INNER JOIN users u ON u.id = s.user_id
      LEFT JOIN class_members cm ON cm.user_id = u.id
      LEFT JOIN classes c ON c.id = cm.class_id
      ${whereSql}
      GROUP BY s.id
      ORDER BY s.score_total DESC, u.full_name ASC
      `, [...values])) as Array<Record<string, unknown>>;

  const title =
    exportType === "passed"
      ? "DANH SÁCH CÁN BỘ ĐOÀN TIÊU BIỂU"
      : "BẢNG XẾP HẠNG HỒ SƠ CÁN BỘ";

  const buffer = await buildStyledExcelBuffer({
    sheetName: exportType === "passed" ? "Cán bộ tiêu biểu" : "Xếp hạng cán bộ",
    title,
    subtitle: `Tổng số: ${rows.length} cán bộ • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
    columns: [
      { header: "Hạng", width: 8, align: "center" },
      { header: "Họ và tên", width: 26, align: "left" },
      { header: "MSSV", width: 15, align: "center" },
      { header: "Lớp", width: 18, align: "center" },
      { header: "Đợt xét", width: 28, align: "left" },
      { header: "Trạng thái", width: 18, align: "center" },
      { header: "Điểm", width: 10, align: "center" },
      { header: "Ngày nộp", width: 22, align: "center" },
    ],
    rows: rows.map((item, index) => [
      index + 1,
      String(item.full_name ?? ""),
      String(item.mssv ?? ""),
      String(item.class_codes ?? ""),
      String(item.event_title ?? ""),
      String(item.status ?? ""),
      item.score_total != null ? Number(item.score_total) : "",
      item.submitted_at ? new Date(String(item.submitted_at)).toLocaleString("vi-VN") : "",
    ]),
  });

  return {
    fileName:
      exportType === "passed"
        ? "can-bo-doan-tieu-bieu.xlsx"
        : "bang-xep-hang-ho-so-can-bo.xlsx",
    base64: buffer.toString("base64"),
  };
}
