import { getDatabase } from "@/server/db/mysql";

export type AutoCriteriaResult = {
  criteriaCode: string;
  passed: boolean;
  matchedCount: number;
  matchedActivityIds: number[];
  matchedActivityTitles: string[];
};

type CriteriaRow = {
  code: string;
  evidence_type: string;
  required_count: number;
};

type ConductRuleRow = {
  criteria_code: string;
  min_score: number;
  period_scope: string;
};

type MatchRow = {
  criteria_code: string;
  activity_id: number;
  activity_title: string;
  activity_start_at: string;
};

export async function evaluateAutoCriteria({
  eventId,
  userId,
}: {
  eventId: number;
  userId: number;
}): Promise<AutoCriteriaResult[]> {
  const db = getDatabase();

  const event = (await db.first(`
      SELECT id, criteria_template_id, term_id
      FROM events
      WHERE id = ?
      LIMIT 1
      `, [eventId])) as
    | {
        id: number;
        criteria_template_id: number | null;
        term_id: number | null;
      }
    | undefined;

  if (!event || !event.criteria_template_id || !event.term_id) {
    return [];
  }

  const criteriaRows = (await db.rows(`
      SELECT code, evidence_type, required_count
      FROM event_criteria_items
      WHERE event_id = ?
        AND evidence_type IN ('auto', 'both')
      ORDER BY sort_order ASC, code ASC
      `, [eventId])) as CriteriaRow[];

  if (!criteriaRows.length) {
    return [];
  }

  const allMatches = (await db.rows(`
      SELECT DISTINCT
        r.criteria_code,
        a.id AS activity_id,
        a.title AS activity_title,
        a.start_at AS activity_start_at
      FROM criteria_activity_rules r
      INNER JOIN activities a ON a.id = r.activity_id
      INNER JOIN activity_registrations ar
        ON ar.activity_id = a.id
       AND ar.user_id = ?
       AND ar.status = 'attended'
      WHERE r.template_id = ?
      ORDER BY activity_start_at DESC, activity_id DESC
      `, [userId, event.criteria_template_id])) as MatchRow[];

  const matchesByCriteria = new Map<string, MatchRow[]>();
  for (const match of allMatches) {
    const code = String(match.criteria_code ?? "");
    const list = matchesByCriteria.get(code) ?? [];
    list.push(match);
    matchesByCriteria.set(code, list);
  }

  const conductRules = (await db.rows(`
      SELECT criteria_code, min_score, period_scope
      FROM criteria_conduct_rules
      WHERE template_id = ?
      `, [event.criteria_template_id])) as ConductRuleRow[];

  const conductRuleByCriteria = new Map<string, ConductRuleRow>();
  for (const rule of conductRules) {
    conductRuleByCriteria.set(String(rule.criteria_code ?? ""), rule);
  }

  const termId = event.term_id;
  let currentTermConductScore: number | null = null;
  let anyTermConductScore: number | null = null;

  async function getConductScore(periodScope: string): Promise<number> {
    if (periodScope === "any") {
      if (anyTermConductScore === null) {
        const scoreRow = (await db.first(`
            SELECT COALESCE(MAX(period_total), 0) AS total_score
            FROM (
              SELECT cs.period_id, SUM(cs.score_value) AS period_total
              FROM conduct_scores cs
              WHERE cs.user_id = ?
              GROUP BY cs.period_id
            ) totals
            `, [userId])) as { total_score: number } | undefined;
        anyTermConductScore = Number(scoreRow?.total_score ?? 0);
      }
      return anyTermConductScore;
    }
    if (currentTermConductScore === null) {
      const scoreRow = (await db.first(`
          SELECT COALESCE(MAX(period_total), 0) AS total_score
          FROM (
            SELECT cs.period_id, SUM(cs.score_value) AS period_total
            FROM conduct_scores cs
            INNER JOIN conduct_periods cp ON cp.id = cs.period_id
            INNER JOIN academic_terms term
              ON term.academic_year = cp.academic_year
             AND term.semester = cp.semester
            WHERE cs.user_id = ?
              AND term.id = ?
            GROUP BY cs.period_id
          ) totals
          `, [userId, termId])) as { total_score: number } | undefined;
      currentTermConductScore = Number(scoreRow?.total_score ?? 0);
    }
    return currentTermConductScore;
  }

  const results: AutoCriteriaResult[] = [];
  for (const criteria of criteriaRows) {
    const matches = matchesByCriteria.get(criteria.code) ?? [];
    const conductRule = conductRuleByCriteria.get(criteria.code);

    let conductPassed = false;
    if (conductRule) {
      const totalScore = await getConductScore(conductRule.period_scope);
      conductPassed = totalScore >= Number(conductRule.min_score);
    }

    const matchedCount = matches.length + (conductPassed ? 1 : 0);
    // Hoạt động đã tham gia chỉ hiển thị gợi ý màu xanh và yêu cầu sinh viên nộp minh chứng
    // để cán bộ duyệt, không đánh tự động đạt từ hoạt động.
    const passed = conductPassed && 1 >= Math.max(1, Number(criteria.required_count ?? 1));
    results.push({
      criteriaCode: criteria.code,
      passed,
      matchedCount,
      matchedActivityIds: matches.map((item) => Number(item.activity_id)),
      matchedActivityTitles: matches.map((item) =>
        String(item.activity_title ?? "")
      ),
    });
  }
  return results;
}
