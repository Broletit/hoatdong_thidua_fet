"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, KeyRound, UserRound, Shuffle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { logoutAction } from "@/app/(auth)/logout/actions";
import { switchLoginContext } from "@/server/actions/auth/switchLoginContext";
import {
  getAvailableLoginContexts,
  getUiLabelByLoginContext,
  type LoginRoleContext,
} from "@/server/auth/role-context";
import ActionFeedback from "@/components/shared/ActionFeedback";
import MobileNavigation from "./MobileNavigation";
import { triggerAppTransition, hideAppTransition } from "@/lib/events/appTransition";

function getProfileHref(loginContext: string) {
  if (loginContext === "class_officer") return "/dashboard/class-officer/profile";
  if (loginContext === "faculty_officer") return "/dashboard/faculty-officer/profile";
  return "/dashboard/student/profile";
}

function getNotificationHref(loginContext: string) {
  if (loginContext === "admin") return "/dashboard/admin/notifications";
  if (loginContext === "class_officer") return "/dashboard/class-officer/notifications";
  if (loginContext === "faculty_officer") return "/dashboard/faculty-officer/notifications";
  return "/dashboard/student/notifications";
}

export default function Topbar({
  fullName,
  role,
  roles,
  loginContext,
  roleLabel,
  emailMissing = false,
}: {
  fullName: string;
  role: string;
  roles?: string[];
  loginContext: string;
  roleLabel: string;
  emailMissing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    let running = false;
    let queued = false;
    async function refreshCount() {
      if (running) { queued = true; return; }
      running = true;
      try {
        const response = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json() as {count:number};
          if (active) setUnreadCount(data.count);
        }
      } catch {} finally {
        running = false;
        if (active && queued) { queued = false; void refreshCount(); }
      }
    }
    void refreshCount();
    const timer = window.setInterval(refreshCount, 15000);
    window.addEventListener('focus', refreshCount);
    window.addEventListener('app:notifications-updated', refreshCount);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
      window.removeEventListener('app:notifications-updated', refreshCount);
    };
  }, [pathname]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [switchingContext, setSwitchingContext] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const contexts = getAvailableLoginContexts(roles?.length ? roles : role);
  const canSwitch = contexts.length > 1;

  function handleLogout() {
    setIsLoggingOut(true);
    triggerAppTransition();
    startTransition(async () => {
      try {
        const result = await logoutAction();
        window.location.assign(result?.redirectTo || "/login");
      } catch {
        window.location.assign("/login");
      }
    });
  }

  function handleSwitch(nextContext: LoginRoleContext) {
    setSwitchingContext(nextContext);
    triggerAppTransition();
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("loginContext", nextContext);
        const result = await switchLoginContext(formData);
        if (!result.ok) {
          hideAppTransition();
          setSwitchingContext(null);
          if (result.redirectTo) {
            window.location.assign(result.redirectTo);
            return;
          }
          setError(result.message || "Không thể chuyển giao diện.");
          return;
        }
        if (result.redirectTo) {
          setOpen(false);
          window.location.assign(result.redirectTo);
        }
      } catch (caught) {
        hideAppTransition();
        setSwitchingContext(null);
        setError(caught instanceof Error ? caught.message : "Không thể chuyển giao diện.");
      }
    });
  }

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-1 border-b border-blue-100 bg-white px-2 py-2 shadow-[0_4px_18px_rgba(30,58,138,0.07)] sm:gap-4 sm:px-6 sm:py-2.5">
      <ActionFeedback pending={pending} message={error} ok={false} />
      <MobileNavigation role={loginContext} emailMissing={emailMissing} />
      <p className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 sm:block">Xin chào, <span className="font-semibold text-slate-800">{fullName}</span>!</p>
      <div className="relative ml-auto flex shrink-0 items-center gap-1 sm:gap-3" ref={menuRef}>
        <Link
          href={getNotificationHref(loginContext)}
          aria-label={`Mở thông báo${unreadCount ? `, ${unreadCount} thông báo chưa đọc` : ''}`}
          className="relative rounded-xl bg-slate-50 p-2.5 text-slate-600 transition hover:bg-amber-100 hover:text-amber-800"
        >
          <Bell size={18} />
          {unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">{unreadCount}</span> : null}
        </Link>
        <span className="inline-flex max-w-28 items-center rounded-full bg-amber-100 px-2 py-1 text-center text-xs font-medium text-amber-700 sm:max-w-none sm:px-3">
          {roleLabel}
        </span>

        <div className="flex items-center rounded-2xl bg-white p-1 sm:px-2 sm:py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.10)] shadow-slate-200/60">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-xl px-1.5 py-1 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-expanded={open}
            aria-label="Mở menu tài khoản"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-900 text-sm font-semibold text-white shadow-xs">
              {fullName?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <ChevronDown
              size={18}
              className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180 text-blue-700" : ""}`}
            />
          </button>
        </div>

        {open ? (
          <div className="absolute right-0 top-full mt-2 max-h-[calc(100dvh-6rem)] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.15)] ring-1 ring-slate-100">
            <div className="flex flex-col py-2">
              {!roles?.includes("admin") && role !== "admin" && loginContext !== "student" ? (
                <Link
                  href={getProfileHref(loginContext)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <UserRound size={16} />
                  <span>Thông tin cá nhân</span>
                </Link>
              ) : null}

              {canSwitch ? (
                <div className="border-y border-slate-100 py-2">
                  <div className="flex items-center gap-2 px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Shuffle size={14} />
                    Chuyển giao diện
                  </div>

                  {contexts.map((context) => (
                    <button
                      key={context}
                      type="button"
                      disabled={pending || isLoggingOut || Boolean(switchingContext) || context === loginContext}
                      onClick={() => handleSwitch(context)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:bg-blue-50 disabled:text-blue-700"
                    >
                      <span className="flex items-center gap-2">
                        {switchingContext === context ? (
                          <LoaderCircle size={14} className="animate-spin text-blue-700" />
                        ) : null}
                        <span>{getUiLabelByLoginContext(context)}</span>
                      </span>
                      {context === loginContext ? (
                        <span className="text-xs font-semibold">Đang dùng</span>
                      ) : switchingContext === context ? (
                        <span className="text-xs font-medium text-blue-600">Đang chuyển...</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <Link
                href="/change-password"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <KeyRound size={16} />
                <span>Đổi mật khẩu</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                disabled={pending || isLoggingOut}
                className="flex items-center gap-2 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {isLoggingOut ? (
                  <LoaderCircle size={16} className="animate-spin text-red-600" />
                ) : (
                  <LogOut size={16} />
                )}
                <span>{isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
