import SubmissionSupportCard from "@/components/shared/submissions/SubmissionSupportCard";
import { notFound } from "next/navigation";
import { requireFacultyOfficerContext } from "@/server/auth/guards";
import { getDatabase } from "@/server/db/mysql";
import ReviewHeader from "@/components/shared/reviews/ReviewHeader";
import ReviewHistory from "@/components/shared/reviews/ReviewHistory";
import FacultyOfficerReviewPanel from "@/components/faculty-officer/reviews/FacultyOfficerReviewPanel";
import { getSubmissionTimeline } from "@/server/submissions/getSubmissionTimeline";
import SubmissionCriteriaDetailList from "@/components/shared/submissions/SubmissionCriteriaDetailList";
import SubmissionViewOverview from "@/components/shared/submissions/SubmissionViewOverview";
import { evaluateSubmissionRequirements } from "@/server/submissions/evaluateSubmissionRequirements";
import { getPagePublicId } from "@/server/auth/publicPageRoute";
import SubmissionExportButtons from "@/components/student/submissions/SubmissionExportButtons";

type SubmissionRow = {
  id: number;
  status: string;
  event_title: string;
  student_name: string;
  mssv: string;
  class_code: string;
  submitted_at: string | null;
  updated_at: string | null;
  closes_at: string | null;
  review_round: number;
};

type CriteriaRow = {
  code: string;
  title: string;
  description: string | null;
  group_code: string;
  group_title: string;
  min_required: number;
  required_count: number;
  evidence_type: string;
  is_required: number;
  auto_passed: number | null;
  auto_message: string | null;
  matched_activity_titles: string | null;
  content_text: string | null;
  file_count: number;
  review_decision: string | null;
};

type ReviewRow = {
  round: number;
  decision: string;
  note: string | null;
  reviewer_name: string | null;
};

type FileRow = {
  id: number;
  file_name: string;
  mime_type: string;
  criteria_code: string;
};

export default async function FacultyOfficerReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ termId?: string; mode?: string }>;
}) {
  const officer = await requireFacultyOfficerContext();

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const submissionId = await getDatabase().resolveRouteRecordId(id);

  if (!Number.isFinite(submissionId) || submissionId <= 0) notFound();

  const db = getDatabase();

  const submission = (await db.first(`
      SELECT
        s.id,
        s.status,
        e.title AS event_title,
        u.full_name AS student_name,
        u.mssv,
        c.code AS class_code
        ,s.submitted_at
        ,s.updated_at
        ,e.end_at AS closes_at
        ,s.review_round
      FROM submissions s
      INNER JOIN events e ON e.id = s.event_id
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN classes c ON c.id = s.class_id
      WHERE s.id = ?
        AND EXISTS (
          SELECT 1
          FROM faculty_class_assignments fca
          WHERE fca.faculty_officer_id = ?
            AND fca.class_id = s.class_id
        )
      LIMIT 1
      `, [submissionId, officer.id])) as SubmissionRow | undefined;

  if (!submission) notFound();

  const criteria = (await db.rows(`
      SELECT
        i.code,
        i.title,
        i.description,
        i.group_code,
        g.title AS group_title,
        g.min_required,
        GREATEST(1, COALESCE(i.required_count, 1)) AS required_count,
        i.evidence_type,
        i.is_required,
        ar.passed AS auto_passed,
        ar.message AS auto_message,
        ar.matched_activity_titles,
        si.content_text,
        COALESCE((
          SELECT COUNT(*)
          FROM submission_ready_files sf
          WHERE sf.submission_id = s.id
            AND sf.criteria_code = i.code
        ), 0) AS file_count,
        (SELECT cr.decision FROM submission_criteria_reviews cr WHERE cr.submission_id=s.id AND cr.criteria_code=i.code AND cr.round<=s.review_round ORDER BY cr.round DESC LIMIT 1) AS review_decision
      FROM submissions s
      INNER JOIN event_criteria_items i ON i.event_id = s.event_id
      INNER JOIN event_criteria_groups g
        ON g.event_id = i.event_id
       AND g.code = i.group_code
      LEFT JOIN submission_auto_results ar
        ON ar.submission_id = s.id
       AND ar.criteria_code = i.code
      LEFT JOIN submission_items si
        ON si.submission_id = s.id
       AND si.criteria_code = i.code
      WHERE s.id = ?
      ORDER BY g.sort_order ASC, i.sort_order ASC
      `, [submissionId])) as CriteriaRow[];

  const files = (await db.rows(`
      SELECT id, file_name, mime_type, criteria_code
      FROM submission_ready_files
      WHERE submission_id = ?
      ORDER BY uploaded_at DESC, id DESC
      `, [submissionId])) as FileRow[];

  const unitRows = (await db.rows<{ id: number; criteria_code: string; note: string | null; file_id: number | null; file_name: string | null; review_decision: string | null }>(`
      SELECT eu.id, eu.criteria_code, eu.note,
        (SELECT sf.id FROM submission_files sf WHERE sf.evidence_unit_id = eu.id AND sf.status = 'ready' AND sf.deleted_at IS NULL ORDER BY sf.id DESC LIMIT 1) AS file_id,
        (SELECT sf.file_name FROM submission_files sf WHERE sf.evidence_unit_id = eu.id AND sf.status = 'ready' AND sf.deleted_at IS NULL ORDER BY sf.id DESC LIMIT 1) AS file_name,
        (SELECT er.decision FROM submission_evidence_reviews er WHERE er.evidence_unit_id = eu.id AND er.round <= ? ORDER BY er.round DESC LIMIT 1) AS review_decision
      FROM submission_evidence_units eu
      WHERE eu.submission_id = ?
        AND EXISTS(SELECT 1 FROM submission_files sf WHERE sf.evidence_unit_id = eu.id AND sf.status = 'ready' AND sf.deleted_at IS NULL)
      ORDER BY eu.id ASC
      `, [submission.review_round, submissionId]));

  const reviews = (await db.rows(`
      SELECT
        r.round,
        r.decision,
        r.note,
        u.full_name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE r.submission_id = ?
      ORDER BY r.id ASC
      `, [submissionId])) as ReviewRow[];

  const reviewItems = reviews.map((item) => ({
    round: Number(item.round),
    decision: String(item.decision ?? ""),
    note: item.note ? String(item.note) : null,
    reviewerName: item.reviewer_name ? String(item.reviewer_name) : null,
  }));
  const timeline = (await getSubmissionTimeline(submissionId));
  const isReviewMode = sp.mode === "review";
  const criteriaWithFiles = criteria.map((item) => ({
    ...item,
    evidence_files: files
      .filter((file) => file.criteria_code === item.code)
      .map((file) => ({
        id: Number(file.id),
        fileName: String(file.file_name ?? ""),
        mimeType: String(file.mime_type ?? ""),
      })),
    evidence_units: unitRows
      .filter((unit) => unit.criteria_code === item.code)
      .map((unit) => ({
        id: Number(unit.id),
        note: unit.note,
        fileId: unit.file_id ? Number(unit.file_id) : null,
        fileName: unit.file_name,
        reviewDecision: unit.review_decision,
      })),
  }));
  const criteriaForReview = isReviewMode
    ? criteriaWithFiles.filter((item) => Number(item.is_required) === 1 || item.evidence_files.length > 0 || Boolean(item.content_text?.trim()))
    : criteriaWithFiles;
  const achievedCriteria = criteria.filter(
    (item) => Number(item.auto_passed) === 1 || item.review_decision === "pass",
  ).length;
  const requirements = (await evaluateSubmissionRequirements(db, submission.id, "approved"));
  const exportToken = await getPagePublicId(db, `/api/submissions/${submission.id}/export`);

  return (
    <main className="space-y-6">
      <ReviewHeader
        title={submission.event_title}
        subtitle={`${submission.student_name} - ${submission.mssv} - ${submission.class_code}`}
        backHref={`/dashboard/faculty-officer/reviews${sp.termId ? `?termId=${encodeURIComponent(sp.termId)}` : ""}`}
      />

      <SubmissionSupportCard submissionId={submissionId} isDraft={!submission.submitted_at}/>

      {!isReviewMode && submission.submitted_at ? (
        <SubmissionViewOverview
          status={submission.status}
          submittedAt={submission.submitted_at}
          updatedAt={submission.updated_at}
          closesAt={submission.closes_at}
          currentRound={Number(submission.review_round)}
          achievedCriteria={requirements.totalRequired > 0 ? requirements.effectiveAchieved : achievedCriteria}
          totalCriteria={requirements.totalRequired > 0 ? requirements.totalRequired : criteria.length}
        />
      ) : null}

      {submission.submitted_at ? <ReviewHistory items={reviewItems} timeline={timeline} /> : null}

      <SubmissionCriteriaDetailList
        items={criteriaForReview}
        submissionId={isReviewMode ? submission.id : undefined}
        canReview={isReviewMode && ["submitted_v1","submitted_v2"].includes(submission.status)}
        reviewHref={!isReviewMode ? `/dashboard/faculty-officer/reviews/${submission.id}?mode=review${sp.termId ? `&termId=${encodeURIComponent(sp.termId)}` : ""}` : undefined}
        canOpenReview={["submitted_v1", "submitted_v2", "failed"].includes(submission.status)}
        headerAction={exportToken ? <SubmissionExportButtons url={`/api/submissions/${exportToken}/export`} /> : null}
      />

      {isReviewMode ? (
        <FacultyOfficerReviewPanel
          submissionId={submission.id}
          canReview={["submitted_v1","submitted_v2"].includes(submission.status)}
          canReopen={submission.status === "failed"}
          reviewRound={Number(submission.review_round) === 2 ? 2 : 1}
          requirementsMet={requirements.valid}
        />
      ) : null}
    </main>
  );
}
