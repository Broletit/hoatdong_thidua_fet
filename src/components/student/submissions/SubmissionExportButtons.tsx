import { Download } from "lucide-react";

export default function SubmissionExportButtons({ url }: { url: string }) {
  return (
    <a
      href={url}
      className="inline-flex items-center gap-2 rounded-xl border border-blue-700 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
    >
      <Download size={16} />
      Xuất Word
    </a>
  );
}
