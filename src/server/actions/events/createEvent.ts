"use server";

import { assertTemplateReady } from "@/server/criteria-templates/groupRequirements";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import { getRequiredActiveTerm } from "@/server/academic-terms/getRequiredActiveTerm";

function toIsoOrNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function createEvent(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireAdminContext();
    const term = await getRequiredActiveTerm();
    const db = getDatabase();

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const type = String(formData.get("type") ?? "student").trim();
    const status = String(formData.get("status") ?? "draft").trim();
    const templateId = Number(formData.get("templateId") ?? 0);
    const allowLate = 0; // Legacy database column; no late-submission override is accepted.
    const requestedScoreMax = Number(formData.get("scoreMax") ?? 0);
    const scoreMax = type === "officer" ? requestedScoreMax : null;

    const startAt = toIsoOrNull(formData.get("startAt"));
    const endAt = toIsoOrNull(formData.get("endAt"));

    if (!title) return { ok: false, message: "Vui lòng nhập tên đợt xét." };
    if (!["student", "officer"].includes(type)) {
      return { ok: false, message: "Đối tượng xét không hợp lệ." };
    }
    if (!["draft", "published"].includes(status)) {
      return { ok: false, message: "Trạng thái đợt xét không hợp lệ." };
    }
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return { ok: false, message: "Vui lòng chọn mẫu tiêu chuẩn." };
    }
    if (type === "officer" && (!Number.isFinite(scoreMax) || Number(scoreMax) <= 0)) {
      return { ok: false, message: "Vui lòng nhập điểm tối đa lớn hơn 0 cho đợt xét cán bộ." };
    }
    if (!startAt || !endAt) {
      return { ok: false, message: "Vui lòng nhập thời gian mở và đóng nộp hồ sơ." };
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    const now = new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { ok: false, message: "Thời gian không hợp lệ." };
    }

    if (start.getTime() < now.getTime() - 60_000) {
      return { ok: false, message: "Thời gian mở nộp không được ở quá khứ." };
    }

    if (end <= start) {
      return { ok: false, message: "Thời gian đóng nộp phải sau thời gian mở nộp." };
    }

    const template = (await db.first(
      `
      SELECT id, for_type
      FROM criteria_templates
      WHERE id = ?
      LIMIT 1
      `,
      [templateId],
    )) as { id: number; for_type: string } | undefined;

    if (!template) return { ok: false, message: "Mẫu tiêu chuẩn không tồn tại." };

    if (template.for_type !== type) {
      return { ok: false, message: "Mẫu tiêu chuẩn không phù hợp với đối tượng xét." };
    }

    if (status === "published") {
      await assertTemplateReady(db, templateId);
    }

    await db.execute(
      `
      INSERT INTO events (
        title,
        description,
        type,
        status,
        start_at,
        end_at,
        allow_late,
        created_by,
        created_at,
        published_at,
        criteria_template_id,
        term_id,
        score_max
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3),
        CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
        ?, ?, ?
      )
      `,
      [title, description || null, type, status, startAt, endAt, allowLate, user.id, status, templateId, term.id, scoreMax],
    );

    revalidatePath("/dashboard/admin/events");
    revalidatePath("/dashboard/admin/events/create");

    return {
      ok: true,
      message: `Tạo đợt xét thành công cho ${term.name}.`,
    };
  } catch (error) {
    // Re-throw Next.js internal redirect/notFound signals
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_")) {
      throw error;
    }
    console.error("[createEvent] error:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Tạo đợt xét thất bại.",
    };
  }
}
