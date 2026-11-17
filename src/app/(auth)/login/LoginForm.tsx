"use client";
import Link from "next/link";
import RequiredMark from "@/components/common/RequiredMark";


import styles from "./login.module.css";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { loginAction, type LoginActionState } from "./actions";
import ActionFeedback from "@/components/shared/ActionFeedback";

const initialState: LoginActionState = {
  ok: false,
  message: "",
};

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50/90 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-600 focus:bg-white focus:ring-3 focus:ring-blue-500/15";

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.ok && state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.ok, state.redirectTo]);

  const isSubmitting = pending || (state.ok && Boolean(state.redirectTo));

  return (
    <form action={formAction} className="space-y-3.5">
      <ActionFeedback pending={pending} message={state.message} ok={state.ok} />
      <div>
        <label htmlFor="login-mssv" className="mb-1.5 block text-xs font-semibold text-slate-700">
          MSSV
          <RequiredMark required={true} />
        </label>

        <div className="group relative">
          <UserRound
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-700"
          />
          <input
            id="login-mssv"
            name="mssv"
            required
            className={inputClass}
            placeholder="Nhập MSSV"
            autoComplete="username"
          />
        </div>
      </div>

      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-slate-700">
          Mật khẩu
          <RequiredMark required={true} />
        </label>

        <div className="group relative">
          <LockKeyhole
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-700"
          />
          <input
            id="login-password"
            name="password"
            required
            type={showPassword ? "text" : "password"}
            className={`${inputClass} pr-11`}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(value => !value)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={showPassword}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="text-right">
        <Link href="/forgot-password" className="text-xs font-semibold text-blue-800 hover:underline">
          Quên mật khẩu?
        </Link>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={styles.submit}
      >
        {isSubmitting ? <LoaderCircle size={16} className="motion-safe:animate-spin" /> : <LogIn size={16} />}
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
