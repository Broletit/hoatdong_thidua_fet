export default function DashboardLoading() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/15"
      role="status"
      aria-label="Đang tải trang"
    >
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 shadow-2xl shadow-blue-950/20 ring-1 ring-slate-200/90">
        <div
          className="absolute inset-2 rounded-full border-2 border-slate-100 border-t-blue-600 border-r-blue-500 animate-spin"
          style={{ animationDuration: "0.85s" }}
        />
        <div
          className="absolute inset-3.5 rounded-full border-2 border-transparent border-b-amber-400 border-l-amber-300 animate-spin"
          style={{ animationDirection: "reverse", animationDuration: "1.2s" }}
        />
        <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_6px_#2563eb]" />
      </div>
    </div>
  );
}
