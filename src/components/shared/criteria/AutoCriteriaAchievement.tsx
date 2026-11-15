const LEGACY_ACTIVITY_PREFIX = "Đạt tự động từ hoạt động:";
const SUGGESTION_ACTIVITY_PREFIX = "Hệ thống ghi nhận bạn đã tham gia hoạt động:";
const SUGGESTION_ACTIVITY_SUFFIX = "Hãy nộp minh chứng cho hoạt động này.";

function parseActivityTitles(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((item) => item.trim()).filter(Boolean);
    }
  } catch {
    // Hỗ trợ dữ liệu cũ được lưu bằng dấu phân cách || hoặc chuỗi thuần.
  }

  return trimmed
    .split("||")
    .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

export function buildActivitySuggestionMessage(titles: string[]) {
  const cleanTitles = titles.map((item) => item.trim()).filter(Boolean);
  if (!cleanTitles.length) return null;
  return `${SUGGESTION_ACTIVITY_PREFIX} ${cleanTitles.join(", ")}. ${SUGGESTION_ACTIVITY_SUFFIX}`;
}

export function formatAutoCriteriaMessage(
  message: string | null,
  matchedActivityTitles?: string | null,
) {
  const titles = matchedActivityTitles ? parseActivityTitles(matchedActivityTitles) : [];
  if (titles.length > 0) return buildActivitySuggestionMessage(titles);

  const normalizedMessage = String(message ?? "").trim();
  if (!normalizedMessage) return null;
  if (normalizedMessage.startsWith(LEGACY_ACTIVITY_PREFIX)) {
    const rawRest = normalizedMessage.slice(LEGACY_ACTIVITY_PREFIX.length).replace(/\.$/, "");
    const messageTitles = parseActivityTitles(rawRest);
    return messageTitles.length > 0
      ? buildActivitySuggestionMessage(messageTitles)
      : normalizedMessage;
  }

  return normalizedMessage;
}

export function AutoCriteriaMessage({
  message,
  matchedActivityTitles,
}: {
  message: string | null;
  matchedActivityTitles?: string | null;
}) {
  const normalizedMessage = formatAutoCriteriaMessage(message, matchedActivityTitles);
  return normalizedMessage ? (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-700">
      {normalizedMessage}
    </div>
  ) : null;
}

export function AutoCriteriaBadge() {
  return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Đã đạt</span>;
}
