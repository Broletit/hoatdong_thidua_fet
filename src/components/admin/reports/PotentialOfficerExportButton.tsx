"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportStyledExcelAction } from "@/server/actions/admin/reports/exportStyledExcelAction";
import { downloadBase64Excel } from "@/lib/exports/downloadBase64Excel";

type Row = {
  id: number;
  full_name: string;
  mssv: string | null;
  class_codes: string | null;
  event_title: string;
  achieved_criteria: number;
  total_criteria: number;
  missing_required: number;
  potential_score: number;
  score_max: number;
};

export default function PotentialOfficerExportButton({ rows }: { rows: Row[] }) {
  const [exporting, setExporting] = useState(false);

  async function download() {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      const result = await exportStyledExcelAction({
        fileName: "can-bo-tiem-nang.xlsx",
        sheetName: "Cán bộ tiềm năng",
        title: "DANH SÁCH CÁN BỘ TIỀM NĂNG",
        subtitle: `Tổng số: ${rows.length} cán bộ • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
        columns: [
          { header: "STT", width: 8, align: "center" },
          { header: "Họ và tên", width: 26, align: "left" },
          { header: "MSSV", width: 15, align: "center" },
          { header: "Lớp", width: 18, align: "center" },
          { header: "Đợt xét", width: 28, align: "left" },
          { header: "Tiêu chí đạt", width: 16, align: "center" },
          { header: "Bắt buộc thiếu", width: 16, align: "center" },
          { header: "Điểm dự kiến", width: 16, align: "center" },
        ],
        rows: rows.map((row, idx) => [
          idx + 1,
          row.full_name,
          row.mssv ?? "",
          row.class_codes ?? "",
          row.event_title,
          `${row.achieved_criteria}/${row.total_criteria}`,
          row.missing_required,
          `${row.potential_score}/${row.score_max}`,
        ]),
      });
      downloadBase64Excel(result.fileName, result.base64);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={!rows.length || exporting}
      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={16} />
      {exporting ? "Đang xuất..." : "Xuất Excel"}
    </button>
  );
}
