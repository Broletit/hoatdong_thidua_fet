/**
 * Kích hoạt hiệu ứng chờ chuyển động ở giữa trang (Transition Spinner Loader).
 * Đơn giản, mượt mà, xử lý nhanh cho các tác vụ Đăng nhập, Đăng xuất, Chuyển vai trò.
 */
export function triggerAppTransition() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:transition"));
  }
}

export function hideAppTransition() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:transition:stop"));
  }
}
