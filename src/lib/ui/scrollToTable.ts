export function scrollToTable(origin: HTMLElement | null, offset = 16) {
  if (!origin || typeof window === "undefined") return;

  const performScroll = () => {
    // 1. Reset horizontal scroll on the table container if it was scrolled horizontally
    const frame = origin.closest("[data-table-frame]") ?? origin.closest("[data-pagination-scroll-target]");
    const table = frame?.querySelector("table") ?? origin.closest("section")?.querySelector("table") ?? origin.querySelector("table");
    const tableContainer = table?.parentElement ?? (frame as HTMLElement | null);
    if (tableContainer && tableContainer.scrollLeft > 0) {
      tableContainer.scrollLeft = 0;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "instant" : "smooth";

    // 2. Find the scrolling container
    let scrollContainer: HTMLElement | null = null;
    let parent = origin.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
        scrollContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }

    if (!scrollContainer) {
      scrollContainer = document.querySelector<HTMLElement>(".dashboard-shell main, main");
    }

    if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const originRect = origin.getBoundingClientRect();
      const relativeTop = originRect.top - containerRect.top;
      const targetScrollTop = scrollContainer.scrollTop + relativeTop - offset;
      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior,
      });
      return;
    }

    // 3. Fallback to window scroll
    const originRect = origin.getBoundingClientRect();
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 60;
    const windowTop = window.scrollY + originRect.top - headerHeight - offset;
    window.scrollTo({
      top: Math.max(0, windowTop),
      behavior,
    });
  };

  performScroll();
  requestAnimationFrame(() => {
    performScroll();
    setTimeout(performScroll, 50);
  });
}

export const scrollToElement = scrollToTable;
