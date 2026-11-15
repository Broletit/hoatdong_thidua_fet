import type { Database } from "@/server/db/mysql";

export async function finalizeExpiredSubmissions(db: Database) {
  const now = Date.now();

  const mistakenlyClosedRows = ((await db.rows(`SELECT s.id, t.id AS timeline_id, t.from_status, e.end_at
    FROM submissions s
    JOIN events e ON e.id = s.event_id
    JOIN submission_timeline t ON t.id = (
      SELECT MAX(latest.id)
      FROM submission_timeline latest
      WHERE latest.submission_id = s.id AND latest.to_status IS NOT NULL
    )
    WHERE s.status = 'failed'
      AND e.status IN ('closed', 'published')
      AND t.action = 'finalize'
      AND t.message = 'Đợt xét đã đóng; hồ sơ chưa hoàn tất xét duyệt nên được chốt không đạt.'
      AND t.from_status IN ('draft','submitted_v1','submitted_v2','needs_revision_v1','needs_revision_v2','rejected_v1','rejected_v2')`, [])) as {id:number;timeline_id:number;from_status:string;end_at:string}[])
    .filter(row => new Date(row.end_at).getTime() >= now);

  if (mistakenlyClosedRows.length) {
    await db.withTransaction(async () => {
      for (const row of mistakenlyClosedRows) {
        if (!(await db.execute("UPDATE submissions SET status=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND status='failed'", [row.from_status, row.id])).changes) continue;
        await db.execute("DELETE FROM submission_timeline WHERE id=?", [row.timeline_id]);
      }
    });
  }

  const rows = ((await db.rows(`SELECT s.id,s.status,e.status event_status,e.end_at FROM submissions s JOIN events e ON e.id=s.event_id
    WHERE s.status NOT IN ('passed','approved','failed','rejected')
      AND e.status IN ('closed','published')`, [])) as {id:number;status:string;event_status:string;end_at:string}[])
    .filter(row => new Date(row.end_at).getTime() < now);
  if (!rows.length) return 0;
  return (await (async () => (await db.withTransaction(async () => {
    let finalized = 0;
    for (const row of rows) {
      if (!(await db.execute("UPDATE submissions SET status='failed',updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND status=?", [row.id, row.status])).changes) continue;
      (await db.execute(`INSERT INTO submission_timeline(submission_id,action,from_status,to_status,message) VALUES(?,'finalize',?,'failed',?)`, [row.id, row.status, 'Đã hết hạn nhận hồ sơ; hồ sơ chưa hoàn tất xét duyệt nên được chốt không đạt.']));
      finalized++;
    }
    return finalized;
  })))());
}
