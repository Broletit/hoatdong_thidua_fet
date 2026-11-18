"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Fatal Global Error]:", error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[#071326] px-4 text-white text-center font-sans">
        <div className="w-full max-w-md rounded-2xl border border-blue-900/50 bg-[#0c213f] p-8 shadow-2xl">
          <h2 className="mb-2 text-xl font-bold text-white">Hệ thống đang được cập nhật</h2>
          <p className="mb-6 text-sm text-slate-300">
            Đã xảy ra sự cố trong quá trình khởi tạo ứng dụng. Vui lòng thử tải lại trang hoặc quay lại sau giây lát.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
          >
            Tải lại trang
          </button>
        </div>
      </body>
    </html>
  );
}
