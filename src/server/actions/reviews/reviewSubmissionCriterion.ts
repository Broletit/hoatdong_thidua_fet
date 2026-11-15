"use server";

import { revalidatePath } from "next/cache";
import { requireLogin } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import { evaluateSubmission } from "@/server/submissions/evaluateSubmission";
import { assertSubmissionReviewAccess } from "@/server/auth/submissionReviewAccess";

export async function reviewSubmissionCriterion(submissionId:number,criteriaCode:string,decision:"pass"|"fail",evidenceUnitId?:number){
  const user=await requireLogin();
  const actingRole=user.loginContext??user.role;
  const db=getDatabase();
  if(!["pass","fail"].includes(decision))throw new Error("Kết quả tiêu chí không hợp lệ.");
  const row=(await db.first(`SELECT s.status,s.class_id,i.code,i.is_required,GREATEST(1,COALESCE(i.required_count,1)) required_count,e.type event_type,
    CASE WHEN e.status IN ('published','closed') AND CAST(e.end_at AS DATETIME(3))>=CURRENT_TIMESTAMP(3) THEN 1 ELSE 0 END review_open,
    EXISTS(SELECT 1 FROM submission_ready_files sf WHERE sf.submission_id=s.id AND sf.criteria_code=i.code) has_file,
    EXISTS(SELECT 1 FROM submission_items si WHERE si.submission_id=s.id AND si.criteria_code=i.code AND TRIM(COALESCE(si.content_text,''))<>'') has_note,
    EXISTS(SELECT 1 FROM submission_auto_results ar WHERE ar.submission_id=s.id AND ar.criteria_code=i.code AND ar.passed=1) auto_passed
    FROM submissions s
    INNER JOIN events e ON e.id=s.event_id
    INNER JOIN event_criteria_items i ON i.event_id=s.event_id AND i.code=?
    WHERE s.id=? LIMIT 1`, [criteriaCode, submissionId])) as {status:string;class_id:number;code:string;required_count:number;event_type:string;review_open:number;has_file:number;has_note:number;auto_passed:number}|undefined;
  if(!row)throw new Error("Không tìm thấy tiêu chí trong hồ sơ.");
  (await assertSubmissionReviewAccess(db, user, row, true));
  const round=row.status==="submitted_v1"?1:row.status==="submitted_v2"?2:0;
  if(!round)throw new Error("Hồ sơ không ở trạng thái chờ duyệt.");
  if(Number(row.auto_passed)===1)throw new Error("Tiêu chí này đã đạt tự động.");
  if(!Number(row.has_file)&&!Number(row.has_note))throw new Error("Tiêu chí chưa có minh chứng để đánh giá.");
  if((round===1||round===2)&&actingRole==="faculty_officer"){
    const allowed=(await db.first(`SELECT 1 FROM faculty_class_assignments WHERE faculty_officer_id=? AND class_id=? LIMIT 1`, [user.id, row.class_id]));
    if(!allowed)throw new Error("Bạn không có quyền duyệt hồ sơ lớp này.");
  }else if(actingRole!=="admin")throw new Error("Bạn không có quyền đánh giá tiêu chí ở vòng này.");

  if (evidenceUnitId && Number.isInteger(evidenceUnitId) && evidenceUnitId > 0) {
    const unitExists = await db.first<{ id: number }>(
      `SELECT id FROM submission_evidence_units WHERE id=? AND submission_id=? AND criteria_code=? LIMIT 1`,
      [evidenceUnitId, submissionId, criteriaCode],
    );
    if (!unitExists) throw new Error("Không tìm thấy minh chứng cần đánh giá.");

    await db.execute(
      `INSERT INTO submission_evidence_reviews(submission_id,evidence_unit_id,round,reviewer_id,decision,approved_count,reviewed_at)
       VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE reviewer_id=VALUES(reviewer_id),decision=VALUES(decision),approved_count=VALUES(approved_count),reviewed_at=CURRENT_TIMESTAMP(3)`,
      [submissionId, evidenceUnitId, round, user.id, decision, decision === "pass" ? 1 : 0],
    );

    const unitStates = await db.rows<{ id: number; decision: string | null }>(`
      SELECT eu.id,
        (SELECT er.decision FROM submission_evidence_reviews er WHERE er.evidence_unit_id=eu.id AND er.round<=? ORDER BY er.round DESC LIMIT 1) AS decision
      FROM submission_evidence_units eu
      WHERE eu.submission_id=? AND eu.criteria_code=?
        AND EXISTS(SELECT 1 FROM submission_files sf WHERE sf.evidence_unit_id=eu.id AND sf.status='ready' AND sf.deleted_at IS NULL)
      ORDER BY eu.id ASC
    `, [round, submissionId, criteriaCode]);

    const reqCount = Math.max(1, Number(row.required_count ?? 1));
    const passCount = unitStates.filter(u => u.decision === "pass").length;
    const failCount = unitStates.filter(u => u.decision === "fail").length;
    const unreviewedCount = unitStates.filter(u => !u.decision).length;

    if (unreviewedCount === 0 && unitStates.length > 0) {
      const criterionDecision: "pass" | "fail" = passCount >= reqCount && failCount === 0 ? "pass" : "fail";
      await db.execute(
        `INSERT INTO submission_criteria_reviews(submission_id,criteria_code,round,reviewer_id,decision,reviewed_at)
         VALUES(?,?,?,?,?,CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE reviewer_id=VALUES(reviewer_id),decision=VALUES(decision),reviewed_at=CURRENT_TIMESTAMP(3)`,
        [submissionId, criteriaCode, round, user.id, criterionDecision],
      );
    } else {
      await db.execute(
        `DELETE FROM submission_criteria_reviews WHERE submission_id=? AND criteria_code=? AND round=?`,
        [submissionId, criteriaCode, round],
      );
    }
  } else {
    (await db.execute(`INSERT INTO submission_criteria_reviews(submission_id,criteria_code,round,reviewer_id,decision,reviewed_at)
      VALUES(?,?,?,?,?,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE reviewer_id=VALUES(reviewer_id),decision=VALUES(decision),reviewed_at=CURRENT_TIMESTAMP(3)`, [submissionId, criteriaCode, round, user.id, decision]));
    await db.execute(`INSERT INTO submission_evidence_reviews(submission_id,evidence_unit_id,round,reviewer_id,decision,approved_count,reviewed_at)
      SELECT eu.submission_id,eu.id,?,?,?,CASE WHEN ?='pass' THEN 1 ELSE 0 END,CURRENT_TIMESTAMP(3)
      FROM submission_evidence_units eu WHERE eu.submission_id=? AND eu.criteria_code=?
        AND EXISTS(SELECT 1 FROM submission_files sf WHERE sf.evidence_unit_id=eu.id AND sf.status='ready' AND sf.deleted_at IS NULL)
      ON DUPLICATE KEY UPDATE reviewer_id=VALUES(reviewer_id),decision=VALUES(decision),approved_count=VALUES(approved_count),reviewed_at=CURRENT_TIMESTAMP(3)`, [round,user.id,decision,decision,submissionId,criteriaCode]);
  }
  if(row.event_type==="officer")(await evaluateSubmission(submissionId));
  revalidatePath(`/dashboard/class-officer/reviews/${submissionId}`);
  revalidatePath(`/dashboard/faculty-officer/reviews/${submissionId}`);
  revalidatePath(`/dashboard/admin/officer-reviews/${submissionId}`);
  return {ok:true,message:decision==="pass"?"Đã xác nhận đạt.":"Đã đánh dấu chưa đạt."};
}
