'use strict';
/**
 * Shared paginated `jobs` query executor — used by both the generic
 * Job Pipeline endpoint and the target-scoped matches endpoint, so
 * sorting/pagination/feedback-join logic lives in exactly one place.
 * Callers build their own `conditions`/`params` (parameterized — never
 * string-concatenate a value into the SQL text) and this runs them.
 */

const pool = require('../../db/client');

async function queryJobsPaginated({ conditions, params, sort, page, limit }) {
  const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
  const sortExpr = sort === 'date' ? 'j.posted_at DESC' : 'j.relevance_score DESC';

  const dataQ = `
    SELECT j.id, j.company_name, j.title, j.location, j.job_type,
           j.description, j.requirements, j.apply_url, j.source_api,
           j.relevance_score, j.ai_decision, j.ai_reasoning,
           j.tech_stack, j.seniority_level, j.visa_sponsored,
           j.salary_min, j.salary_max, j.salary_currency,
           j.posted_at, j.created_at,
           jf.decision AS user_decision, jf.created_at AS feedback_at
    FROM jobs j
    LEFT JOIN job_feedback jf ON jf.job_id = j.id
    WHERE ${where}
    ORDER BY ${sortExpr}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const countQ = `
    SELECT COUNT(*) AS total
    FROM jobs j
    LEFT JOIN job_feedback jf ON jf.job_id = j.id
    WHERE ${where}
  `;

  const offset = (page - 1) * limit;
  const [data, count] = await Promise.all([
    pool.query(dataQ, [...params, limit, offset]),
    pool.query(countQ, params),
  ]);

  const total = parseInt(count.rows[0].total, 10);
  return {
    data: data.rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

module.exports = { queryJobsPaginated };
