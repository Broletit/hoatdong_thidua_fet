"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Wrench,
  Bot,
  ArrowRight,
} from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";

export default function MaintenanceClient({
  isMaintenanceMode = true,
}: {
  isMaintenanceMode?: boolean;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-gradient-to-br from-[#051329] via-[#091e3e] to-[#0c2754] text-white">
      {/* Background ambient lighting orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600/20 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-20 h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[26rem] w-[26rem] rounded-full bg-amber-400/10 blur-[110px]"
      />

      {/* Modern cyber grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35"
      />

      {/* Top Header with Trio of Logos: logotrang -> logodoan -> logohoi */}
      <header className="relative z-10 flex w-full max-w-6xl items-center justify-between px-6 pt-8 sm:px-8">
        <div className="flex items-center gap-3 sm:gap-4 md:gap-5 flex-nowrap">
          <Image
            src="/logotrang.png"
            alt="Logo Khoa Công nghệ Điện tử - IUH"
            width={3088}
            height={520}
            className="h-10 w-auto max-w-[170px] sm:max-w-none sm:h-12 object-contain object-left shrink-0"
            priority
          />
          <Image
            src="/logodoan.png"
            alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"
            width={2508}
            height={2755}
            className="h-8.5 w-auto sm:h-10 object-contain shrink-0"
            priority
          />
          <Image
            src="/logohoi.png"
            alt="Biểu trưng Hội Sinh viên Việt Nam"
            width={1403}
            height={1414}
            className="h-8.5 w-auto sm:h-10 object-contain shrink-0"
            priority
          />
        </div>

        {!isMaintenanceMode ? (
          <Link
            href="/login"
            className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/25 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:200%_100%] px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(37,99,235,0.45)] transition-all duration-300 hover:bg-[position:100%_0] hover:border-white/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.65)] hover:scale-[1.03] active:scale-95"
          >
            {/* Shimmer light sweep on hover */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <span className="relative z-10 font-bold tracking-wide">Truy cập hệ thống</span>
            <ArrowRight
              size={15}
              aria-hidden="true"
              className="relative z-10 transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium text-amber-300 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span className="font-semibold">Đang bảo trì định kỳ</span>
          </div>
        )}
      </header>

      {/* Main Center Content */}
      <section className="relative z-10 mx-auto my-auto flex w-full max-w-4xl flex-col items-center px-6 py-16 text-center sm:px-8">
        {/* Animated Orbital Maintenance Robot Icon */}
        <div className="relative mb-6 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
          {/* Outer glowing pulsing ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400/20 via-blue-500/20 to-cyan-400/20 blur-xl animate-pulse" />
          
          {/* Orbital rotating ring */}
          <div className="absolute inset-0 rounded-full border border-dashed border-amber-400/40 animate-[spin_20s_linear_infinite]" />
          <div className="absolute -inset-2 rounded-full border border-dotted border-blue-400/30 animate-[spin_35s_linear_infinite_reverse]" />

          {/* Central emblem: Robot in center + Wrench in top-right corner with bounce animation */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-900/90 via-[#0a2144] to-[#051329] shadow-2xl ring-1 ring-white/20 sm:h-24 sm:w-24">
            <Bot className="h-11 w-11 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] animate-[wiggle_3s_ease-in-out_infinite]" />
            <Wrench className="absolute -top-1.5 -right-1.5 h-5 w-5 text-cyan-300 animate-bounce drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
          </div>
        </div>

        {/* Tiêu đề chuẩn font hệ thống */}
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          {isMaintenanceMode ? "HỆ THỐNG ĐANG BẢO TRÌ" : "HỆ THỐNG ĐÃ SẴN SÀNG"}
        </h1>
      </section>

      {/* Footer trắng chuẩn từ giao diện chính */}
      <div className="w-full relative z-10">
        <SiteFooter variant="default" />
      </div>
    </main>
  );
}
