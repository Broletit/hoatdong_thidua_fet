import { NextResponse } from "next/server";
import { requireLogin } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import {
  buildSubmissionDocx,
  type ExportCriterionItem,
  type ExportEvidenceFile,
} from "@/server/submissions/exportSubmissionDocx";
import type { StorageKind } from "@/server/storage/types";

type SubmissionHeaderRow = {
  id: number;
  user_id: number;
  submitted_at: string | null;
  full_name: string;
  mssv: string | null;
  email: string;
  phone: string | null;
  user_cohort: number | null;
  class_id: number | null;
  class_code: string | null;
  faculty: string | null;
  intake_year: number | null;
  class_cohort: number | null;
  is_class_officer: number;
};

type CriteriaQueryRow = {
  code: string;
  title: string;
  description: string | null;
  group_code: string;
  group_title: string;
  content_text: string | null;
  auto_message: string | null;
};

type FileQueryRow = {
  id: number;
  criteria_code: string;
  evidence_unit_id: number | null;
  file_name: string;
  mime_type: string | null;
  object_key: string;
  storage_provider: string;
};

type UnitQueryRow = {
  id: number;
  criteria_code: string;
  note: string | null;
};

/**
 * Chuẩn hóa chuỗi tiếng Việt thành dạng ASCII an toàn cho tên file tải xuống.
 */
function sanitizeAsciiFilePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * API GET /api/submissions/[id]/export
 * Xuất hồ sơ xét danh hiệu của sinh viên ra file Word (.docx) dựa trên mẫu chuẩn,
 * có kiểm tra phân quyền (admin, sinh viên chủ hồ sơ, hoặc cán bộ khoa phụ trách lớp).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireLogin();
  const { id } = await context.params;
  const db = getDatabase();
  const submissionId = await db.resolveRouteRecordId(id);
  if (!Number.isFinite(submissionId) || submissionId <= 0) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  const submission = (await db.first(
    `
    SELECT
      s.id,
      s.user_id,
      s.submitted_at,
      u.full_name,
      u.mssv,
      u.email,
      u.phone,
      u.cohort AS user_cohort,
      cm.class_id,
      c.code AS class_code,
      c.faculty,
      c.intake_year,
      c.cohort AS class_cohort,
      CASE WHEN u.role = 'class_officer' THEN 1 ELSE 0 END AS is_class_officer
    FROM submissions s
    INNER JOIN users u ON u.id = s.user_id
    LEFT JOIN class_members cm ON cm.user_id = u.id AND cm.left_at IS NULL
    LEFT JOIN classes c ON c.id = cm.class_id
    WHERE s.id = ?
    LIMIT 1
    `,
    [submissionId],
  )) as SubmissionHeaderRow | undefined;

  if (!submission) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ." }, { status: 404 });
  }

  // Kiểm tra quyền truy cập và phạm vi dữ liệu phía server
  let authorized = false;
  if (user.role === "admin") {
    authorized = true;
  } else if (submission.user_id === user.id) {
    authorized = true;
  } else if (user.role === "faculty_officer" && submission.class_id) {
    const assignment = await db.first(
      `SELECT 1 FROM faculty_class_assignments WHERE faculty_officer_id = ? AND class_id = ? LIMIT 1`,
      [user.id, submission.class_id],
    );
    authorized = Boolean(assignment);
  }

  if (!authorized) {
    return NextResponse.json({ error: "Bạn không có quyền xuất hồ sơ này." }, { status: 403 });
  }

  const criteriaRows = (await db.rows(
    `
    SELECT
      i.code,
      i.title,
      i.description,
      g.code AS group_code,
      g.title AS group_title,
      si.content_text,
      ar.message AS auto_message
    FROM submissions s
    INNER JOIN event_criteria_items i ON i.event_id = s.event_id
    INNER JOIN event_criteria_groups g ON g.event_id = i.event_id AND g.code = i.group_code
    LEFT JOIN submission_items si ON si.submission_id = s.id AND si.criteria_code = i.code
    LEFT JOIN submission_auto_results ar ON ar.submission_id = s.id AND ar.criteria_code = i.code
    WHERE s.id = ?
    ORDER BY g.sort_order ASC, i.sort_order ASC, i.id ASC
    `,
    [submissionId],
  )) as CriteriaQueryRow[];

  const unitRows = (await db.rows(
    `
    SELECT id, criteria_code, note
    FROM submission_evidence_units
    WHERE submission_id = ?
    ORDER BY id ASC
    `,
    [submissionId],
  )) as UnitQueryRow[];

  const fileRows = (await db.rows(
    `
    SELECT id, criteria_code, evidence_unit_id, file_name, mime_type, object_key, storage_provider
    FROM submission_files
    WHERE submission_id = ? AND status = 'ready' AND deleted_at IS NULL
    ORDER BY id ASC
    `,
    [submissionId],
  )) as FileQueryRow[];

  const criteria: ExportCriterionItem[] = criteriaRows.map((row) => ({
    code: row.code,
    title: row.title,
    description: row.description,
    groupCode: row.group_code,
    groupTitle: row.group_title,
    contentText: row.content_text,
    autoMessage: row.auto_message,
    units: unitRows
      .filter((u) => u.criteria_code === row.code)
      .map((u) => ({ id: Number(u.id), note: u.note })),
    files: fileRows
      .filter((f) => f.criteria_code === row.code)
      .map((f): ExportEvidenceFile => ({
        id: Number(f.id),
        fileName: String(f.file_name ?? "minh-chung"),
        mimeType: String(f.mime_type ?? "application/octet-stream"),
        objectKey: String(f.object_key ?? ""),
        storageProvider: (f.storage_provider === "onedrive" ? "onedrive" : "local") as StorageKind,
        unitId: f.evidence_unit_id ? Number(f.evidence_unit_id) : null,
      })),
  }));

  const mssv = submission.mssv?.trim() || `SV${submission.user_id}`;
  const classAndFaculty = submission.class_code
    ? `${submission.class_code} - Công nghệ Điện tử`
    : "Công nghệ Điện tử";
  const docxBuffer = await buildSubmissionDocx({
    student: {
      fullName: submission.full_name,
      mssv,
      studentYear: "",
      classAndFaculty,
      unionPosition: submission.is_class_officer ? "Cán bộ lớp / Chi hội" : "",
      phone: submission.phone?.trim() || "",
      email: submission.email,
    },
    criteria,
  });

  const utf8Name = `SV5T_${mssv}_${submission.full_name.trim()}.docx`.replace(/[/\\?%*:|"<>]/g, "_");
  const asciiName = `SV5T_${sanitizeAsciiFilePart(mssv)}_${sanitizeAsciiFilePart(submission.full_name) || "HoSo"}.docx`;

  return new NextResponse(new Uint8Array(docxBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
      "Cache-Control": "no-store",
    },
  });
}
