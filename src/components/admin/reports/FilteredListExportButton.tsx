"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportStyledExcelAction } from "@/server/actions/admin/reports/exportStyledExcelAction";
import { downloadBase64Excel } from "@/lib/exports/downloadBase64Excel";

type Row = Record<string, string | number | null | undefined>;

export default function FilteredListExportButton({
  rows,
  columns,
  fileName,
}: {
  rows: Row[];
  columns: Array<{ key: string; label: string }>;
  fileName: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function download() {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      const xlsxName = fileName.replace(/\.csv$/i, ".xlsx");
      const result = await exportStyledExcelAction({
        fileName: xlsxName,
        sheetName: "Danh sách",
        title: "DANH SÁCH XUẤT DỮ LIỆU",
        subtitle: `Tổng số: ${rows.length} bản ghi • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
        columns: [
          { header: "STT", width: 8, align: "center" },
          ...columns.map((c) => ({ header: c.label, align: "left" as const })),
        ],
        rows: rows.map((row, idx) => [
          idx + 1,
          ...columns.map((column) => row[column.key] ?? ""),
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
      disabled={!rows.length || exporting}
      onClick={download}
      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={16} />
      {exporting ? "Đang xuất..." : "Xuất Excel"}
    </button>
  );
}
