import { Building2, MapPin } from "lucide-react";

export default function SiteFooter({ variant = "default" }: { variant?: "default" | "auth" }) {
  if (variant === "auth") {
    return (
      <footer className="shrink-0 border-t border-blue-900/40 bg-[#061426] px-4 py-3 text-center text-xs font-medium text-blue-200/80 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1.5">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <p className="flex items-center justify-center gap-1.5 leading-5 text-blue-100">
              <Building2 size={14} aria-hidden="true" className="shrink-0 text-amber-300" />
              Đoàn – Hội Khoa Công nghệ Điện tử
            </p>
            <p className="flex items-center justify-center gap-1 leading-5 text-blue-200/90">
              <MapPin size={12} aria-hidden="true" className="shrink-0 text-amber-300" />
              Văn phòng Đoàn khoa: X7.16
            </p>
          </div>
          <p className="leading-5 text-blue-200/70">
            © 2026 · Phát triển bởi <span className="whitespace-nowrap font-semibold text-amber-300">DAO HOA ANH THU</span>
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-xs font-semibold text-slate-700 shadow-[0_-2px_8px_rgba(0,0,0,0.03)] sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-1.5">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <p className="flex items-center justify-center gap-1.5 leading-5 text-slate-800">
            <Building2 size={14} aria-hidden="true" className="shrink-0 text-blue-700" />
            Đoàn – Hội Khoa Công nghệ Điện tử
          </p>
          <p className="flex items-center justify-center gap-1 leading-5 text-slate-600">
            <MapPin size={12} aria-hidden="true" className="shrink-0 text-blue-700" />
            Văn phòng Đoàn khoa: X7.16
          </p>
        </div>
        <p className="leading-5 text-slate-600">
          © 2026 · Phát triển bởi <span className="whitespace-nowrap font-bold text-blue-900">DAO HOA ANH THU</span>
        </p>
      </div>
    </footer>
  );
}
