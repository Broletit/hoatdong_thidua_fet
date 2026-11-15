"use client";

import { useState } from "react";

type ExpandableTextProps = {
  text: string;
  maxChars?: number;
  className?: string;
};

/**
 * Hiển thị văn bản dài gọn gàng: tự động rút gọn kèm nút "Xem thêm" nếu vượt ngưỡng ký tự
 * và cho phép mở toàn bộ nội dung rồi đổi nút thành "Thu gọn".
 */
export default function ExpandableText({
  text,
  maxChars = 150,
  className = "",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const normalized = text.trim();
  const lineCount = normalized.split(/\r?\n/).length;
  const needsTruncate = normalized.length > maxChars || lineCount > 3;

  if (!needsTruncate) {
    return (
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        {text}
      </span>
    );
  }

  let preview = normalized;
  if (!expanded) {
    const firstLines = normalized.split(/\r?\n/).slice(0, 2).join(" ");
    const base = firstLines.length < normalized.length ? firstLines : normalized;
    if (base.length > maxChars) {
      const cut = base.slice(0, maxChars);
      const lastSpace = cut.lastIndexOf(" ");
      preview = `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
    } else {
      preview = `${base.trimEnd()}...`;
    }
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {expanded ? text : preview}{" "}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex cursor-pointer items-center font-semibold text-blue-700 hover:text-blue-800 hover:underline"
      >
        {expanded ? "Thu gọn" : "Xem thêm"}
      </button>
    </span>
  );
}
