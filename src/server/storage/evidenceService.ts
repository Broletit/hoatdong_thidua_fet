import { getDatabase } from "../db/mysql";
import { assertEvidenceEditable } from "../submissions/assertEvidenceEditable";
import { validateEvidenceCriteria } from "../submissions/validateEvidenceCriteria";
import { evaluateSubmissionAuto } from "../events/evaluateSubmissionAuto";
import { evaluateSubmission } from "../submissions/evaluateSubmission";
import { createEvidenceKey } from "./objectKey";
import { validateEvidenceFile } from "./filePolicy";
import { getStorageProvider } from "./storageFactory";
import type { StorageKind, ObjectMetadata } from "./types";

export type EvidenceUser = {id: number; role: string; loginContext?: string};
export type EvidenceSubmission = {id: number; user_id: number; event_id: number; type: "student" | "officer"};
export type EvidenceObject = {object_key: string; storage_provider: StorageKind};
export async function authorizeEvidenceWrite(user: EvidenceUser, submissionId: number, criteriaCodes: string[]) {
  const db = getDatabase();
  const row = await db.first<EvidenceSubmission>("SELECT s.id,s.user_id,s.event_id,e.type FROM submissions s JOIN events e ON e.id=s.event_id WHERE s.id=?", [submissionId]);
  if (!row || row.user_id !== user.id) throw new Error("Bạn không có quyền cập nhật minh chứng của hồ sơ này.");
  const context = user.loginContext || "student";
  if (row.type === "student" ? context !== "student" : !["admin", "class_officer", "faculty_officer"].includes(context) || !["admin", "class_officer", "faculty_officer"].includes(user.role)) throw new Error("Vai trò hiện tại không được phép cập nhật hồ sơ này.");
  await assertEvidenceEditable(db, submissionId, user.id, row.type);
  await validateEvidenceCriteria(db, row.event_id, criteriaCodes);
  return row;
}
export async function createEvidenceUnitWithFile(submissionId: number, criteriaCode: string, userId: number, claimedCount: number, note: string | null, file: {originalName: string; key: string; provider: StorageKind; metadata: ObjectMetadata}) {
  const db = getDatabase();
  const unit = await db.execute(`INSERT INTO submission_evidence_units(submission_id,criteria_code,source_type,note,claimed_count,created_by) VALUES(?,?,'manual',?,?,?)`, [submissionId, criteriaCode, note, claimedCount, userId]);
  const result = await db.execute(`INSERT INTO submission_files(submission_id,criteria_code,evidence_unit_id,file_name,original_name,object_key,storage_provider,mime_type,size_bytes,status,uploaded_by,etag,checksum_sha256) VALUES(?,?,?,?,?,?,?,?,?,'ready',?,?,?)`, [submissionId, criteriaCode, unit.insertId, file.originalName, file.originalName, file.key, file.provider, file.metadata.mimeType, file.metadata.size, userId, file.metadata.etag || null, file.metadata.checksumSha256 || null]);
  return {id: result.insertId, evidenceUnitId: unit.insertId};
}
export async function removeEvidenceObjects(objects: EvidenceObject[]) {
  for (const object of objects) {
    try {
      await getStorageProvider(object.storage_provider).delete(object.object_key);
      await getDatabase().execute("UPDATE submission_files SET object_deleted_at=CURRENT_TIMESTAMP(3) WHERE object_key=? AND storage_provider=? AND status='deleted'", [object.object_key, object.storage_provider]);
    }
    catch { console.warn("Evidence cleanup deferred; deleted metadata remains available for cleanup retry."); }
  }
}
export async function refreshEvidenceEvaluation(submissionId: number) {
  await evaluateSubmissionAuto(submissionId);
  await evaluateSubmission(submissionId);
}
export async function getLockedPassedCriteriaCodes(db: ReturnType<typeof getDatabase>, submissionId: number) {
  const rows = await db.rows<{ code: string }>(`
    SELECT i.code
    FROM submissions s
    INNER JOIN event_criteria_items i ON i.event_id = s.event_id
    LEFT JOIN submission_auto_results ar ON ar.submission_id = s.id AND ar.criteria_code = i.code
    WHERE s.id = ?
      AND (
        ar.passed = 1
        OR (SELECT cr.decision FROM submission_criteria_reviews cr WHERE cr.submission_id = s.id AND cr.criteria_code = i.code ORDER BY cr.round DESC LIMIT 1) = 'pass'
      )
  `, [submissionId]);
  return new Set(rows.map(row => row.code));
}
export async function getLockedPassedUnitIds(db: ReturnType<typeof getDatabase>, submissionId: number) {
  const rows = await db.rows<{ id: number }>(`
    SELECT eu.id
    FROM submission_evidence_units eu
    WHERE eu.submission_id = ?
      AND (
        SELECT er.decision
        FROM submission_evidence_reviews er
        WHERE er.evidence_unit_id = eu.id
        ORDER BY er.round DESC
        LIMIT 1
      ) = 'pass'
  `, [submissionId]);
  return new Set(rows.map(row => Number(row.id)));
}
export async function saveEvidence(user: EvidenceUser, submissionId: number, formData: FormData, kind: "student" | "officer") {
  const db = getDatabase();
  const codes = formData.getAll("criteriaCode").map(String).map(value => value.trim()).filter(Boolean);
  const submission = await authorizeEvidenceWrite(user, submissionId, codes);
  if (submission.type !== kind) throw new Error("Loại hồ sơ không hợp lệ.");
  const lockedPassedCodes = await getLockedPassedCriteriaCodes(db, submissionId);
  const lockedPassedUnitIds = await getLockedPassedUnitIds(db, submissionId);
  const criteriaRows = codes.length
    ? await db.rows<{ code: string; evidence_type: string; required_count: number }>(`SELECT code, evidence_type, GREATEST(1, COALESCE(required_count, 1)) AS required_count FROM event_criteria_items WHERE event_id=? AND code IN (${codes.map(() => "?").join(",")})`, [submission.event_id, ...codes])
    : [];
  const evidenceTypeByCode = new Map(criteriaRows.map(item => [item.code, item.evidence_type]));
  const requiredCountByCode = new Map(criteriaRows.map(item => [item.code, Math.max(1, Number(item.required_count ?? 1))]));

  const existingNotes = codes.length
    ? await db.rows<{criteria_code:string;content_text:string|null}>(`SELECT criteria_code,content_text FROM submission_items WHERE submission_id=? AND criteria_code IN (${codes.map(() => "?").join(",")})`, [submissionId, ...codes])
    : [];
  const existingByCode = new Map(existingNotes.map(item => [item.criteria_code, String(item.content_text ?? "").trim()]));

  type ExistingUnitRow = { id: number; criteria_code: string; note: string | null; has_file: number };
  const existingUnits = codes.length
    ? await db.rows<ExistingUnitRow>(`
        SELECT eu.id, eu.criteria_code, eu.note,
          EXISTS(SELECT 1 FROM submission_files sf WHERE sf.evidence_unit_id = eu.id AND sf.status = 'ready' AND sf.deleted_at IS NULL) AS has_file
        FROM submission_evidence_units eu
        WHERE eu.submission_id = ?
          AND eu.criteria_code IN (${codes.map(() => "?").join(",")})
        ORDER BY eu.id ASC
      `, [submissionId, ...codes])
    : [];
  const existingUnitsByCode = new Map<string, ExistingUnitRow[]>();
  for (const unit of existingUnits) {
    existingUnitsByCode.set(unit.criteria_code, [...(existingUnitsByCode.get(unit.criteria_code) ?? []), unit]);
  }

  const changedManualCodes: string[] = [];
  type SlotNoteChange = { code: string; slot: number; unitId: number; note: string };
  const changedUnitNotes: SlotNoteChange[] = [];
  type PreparedSlotFile = { code: string; slot: number; unitId: number | null; note: string; originalName: string; key: string; metadata: ObjectMetadata };
  const prepared: PreparedSlotFile[] = [];
  const replacedObjects: EvidenceObject[] = [];
  const provider = getStorageProvider();
  let committed = false;

  try {
    for (const code of codes) {
      const evidenceType = evidenceTypeByCode.get(code) ?? "both";
      const reqCount = requiredCountByCode.get(code) ?? 1;
      const isCriterionLocked = lockedPassedCodes.has(code);

      if (evidenceType === "manual") {
        // Hỗ trợ cả note_${code} hoặc nhiều hàng note_${code}_${slot}
        const slotNotes: string[] = [];
        let hasSlotFields = false;
        for (let slot = 0; slot < reqCount; slot++) {
          if (formData.has(`note_${code}_${slot}`)) {
            hasSlotFields = true;
            slotNotes.push(String(formData.get(`note_${code}_${slot}`) || "").trim());
          }
        }
        const nextNote = hasSlotFields
          ? slotNotes.filter(Boolean).join("\n")
          : String(formData.get(`note_${code}`) || "").trim();
        const prevNote = existingByCode.get(code) ?? "";

        if (isCriterionLocked) {
          if ((hasSlotFields || formData.has(`note_${code}`)) && nextNote !== prevNote) {
            throw new Error("Tiêu chí đã được duyệt đạt, không thể chỉnh sửa hoặc tải lại minh chứng.");
          }
          continue;
        }
        const uploadedFile = formData.get(`file_${code}`) || formData.get(`file_${code}_0`);
        if (uploadedFile instanceof File && uploadedFile.size > 0) {
          throw new Error(`Tiêu chí ${code} chỉ nhập mô tả, không cho phép tải tệp minh chứng.`);
        }
        if (nextNote.length > 0 && nextNote !== prevNote) {
          changedManualCodes.push(code);
        }
        continue;
      }

      // Tiêu chí Minh chứng ("both" / "auto") - duyệt qua các slot 0 .. reqCount - 1
      const currentUnits = existingUnitsByCode.get(code) ?? [];
      const hasIndexedFields = formData.has(`note_${code}_0`) || formData.has(`file_${code}_0`) || formData.has(`unitId_${code}_0`);

      for (let slot = 0; slot < reqCount; slot++) {
        if (!hasIndexedFields && slot > 0) break;
        const rawNote = hasIndexedFields
          ? formData.get(`note_${code}_${slot}`)
          : formData.get(`note_${code}`);
        const rawFile = hasIndexedFields
          ? formData.get(`file_${code}_${slot}`)
          : formData.get(`file_${code}`);
        const existingUnit = currentUnits[slot] ?? null;
        const unitId = existingUnit ? Number(existingUnit.id) : null;
        const isUnitLocked = isCriterionLocked || (unitId !== null && lockedPassedUnitIds.has(unitId));

        const nextNote = String(rawNote ?? "").trim();
        const prevNote = existingUnit ? String(existingUnit.note ?? "").trim() : (slot === 0 && !currentUnits.length ? (existingByCode.get(code) ?? "") : "");
        const hasNewFile = rawFile instanceof File && rawFile.size > 0;

        if (isUnitLocked) {
          if (hasNewFile || (rawNote !== null && nextNote !== prevNote)) {
            throw new Error("Minh chứng đã được duyệt đạt, không thể chỉnh sửa hoặc tải lại minh chứng.");
          }
          continue;
        }

        if (hasNewFile) {
          const { extension, mimeType, buffer } = await validateEvidenceFile(rawFile);
          const key = createEvidenceKey(submission.event_id, submissionId, `${code}_${slot + 1}`, extension);
          let metadata: ObjectMetadata;
          try { metadata = await provider.put(key, buffer, mimeType); }
          catch (error) { await provider.delete(key).catch(() => {}); throw error; }
          prepared.push({ code, slot, unitId, note: nextNote, originalName: rawFile.name, key, metadata });
        } else if (rawNote !== null && nextNote !== prevNote) {
          if (existingUnit && Number(existingUnit.has_file) === 1) {
            changedUnitNotes.push({ code, slot, unitId: Number(existingUnit.id), note: nextNote });
          } else if (nextNote.length > 0) {
            throw new Error(`Vui lòng tải tệp minh chứng cho tiêu chí ${code}${reqCount > 1 ? ` (dòng ${slot + 1})` : ""} trước khi lưu mô tả.`);
          }
        }
      }
    }

    if (!changedManualCodes.length && !changedUnitNotes.length && !prepared.length) {
      throw new Error("Bạn chưa thêm hoặc thay đổi minh chứng nào để lưu.");
    }

    await db.withTransaction(async () => {
      await authorizeEvidenceWrite(user, submissionId, codes);
      const affectedCodes = new Set<string>([
        ...changedManualCodes,
        ...changedUnitNotes.map(item => item.code),
        ...prepared.map(item => item.code),
      ]);

      for (const code of changedManualCodes) {
        const reqCount = requiredCountByCode.get(code) ?? 1;
        const slotNotes: string[] = [];
        let hasSlotFields = false;
        for (let slot = 0; slot < reqCount; slot++) {
          if (formData.has(`note_${code}_${slot}`)) {
            hasSlotFields = true;
            slotNotes.push(String(formData.get(`note_${code}_${slot}`) || "").trim());
          }
        }
        const text = hasSlotFields
          ? slotNotes.filter(Boolean).join("\n")
          : String(formData.get(`note_${code}`) || "").trim();
        await db.execute(`INSERT INTO submission_items(submission_id,criteria_code,content_text,updated_at)
          VALUES(?,?,?,CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE content_text=VALUES(content_text),updated_at=CURRENT_TIMESTAMP(3)`, [submissionId, code, text]);
      }

      for (const item of changedUnitNotes) {
        await db.execute(`UPDATE submission_evidence_units SET note=?, claimed_count=1, updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND submission_id=?`, [item.note || null, item.unitId, submissionId]);
        await db.execute(`DELETE FROM submission_evidence_reviews WHERE evidence_unit_id=?`, [item.unitId]);
      }

      for (const file of prepared) {
        if (file.unitId !== null) {
          replacedObjects.push(...await db.rows<EvidenceObject>(`SELECT object_key,storage_provider FROM submission_files WHERE submission_id=? AND evidence_unit_id=? AND status='ready' AND deleted_at IS NULL`, [submissionId, file.unitId]));
          await db.execute(`UPDATE submission_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3) WHERE submission_id=? AND evidence_unit_id=? AND status='ready'`, [submissionId, file.unitId]);
          await db.execute(`UPDATE submission_evidence_units SET note=?, claimed_count=1, updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND submission_id=?`, [file.note || null, file.unitId, submissionId]);
          await db.execute(`DELETE FROM submission_evidence_reviews WHERE evidence_unit_id=?`, [file.unitId]);
          await db.execute(`INSERT INTO submission_files(submission_id,criteria_code,evidence_unit_id,file_name,original_name,object_key,storage_provider,mime_type,size_bytes,status,uploaded_by,etag,checksum_sha256) VALUES(?,?,?,?,?,?,?,?,?,'ready',?,?,?)`, [submissionId, file.code, file.unitId, file.originalName, file.originalName, file.key, provider.kind, file.metadata.mimeType, file.metadata.size, user.id, file.metadata.etag || null, file.metadata.checksumSha256 || null]);
        } else {
          // Trường hợp có file cũ không gắn unit (legacy) khi chỉ có 1 slot
          const reqCount = requiredCountByCode.get(file.code) ?? 1;
          if (reqCount === 1 && file.slot === 0) {
            replacedObjects.push(...await db.rows<EvidenceObject>(`SELECT object_key,storage_provider FROM submission_files WHERE submission_id=? AND criteria_code=? AND evidence_unit_id IS NULL AND status='ready' AND deleted_at IS NULL`, [submissionId, file.code]));
            await db.execute(`UPDATE submission_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3) WHERE submission_id=? AND criteria_code=? AND evidence_unit_id IS NULL AND status='ready'`, [submissionId, file.code]);
          }
          await createEvidenceUnitWithFile(submissionId, file.code, user.id, 1, file.note || null, {
            originalName: file.originalName,
            key: file.key,
            provider: provider.kind,
            metadata: file.metadata,
          });
        }
      }

      if (affectedCodes.size > 0) {
        const codeList = [...affectedCodes];
        const placeholders = codeList.map(() => "?").join(",");
        await db.execute(`DELETE FROM submission_criteria_reviews WHERE submission_id=? AND criteria_code IN (${placeholders})`, [submissionId, ...codeList]);

        for (const code of codeList) {
          if ((evidenceTypeByCode.get(code) ?? "both") === "manual") continue;
          const unitNotes = await db.rows<{ note: string | null }>(`SELECT note FROM submission_evidence_units WHERE submission_id=? AND criteria_code=? ORDER BY id ASC`, [submissionId, code]);
          const combinedNote = unitNotes.map(u => String(u.note ?? "").trim()).filter(Boolean).join("\n");
          await db.execute(`INSERT INTO submission_items(submission_id,criteria_code,content_text,updated_at)
            VALUES(?,?,?,CURRENT_TIMESTAMP(3))
            ON DUPLICATE KEY UPDATE content_text=VALUES(content_text),updated_at=CURRENT_TIMESTAMP(3)`, [submissionId, code, combinedNote]);
        }
      }

      await db.execute("UPDATE submissions SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=?", [submissionId]);
      await refreshEvidenceEvaluation(submissionId);
    });
    committed = true;
    await removeEvidenceObjects(replacedObjects);
    return submission;
  } finally {
    if (!committed) await removeEvidenceObjects(prepared.map(file => ({object_key:file.key, storage_provider:provider.kind})));
  }
}
