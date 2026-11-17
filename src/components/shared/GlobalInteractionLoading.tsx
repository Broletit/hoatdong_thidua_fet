"use client";

import { useEffect, useRef, useState } from "react";

const MINIMUM_VISIBLE_MS = 250;
const INTERACTION_DURATION_MS = 600;
const MAXIMUM_VISIBLE_MS = 15_000;

export default function GlobalInteractionLoading() {
  const [visible, setVisible] = useState(false);
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    }

    function start(duration?: number) {
      clearTimers();
      startedAt.current = Date.now();
      setVisible(true);

      const requestedDuration = duration ?? MAXIMUM_VISIBLE_MS;
      safetyTimer.current = setTimeout(() => setVisible(false), requestedDuration);
    }

    function stop() {
      if (!startedAt.current) return;
      const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - startedAt.current));
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => {
        setVisible(false);
        startedAt.current = 0;
      }, remaining);
    }

    function handleTransitionStart() {
      start(30_000);
    }

    function handleTransitionStop() {
      stop();
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const control = target.closest("a, button, [role='button']");
      if (!control || control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") return;
      if (control.hasAttribute("data-no-loading")) return;

      if (control instanceof HTMLAnchorElement) {
        if (control.target === "_blank" || control.hasAttribute("download")) return;
        const destination = new URL(control.href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        if (
          destination.href === window.location.href ||
          (destination.hash && destination.pathname === window.location.pathname && destination.search === window.location.search)
        )
          return;

        const currentUrl = window.location.href;
        start();
        const watcher = window.setInterval(() => {
          if (window.location.href !== currentUrl) {
            window.clearInterval(watcher);
            stop();
          }
        }, 50);
        window.setTimeout(() => window.clearInterval(watcher), MAXIMUM_VISIBLE_MS);
        return;
      }
    }

    function handleSubmit() {
      start(INTERACTION_DURATION_MS);
    }

    function handlePageReady() {
      stop();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageReady);
    window.addEventListener("popstate", handlePageReady);
    window.addEventListener("app:transition", handleTransitionStart);
    window.addEventListener("app:transition:stop", handleTransitionStop);

    return () => {
      clearTimers();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageReady);
      window.removeEventListener("popstate", handlePageReady);
      window.removeEventListener("app:transition", handleTransitionStart);
      window.removeEventListener("app:transition:stop", handleTransitionStop);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/15 transition-opacity duration-200"
      role="status"
      aria-label="Đang tải dữ liệu"
    >
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 shadow-2xl shadow-blue-950/20 ring-1 ring-slate-200/90">
        {/* Vòng xoay xanh dương thanh thoát */}
        <div
          className="absolute inset-2 rounded-full border-2 border-slate-100 border-t-blue-600 border-r-blue-500 animate-spin"
          style={{ animationDuration: "0.85s" }}
        />

        {/* Vòng phụ sắc vàng đảo chiều nhẹ nhàng */}
        <div
          className="absolute inset-3.5 rounded-full border-2 border-transparent border-b-amber-400 border-l-amber-300 animate-spin"
          style={{ animationDirection: "reverse", animationDuration: "1.2s" }}
        />

        {/* Điểm nhấn tâm sáng */}
        <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_6px_#2563eb]" />
      </div>
    </div>
  );
}
