"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import MissingEmailBadge from "./MissingEmailBadge";
import SidebarGroup from "./SidebarGroup";
import { getSidebarGroups } from "./getSidebarItems";
import { getDefaultRouteByRoleContext } from "@/server/auth/role-context";

export default function MobileNavigation({ role, emailMissing = false }: { role: string; emailMissing?: boolean }) {
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const rawPathname = usePathname();
  const pathname = rawPathname.startsWith("/a/") ? `/dashboard/${role.replaceAll("_","-")}/activities` : rawPathname.startsWith("/o/") ? `/dashboard/${role.replaceAll("_","-")}/officer-activities` : rawPathname;
  const isOpen = openPathname === pathname;
  const setIsOpen = (next: boolean) => setOpenPathname(next ? pathname : null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpenPathname(null);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPathname(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        data-no-loading
        aria-label={emailMissing?"Mở menu điều hướng, cần cập nhật email khôi phục":"Mở menu điều hướng"}
        aria-haspopup="dialog"
        aria-controls="mobile-navigation"
        onClick={() => setIsOpen(true)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-blue-900 hover:bg-blue-50 lg:hidden"
      >
        <Menu size={22} />
        {emailMissing&&<MissingEmailBadge className="absolute right-0 top-0"/>}
      </button>
      {isOpen ? <div
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}
        className="fixed inset-0 z-50 flex h-dvh w-full max-w-none bg-slate-950/50 p-0"
      >
        <div className="flex h-full w-[min(20rem,85vw)] flex-col bg-blue-900 text-white shadow-xl">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
            <Link
              id="mobile-navigation-title"
              href={getDefaultRouteByRoleContext(role as never)}
              onClick={() => setIsOpen(false)}
              className="flex h-11 min-w-0 flex-1 items-center rounded-xl px-1 transition hover:bg-white/10"
              aria-label="Về trang chính"
            >
              <Image
                src="/fullLogo.png"
                alt="Khoa Công nghệ Điện tử"
                width={4111}
                height={1019}
                className="block h-10 w-auto max-w-full shrink-0 object-contain object-left"
                priority
              />
            </Link>
            <button
              type="button"
              data-no-loading
              autoFocus
              aria-label="Thu gọn menu điều hướng"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-10! w-10! min-h-10! min-w-10! shrink-0 items-center justify-center rounded-md! border-0! bg-transparent! p-0! text-white! shadow-none! transition-colors hover:bg-white/10! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200 disabled:opacity-50"
            >
              <ChevronLeft size={26} strokeWidth={2} />
            </button>
          </div>
          <nav
            aria-label="Điều hướng chính"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setIsOpen(false);
            }}
          >
            {getSidebarGroups(role).map((group) => (
              <SidebarGroup key={`${pathname}:${group.label}`} group={group} pathname={pathname} emailMissing={emailMissing} />
            ))}
          </nav>
        </div>
      </div> : null}
    </>
  );
}
