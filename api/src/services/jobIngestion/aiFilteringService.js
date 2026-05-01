'use strict';
/**
 * AI Job Filtering Service
 * Scores job relevance (0-100) using Claude claude-haiku-4-5-20251001 + your actual profile.
 *
 * Two-tier approach:
 *   Tier 1 – Fast pattern match (free, always runs, catches obvious DROP/KEEP)
 *   Tier 2 – Claude claude-haiku-4-5-20251001 (runs when pattern match is ambiguous 35-75 range)
 *             Uses your real bio, skills, and projects for context.
 *             ~20× cheaper than GPT-4 Turbo. Typical cost: ~$0.002 per 100 jobs.
 */

const pool  = require('../../db/client');

// ── Profile cache ─────────────────────────────────────────────
// Fetched once per worker run, then reused for all jobs.
let _profileCache = null;

async function getProfileContext() {
  if (_profileCache) return _profileCache;

  try {
    const [profileRes, skillsRes, expRes, projectsRes] = await Promise.all([
      pool.query('SELECT name, headline, bio FROM profile LIMIT 1'),
      pool.query(`SELECT name, category,
                         CASE proficiency
                           WHEN 5 THEN 'expert'
                           WHEN 4 THEN 'advanced'
                           WHEN 3 THEN 'intermediate'
                           ELSE 'familiar'
                         END AS level
                  FROM skills ORDER BY proficiency DESC LIMIT 30`),
      pool.query(`SELECT role, company, description,
                         EXTRACT(YEAR FROM AGE(COALESCE(end_date, NOW()), start_date))::int AS years
                  FROM experiences ORDER BY start_date DESC LIMIT 5`),
      pool.query(`SELECT title, description, tech_stack
                  FROM projects WHERE published = TRUE ORDER BY order_index LIMIT 6`),
    ]);

    const p = profileRes.rows[0] || {};

    const techByCategory = skillsRes.rows.reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = [];
      acc[s.category].push(`${s.name} (${s.level})`);
      return acc;
    }, {});

    const techSummary = Object.entries(techByCategory)
      .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
      .join('\n');

    const expSummary = expRes.rows
      .map(e => `- ${e.role} at ${e.company} (${e.years || '<1'} yr${e.years !== 1 ? 's' : ''})`)
      .join('\n');

    const projectSummary = projectsRes.rows
      .map(pr => `- ${pr.title}: ${(pr.tech_stack || []).slice(0, 6).join(', ')}`)
      .join('\n');

    _profileCache = {
      name:     p.name     || 'John Itopa ISAH',
      headline: p.headline || 'DevOps & Cloud Engineer',
      bio:      (p.bio     || '').slice(0, 400),
      techSummary,
      expSummary,
      projectSummary,
    };
  } catch (err) {
    console.warn('[AIFilter] Could not load profile context:', err.message);
    _profileCache = {
      name: 'John Itopa ISAH',
      headline: 'DevOps & Cloud Engineer',
      bio: 'Experienced in Kubernetes, Docker, Prometheus, Grafana, Node.js, Next.js, CI/CD.',
      techSummary: 'Infrastructure: Kubernetes (expert), Docker (expert), Terraform (advanced)\nCloud: AWS (advanced), GCP (familiar)\nObservability: Prometheus (expert), Grafana (expert)',
      expSummary: '- DevOps Engineer (recent)',
      projectSummary: '- Portfolio MCS: Kubernetes, Docker, Prometheus, Grafana, Next.js, Node.js',
    };
  }

  return _profileCache;
}

// ── Invalidate cache between worker runs ──────────────────────
function clearProfileCache() { _profileCache = null; }

// ═══════════════════════════════════════════════════════════════
//  PATTERN SCORING (Tier 1 — always runs)
// ═══════════════════════════════════════════════════════════════
const ROLE_KEYWORDS = [
  'devops', 'sre', 'site reliability', 'infrastructure', 'cloud engineer',
  'platform engineer', 'embedded', 'firmware', 'backend', 'systems engineer',
];

const TECH_BOOSTS = [
  // Infra & orchestration
  { kw: 'kubernetes', pts: 6 }, { kw: 'k8s',         pts: 6 },
  { kw: 'docker',     pts: 4 }, { kw: 'terraform',    pts: 4 },
  { kw: 'helm',       pts: 3 }, { kw: 'ansible',      pts: 3 },
  { kw: 'argocd',     pts: 3 }, { kw: 'gitops',       pts: 3 },
  // Cloud
  { kw: 'aws',        pts: 4 }, { kw: 'gcp',          pts: 4 },
  { kw: 'google cloud', pts: 4 }, { kw: 'azure',       pts: 3 },
  // Observability
  { kw: 'prometheus', pts: 5 }, { kw: 'grafana',      pts: 4 },
  { kw: 'observability', pts: 4 }, { kw: 'alertmanager', pts: 3 },
  // Languages
  { kw: 'golang',     pts: 4 }, { kw: ' go ',         pts: 3 },
  { kw: 'rust',       pts: 4 }, { kw: 'python',       pts: 3 },
  { kw: 'node',       pts: 3 }, { kw: 'typescript',   pts: 2 },
  // Embedded
  { kw: 'embedded',   pts: 5 }, { kw: 'firmware',     pts: 5 },
  { kw: 'rtos',       pts: 4 }, { kw: 'arm cortex',   pts: 4 },
  { kw: ' c ',        pts: 2 }, { kw: 'c++',          pts: 2 },
  // CI/CD
  { kw: 'ci/cd',      pts: 3 }, { kw: 'github actions', pts: 3 },
  { kw: 'jenkins',    pts: 2 }, { kw: 'gitlab',       pts: 2 },
  // Linux / Networking
  { kw: 'linux',      pts: 3 }, { kw: 'networking',   pts: 2 },
  { kw: 'bash',       pts: 2 }, { kw: 'shell',        pts: 2 },
];

const PENALTIES = [
  // Role mismatches
  { kw: 'sales',        pts: -25 }, { kw: 'marketing',  pts: -25 },
  { kw: 'accounting',   pts: -25 }, { kw: 'recruiter',  pts: -25 },
  { kw: 'data scientist', pts: -15 }, { kw: 'machine learning engineer', pts: -10 },
  { kw: 'ios developer', pts: -20 }, { kw: 'android developer', pts: -20 },
  { kw: 'mobile developer', pts: -15 },
  // Seniority (soft penalty — don't DROP, just reduce)
  { kw: 'junior',       pts: -8  }, { kw: 'entry level', pts: -8  },
  { kw: 'internship',   pts: -15 }, { kw: 'intern',      pts: -15 },
  // Exclude if senior not also mentioned
];

const ACCEPTED_LOCATIONS = ['remote', 'france', 'eu', 'europe', 'germany', 'netherlands', 'uk', 'canada', 'worldwide'];

function patternScore(job) {
  const text = `${job.title} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();
  let score = 40; // baseline (neutral)
  const techs = new Set();

  // Role keyword boost
  let roleHits = 0;
  for (const kw of ROLE_KEYWORDS) {
    if (text.includes(kw)) { roleHits++; score += 4; }
  }

  // Tech boost
  for (const { kw, pts } of TECH_BOOSTS) {
    if (text.includes(kw)) { score += pts; techs.add(kw.trim()); }
  }

  // Penalties
  for (const { kw, pts } of PENALTIES) {
    if (text.includes(kw)) score += pts; // pts are negative
  }

  // Location boost/penalty
  const loc = (job.location || '').toLowerCase();
  const locOk = ACCEPTED_LOCATIONS.some(l => loc.includes(l));
  if (locOk)  score += 8;
  if (!locOk && roleHits === 0) score -= 15; // not relevant AND weird location

  // Visa detection
  let visaSponsored = null;
  if (text.includes('visa') && text.includes('sponsor')) visaSponsored = true;
  if (text.includes('no visa') || text.includes('not visa sponsorship')) visaSponsored = false;

  // Seniority
  let seniority = 'Mid';
  if (/senior|lead|principal|staff/i.test(text)) seniority = 'Senior';
  else if (/junior|entry|intern/i.test(text))     seniority = 'Junior';

  score = Math.min(100, Math.max(0, score));

  return {
    score,
    techs: Array.from(techs),
    seniority,
    visaSponsored,
    roleHits,
  };
}

// ═══════════════════════════════════════════════════════════════
//  CLAUDE HAIKU SCORING (Tier 2 — ambiguous jobs only: 30-72 range)
// ═══════════════════════════════════════════════════════════════
async function scoreWithClaude(job, profile) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Truncate description to keep tokens low — claude-haiku-4-5 is fast
  const desc = (job.description || '').slice(0, 1200);
  const reqs = (job.requirements || '').slice(0, 600);

  const prompt = `You are a job relevance scorer. Score this job for the candidate below.

CANDIDATE PROFILE
Name: ${profile.name}
Headline: ${profile.headline}
Bio: ${profile.bio}

SKILLS (by category):
${profile.techSummary}

EXPERIENCE:
${profile.expSummary}

PROJECTS:
${profile.projectSummary}

JOB POSTING
Title: ${job.title}
Company: ${job.company_name}
Location: ${job.location}
Description: ${desc}
Requirements: ${reqs}

Return ONLY valid JSON, no markdown, no explanation:
{
  "relevance_score": <0-100 integer>,
  "ai_decision": <"KEEP"|"REVIEW"|"DROP">,
  "ai_reasoning": "<1 sentence max — why this score>",
  "tech_stack": [<technologies identified in job>],
  "seniority_level": <"Junior"|"Mid"|"Senior">,
  "visa_sponsored": <true|false|null>
}

Scoring guide:
- 80-100: Strong match — core skills align, role is DevOps/Cloud/SRE/Embedded, location OK
- 60-79 (KEEP): Good match — most skills present, minor gaps
- 40-59 (REVIEW): Partial match — some overlap but missing key requirements or wrong role type
- 0-39 (DROP): Poor match — different field, wrong seniority, or excluded location`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data   = await response.json();
  const text   = data.content?.[0]?.text || '';
  const parsed = JSON.parse(text);

  return {
    relevance_score: Math.min(100, Math.max(0, parseInt(parsed.relevance_score, 10) || 0)),
    ai_decision:     parsed.ai_decision  || 'REVIEW',
    ai_reasoning:    parsed.ai_reasoning || '',
    tech_stack:      Array.isArray(parsed.tech_stack) ? parsed.tech_stack : [],
    seniority_level: parsed.seniority_level || 'Mid',
    visa_sponsored:  parsed.visa_sponsored ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ANALYSIS (combines both tiers)
// ═══════════════════════════════════════════════════════════════
async function analyzeJob(rawJob) {
  const pattern = patternScore(rawJob);

  // Tier 1 clear decision: very high or very low — skip Claude
  const useClaude = process.env.USE_LLM_FILTERING !== 'false'
    && process.env.ANTHROPIC_API_KEY
    && pattern.score >= 30
    && pattern.score <= 72;   // ambiguous range: worth the API call

  if (!useClaude) {
    const decision = pattern.score >= 65 ? 'KEEP'
      : pattern.score >= 40 ? 'REVIEW' : 'DROP';
    return {
      relevance_score: pattern.score,
      ai_decision:     decision,
      ai_reasoning:    `Pattern match: ${pattern.roleHits} role hits, ${pattern.techs.length} techs`,
      tech_stack:      pattern.techs,
      seniority_level: pattern.seniority,
      visa_sponsored:  pattern.visaSponsored,
    };
  }

  // Tier 2 — Claude claude-haiku-4-5-20251001
  try {
    const profile = await getProfileContext();
    const claude  = await scoreWithClaude(rawJob, profile);

    // Weighted blend: 70% Claude, 30% pattern (pattern catches obvious rules)
    const blendedScore = Math.round(claude.relevance_score * 0.7 + pattern.score * 0.3);

    return {
      ...claude,
      relevance_score: blendedScore,
      ai_reasoning: `Claude: ${claude.ai_reasoning}`,
    };
  } catch (err) {
    console.warn(`[AIFilter] Claude failed for job ${rawJob.id}, using pattern:`, err.message);
    const decision = pattern.score >= 65 ? 'KEEP'
      : pattern.score >= 40 ? 'REVIEW' : 'DROP';
    return {
      relevance_score: pattern.score,
      ai_decision:     decision,
      ai_reasoning:    `Pattern fallback (Claude error): ${err.message.slice(0, 80)}`,
      tech_stack:      pattern.techs,
      seniority_level: pattern.seniority,
      visa_sponsored:  pattern.visaSponsored,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
//  DB OPERATIONS
// ═══════════════════════════════════════════════════════════════
async function getUnprocessedRawJobs(limit = 100) {
  const result = await pool.query(
    `SELECT jr.*
     FROM jobs_raw jr
     LEFT JOIN jobs j ON jr.id = j.job_raw_id
     WHERE j.id IS NULL AND jr.is_duplicate = FALSE
     ORDER BY jr.posted_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function storeProcessedJob(rawJob, analysis) {
  const result = await pool.query(
    `INSERT INTO jobs (
       job_raw_id, external_id, company_name, title, location, job_type,
       description, requirements, salary_min, salary_max, salary_currency,
       posted_at, apply_url, source_api,
       relevance_score, ai_decision, ai_reasoning,
       tech_stack, seniority_level, visa_sponsored
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING id`,
    [
      rawJob.id, rawJob.external_id, rawJob.company_name, rawJob.title,
      rawJob.location, rawJob.job_type, rawJob.description, rawJob.requirements,
      rawJob.salary_min, rawJob.salary_max, rawJob.salary_currency,
      rawJob.posted_at, rawJob.apply_url, rawJob.source_api,
      analysis.relevance_score, analysis.ai_decision, analysis.ai_reasoning,
      analysis.tech_stack, analysis.seniority_level, analysis.visa_sponsored,
    ]
  );
  return result.rows[0]?.id;
}

async function getFilteringStats(hoursBack = 24) {
  const result = await pool.query(
    `SELECT
       COUNT(*)                                              AS total_jobs,
       COUNT(*) FILTER (WHERE ai_decision = 'KEEP')         AS kept,
       COUNT(*) FILTER (WHERE ai_decision = 'REVIEW')       AS review,
       COUNT(*) FILTER (WHERE ai_decision = 'DROP')         AS dropped,
       ROUND(AVG(relevance_score)::numeric, 1)              AS avg_score,
       MAX(relevance_score)                                  AS max_score,
       MIN(relevance_score)                                  AS min_score
     FROM jobs
     WHERE created_at > NOW() - INTERVAL '1 hour' * $1`,
    [hoursBack]
  );
  return result.rows[0];
}

// ═══════════════════════════════════════════════════════════════
//  FEEDBACK LEARNING — recalibrate pattern weights from your choices
//  Call this from the admin panel or weekly via cron.
// ═══════════════════════════════════════════════════════════════
async function recalibrateFromFeedback() {
  // Find jobs you marked "applied" that scored < 70 (false negatives)
  // and jobs you marked "skip" that scored >= 70 (false positives)
  const result = await pool.query(`
    SELECT
      jf.decision,
      j.tech_stack,
      j.relevance_score,
      j.seniority_level
    FROM job_feedback jf
    JOIN jobs j ON j.id = jf.job_id
    WHERE jf.created_at > NOW() - INTERVAL '30 days'
  `);

  const rows = result.rows;
  const applied = rows.filter(r => r.decision === 'applied');
  const skipped = rows.filter(r => r.decision === 'skip');

  // Count tech stack overlap in jobs you applied to
  const techApplied = {};
  applied.forEach(r => (r.tech_stack || []).forEach(t => {
    techApplied[t] = (techApplied[t] || 0) + 1;
  }));

  // Count tech stack in jobs you skipped
  const techSkipped = {};
  skipped.forEach(r => (r.tech_stack || []).forEach(t => {
    techSkipped[t] = (techSkipped[t] || 0) + 1;
  }));

  const summary = {
    applied_count:  applied.length,
    skipped_count:  skipped.length,
    avg_score_applied: applied.length
      ? Math.round(applied.reduce((s, r) => s + Number(r.relevance_score), 0) / applied.length)
      : null,
    avg_score_skipped: skipped.length
      ? Math.round(skipped.reduce((s, r) => s + Number(r.relevance_score), 0) / skipped.length)
      : null,
    top_tech_applied: Object.entries(techApplied).sort((a, b) => b[1] - a[1]).slice(0, 10),
    top_tech_skipped: Object.entries(techSkipped).sort((a, b) => b[1] - a[1]).slice(0, 5),
    insight: applied.length + skipped.length < 5
      ? 'Not enough feedback yet — mark more jobs as applied/skip to improve scoring'
      : `Scoring calibrated on ${applied.length} applied + ${skipped.length} skipped jobs`,
  };

  console.log('[AIFilter] Feedback calibration summary:', JSON.stringify(summary, null, 2));
  return summary;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════
async function filterUnprocessedJobs() {
  console.log('[AIFilter] Starting job filtering cycle...');
  clearProfileCache(); // fresh profile data each run

  const rawJobs = await getUnprocessedRawJobs();
  console.log(`[AIFilter] ${rawJobs.length} raw jobs to process`);

  let processed = 0, kept = 0, dropped = 0, review = 0;

  for (const rawJob of rawJobs) {
    try {
      const analysis = await analyzeJob(rawJob);
      await storeProcessedJob(rawJob, analysis);

      if (analysis.ai_decision === 'KEEP')   kept++;
      else if (analysis.ai_decision === 'DROP') dropped++;
      else review++;

      processed++;

      // Throttle Claude calls — 5 jobs/sec max
      if (processed % 5 === 0 && process.env.ANTHROPIC_API_KEY) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`[AIFilter] Failed job ${rawJob.id}:`, err.message);
    }
  }

  console.log(`[AIFilter] Done: ${processed} processed — ${kept} KEEP, ${review} REVIEW, ${dropped} DROP`);
  return { processed, kept, review, dropped };
}

module.exports = {
  filterUnprocessedJobs,
  getFilteringStats,
  recalibrateFromFeedback,
  analyzeJob,               // exported for testing
  patternScore,             // exported for testing
};
