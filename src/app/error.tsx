"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function ErrorBoundaryPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Application Error]:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#071326] px-4 text-white text-center">
      <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0c213f]/80 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
          <AlertTriangle size={32} />
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-tight text-white">Đã xảy ra sự cố</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-300">
          Hệ thống gặp sự cố không mong muốn trong khi xử lý yêu cầu. Bạn có thể thử tải lại hoặc quay về trang đăng nhập.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 active:scale-95"
          >
            <RotateCcw size={16} /> Thử lại
          </button>
          <Link
            href="/login"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 active:scale-95"
          >
            <Home size={16} /> Về trang đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
