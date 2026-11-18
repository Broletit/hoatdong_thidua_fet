"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

type Row = Record<string, string | number | null | undefined>;

function triggerBlobDownload(blob: Blob, fileName: string) {
  const safeName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function buildFallbackClientExcel(
  rows: Row[],
  columns: Array<{ key: string; label: string }>,
  title: string,
  sheetName: string,
): Blob {
  const sheetRows = [
    [title],
    [`Tổng số: ${rows.length} bản ghi • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`],
    [],
    ["STT", ...columns.map((c) => c.label)],
    ...rows.map((row, idx) => [idx + 1, ...columns.map((c) => row[c.key] ?? "")]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length } },
  ];
  worksheet["!cols"] = [
    { wch: 6 },
    ...columns.map((c) => ({
      wch: Math.min(48, Math.max(14, c.label.length + 4, ...rows.map((r) => String(r[c.key] ?? "").length + 2))),
    })),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || "Danh sách");
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export default function FilteredListExportButton({
  rows,
  columns,
  fileName,
  title = "DANH SÁCH XUẤT DỮ LIỆU",
  sheetName = "Danh sách",
}: {
  rows: Row[];
  columns: Array<{ key: string; label: string }>;
  fileName: string;
  title?: string;
  sheetName?: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function download() {
    if (!rows.length || exporting) return;
    setExporting(true);
    const xlsxName = fileName.replace(/\.csv$/i, ".xlsx");
    try {
      const response = await fetch("/api/admin/reports/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: xlsxName,
          sheetName,
          title,
          subtitle: `Tổng số: ${rows.length} bản ghi • Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
          columns: [
            { header: "STT", width: 8, align: "center" },
            ...columns.map((c) => ({ header: c.label, align: "left" as const })),
          ],
          rows: rows.map((row, idx) => [
            idx + 1,
            ...columns.map((column) => row[column.key] ?? ""),
          ]),
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        triggerBlobDownload(blob, xlsxName);
        return;
      }

      // Fallback sang xuất trực tiếp tại trình duyệt nếu server thiếu exceljs hoặc lỗi proxy
      const fallbackBlob = buildFallbackClientExcel(rows, columns, title, sheetName);
      triggerBlobDownload(fallbackBlob, xlsxName);
    } catch {
      try {
        const fallbackBlob = buildFallbackClientExcel(rows, columns, title, sheetName);
        triggerBlobDownload(fallbackBlob, xlsxName);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không thể xuất file Excel. Vui lòng thử lại.");
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      data-no-loading
      disabled={!rows.length || exporting}
      onClick={download}
      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={16} />
      {exporting ? "Đang xuất..." : "Xuất Excel"}
    </button>
  );
}
