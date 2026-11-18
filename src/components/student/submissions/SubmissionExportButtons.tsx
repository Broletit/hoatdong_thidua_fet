"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";

function extractFileNameFromHeader(disposition: string | null): string {
  if (!disposition) return "baocaothanhtich_SV5T.docx";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = disposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = disposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return "baocaothanhtich_SV5T.docx";
}

export default function SubmissionExportButtons({ url }: { url: string }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(data?.message || data?.error || "Không thể xuất file Word.");
      }
      const blob = await response.blob();
      const fileName = extractFileNameFromHeader(response.headers.get("Content-Disposition"));
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xuất file Word. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      data-no-loading
      disabled={exporting}
      onClick={handleExport}
      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={16} />
      {exporting ? "Đang xuất..." : "Xuất Word"}
    </button>
  );
}
