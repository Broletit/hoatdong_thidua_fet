import { redirect } from "next/navigation";
import Image from "next/image";
import { LogIn, Sparkles } from "lucide-react";

import { getSessionUser } from "@/server/auth/getSessionUser";
import { getDefaultRouteByRoleContext } from "@/server/auth/role-context";

import LoginForm from "./LoginForm";
import styles from "./login.module.css";

export default async function LoginPage() {
  const user = await getSessionUser();

  if (user) {
    redirect(getDefaultRouteByRoleContext(user.loginContext as never));
  }

  return (
    <main className={`relative flex min-h-screen items-center justify-center overflow-hidden ${styles.navyBg}`}>
      {/* Moving ambient lighting orbs */}
      <div aria-hidden="true" className={styles.ambientLight1} />
      <div aria-hidden="true" className={styles.ambientLight2} />
      <div aria-hidden="true" className={styles.ambientLight3} />

      {/* Subtle modern tech grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-size opacity-25" />

      <section className="relative z-10 mx-auto grid min-h-full w-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 xl:gap-16 lg:px-8">
        {/* Left column: Branding & Title */}
        <div className="flex flex-col justify-center text-white">
          {/* Bộ logo: logotrang -> logodoan -> logohoi nằm chung hàng với độ cao đồng đều */}
          <div className="flex items-center gap-3 sm:gap-4 md:gap-5 flex-nowrap">
            <Image
              src="/logotrang.png"
              alt="Logo Khoa Công nghệ Điện tử - IUH"
              width={3088}
              height={520}
              className="h-11 w-auto max-w-[190px] sm:max-w-none sm:h-13 md:h-14 object-contain object-left shrink-0"
              priority
            />
            <Image
              src="/logodoan.png"
              alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"
              width={2508}
              height={2755}
              className="h-9 w-auto sm:h-10.5 md:h-11.5 object-contain shrink-0"
              priority
            />
            <Image
              src="/logohoi.png"
              alt="Biểu trưng Hội Sinh viên Việt Nam"
              width={1403}
              height={1414}
              className="h-9 w-auto sm:h-10.5 md:h-11.5 object-contain shrink-0"
              priority
            />
          </div>

          <h1 className="mt-5 text-base font-bold tracking-tight text-white sm:text-2xl lg:text-[1.75rem] xl:text-[1.95rem]">
            <span className={`block whitespace-nowrap leading-snug ${styles.shimmerTitle}`}>
              HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG
            </span>
            <span className={`mt-1.5 block whitespace-nowrap leading-snug ${styles.shimmerTitle}`}>
              VÀ XÉT THI ĐUA - KHEN THƯỞNG
            </span>
          </h1>
        </div>

        {/* Right column: Login Card (proportional size with refined ambient light border) */}
        <div className="relative flex items-center justify-center">
          <div aria-hidden="true" className={styles.halo} />
          <div className={`relative w-full max-w-sm sm:max-w-[24.5rem] ${styles.appear}`}>
            <div className={styles.frame}>
              <div className="relative z-10 overflow-hidden rounded-[calc(1.65rem-1.5px)] bg-white px-6 py-6 sm:px-7 sm:py-7 shadow-xl">
                <div aria-hidden="true" className="absolute inset-x-8 top-0 h-0.5 bg-linear-to-r from-transparent via-amber-300 to-transparent" />
                
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-blue-700 to-blue-900 text-white shadow-md shadow-blue-900/30 ring-2 ring-blue-100">
                    <LogIn size={20} aria-hidden="true" />
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-blue-950">
                      <Sparkles size={9} />
                    </span>
                  </span>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Đăng nhập</h2>
                  <span aria-hidden="true" className="h-0.5 w-7 rounded-full bg-amber-400" />
                </div>

                <div className="mt-4">
                  <LoginForm />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
