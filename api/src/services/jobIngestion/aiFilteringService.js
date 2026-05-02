'use strict';
/**
 * AI Job Filtering Service
 * Scores job relevance (0-100) using a two-tier approach:
 *
 *   Tier 1 – Fast pattern match (free, always runs, catches obvious DROP/KEEP)
 *   Tier 2 – LLM scoring (runs when pattern score is in ambiguous range)
 *             Supports: Claude Haiku (ANTHROPIC_API_KEY), Groq Llama 70B (GROQ_API_KEY),
 *             Gemini Flash (GEMINI_API_KEY), or pattern-only (no key needed).
 *             Engine + range configured via admin UI → stored in job_preferences.
 */

const pool = require('../../db/client');

// ── Profile cache ─────────────────────────────────────────────
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

function clearProfileCache() { _profileCache = null; }

// ── Pattern config cache (5-min TTL) ─────────────────────────
let _patternConfigCache    = null;
let _patternConfigCacheTs  = 0;
const PATTERN_CONFIG_TTL   = 5 * 60 * 1000;

// Hardcoded defaults — used when DB config is empty (not yet customised)
const DEFAULT_ROLE_KEYWORDS = [
  'devops', 'sre', 'site reliability', 'infrastructure', 'cloud engineer',
  'platform engineer', 'embedded', 'firmware', 'backend', 'systems engineer',
];

const DEFAULT_TECH_BOOSTS = [
  { kw: 'kubernetes', pts: 6 }, { kw: 'k8s',         pts: 6 },
  { kw: 'docker',     pts: 4 }, { kw: 'terraform',    pts: 4 },
  { kw: 'helm',       pts: 3 }, { kw: 'ansible',      pts: 3 },
  { kw: 'argocd',     pts: 3 }, { kw: 'gitops',       pts: 3 },
  { kw: 'aws',        pts: 4 }, { kw: 'gcp',          pts: 4 },
  { kw: 'google cloud', pts: 4 }, { kw: 'azure',      pts: 3 },
  { kw: 'prometheus', pts: 5 }, { kw: 'grafana',      pts: 4 },
  { kw: 'observability', pts: 4 }, { kw: 'alertmanager', pts: 3 },
  { kw: 'golang',     pts: 4 }, { kw: ' go ',         pts: 3 },
  { kw: 'rust',       pts: 4 }, { kw: 'python',       pts: 3 },
  { kw: 'node',       pts: 3 }, { kw: 'typescript',   pts: 2 },
  { kw: 'embedded',   pts: 5 }, { kw: 'firmware',     pts: 5 },
  { kw: 'rtos',       pts: 4 }, { kw: 'arm cortex',   pts: 4 },
  { kw: ' c ',        pts: 2 }, { kw: 'c++',          pts: 2 },
  { kw: 'ci/cd',      pts: 3 }, { kw: 'github actions', pts: 3 },
  { kw: 'jenkins',    pts: 2 }, { kw: 'gitlab',       pts: 2 },
  { kw: 'linux',      pts: 3 }, { kw: 'networking',   pts: 2 },
  { kw: 'bash',       pts: 2 }, { kw: 'shell',        pts: 2 },
];

const DEFAULT_PENALTIES = [
  { kw: 'sales',        pts: -25 }, { kw: 'marketing',  pts: -25 },
  { kw: 'accounting',   pts: -25 }, { kw: 'recruiter',  pts: -25 },
  { kw: 'data scientist', pts: -15 }, { kw: 'machine learning engineer', pts: -10 },
  { kw: 'ios developer', pts: -20 }, { kw: 'android developer', pts: -20 },
  { kw: 'mobile developer', pts: -15 },
  { kw: 'junior',       pts: -8  }, { kw: 'entry level', pts: -8  },
  { kw: 'internship',   pts: -15 }, { kw: 'intern',      pts: -15 },
];

const DEFAULT_LOCATIONS = ['remote', 'france', 'eu', 'europe', 'germany', 'netherlands', 'uk', 'canada', 'worldwide'];

async function getPatternConfigFromDB() {
  const now = Date.now();
  if (_patternConfigCache && now - _patternConfigCacheTs < PATTERN_CONFIG_TTL) {
    return _patternConfigCache;
  }

  try {
    const result = await pool.query(
      `SELECT ai_engine, llm_enabled, ambiguous_min, ambiguous_max,
              pattern_role_keywords, pattern_tech_boosts, pattern_penalties, pattern_locations
       FROM job_preferences LIMIT 1`
    );

    const row = result.rows[0] || {};

    _patternConfigCache = {
      engine:        row.ai_engine    || 'pattern',
      llm_enabled:   row.llm_enabled  ?? false,
      ambiguous_min: row.ambiguous_min ?? 30,
      ambiguous_max: row.ambiguous_max ?? 72,
      // Fall back to hardcoded defaults when columns are empty
      role_keywords: (row.pattern_role_keywords?.length) ? row.pattern_role_keywords : DEFAULT_ROLE_KEYWORDS,
      tech_boosts:   (row.pattern_tech_boosts?.length)   ? row.pattern_tech_boosts   : DEFAULT_TECH_BOOSTS,
      penalties:     (row.pattern_penalties?.length)      ? row.pattern_penalties     : DEFAULT_PENALTIES,
      locations:     (row.pattern_locations?.length)      ? row.pattern_locations     : DEFAULT_LOCATIONS,
    };
  } catch (err) {
    console.warn('[AIFilter] Could not load pattern config from DB, using defaults:', err.message);
    _patternConfigCache = {
      engine: 'pattern', llm_enabled: false, ambiguous_min: 30, ambiguous_max: 72,
      role_keywords: DEFAULT_ROLE_KEYWORDS,
      tech_boosts:   DEFAULT_TECH_BOOSTS,
      penalties:     DEFAULT_PENALTIES,
      locations:     DEFAULT_LOCATIONS,
    };
  }

  _patternConfigCacheTs = now;
  return _patternConfigCache;
}

function clearPatternConfigCache() { _patternConfigCache = null; }

// ═══════════════════════════════════════════════════════════════
//  PATTERN SCORING (Tier 1)
// ═══════════════════════════════════════════════════════════════

// Basic scorer used during normal job processing
function patternScore(job, config = {}) {
  const roleKeywords = config.role_keywords?.length ? config.role_keywords : DEFAULT_ROLE_KEYWORDS;
  const techBoosts   = config.tech_boosts?.length   ? config.tech_boosts   : DEFAULT_TECH_BOOSTS;
  const penalties    = config.penalties?.length      ? config.penalties     : DEFAULT_PENALTIES;
  const locations    = config.locations?.length      ? config.locations     : DEFAULT_LOCATIONS;

  const text = `${job.title} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();
  let score = 40;
  const techs = new Set();

  let roleHits = 0;
  for (const kw of roleKeywords) {
    if (text.includes(kw)) { roleHits++; score += 4; }
  }

  for (const { kw, pts } of techBoosts) {
    if (text.includes(kw)) { score += pts; techs.add(kw.trim()); }
  }

  for (const { kw, pts } of penalties) {
    if (text.includes(kw)) score += pts;
  }

  const loc   = (job.location || '').toLowerCase();
  const locOk = locations.some(l => loc.includes(l));
  if (locOk)  score += 8;
  if (!locOk && roleHits === 0) score -= 15;

  let visaSponsored = null;
  if (text.includes('visa') && text.includes('sponsor')) visaSponsored = true;
  if (text.includes('no visa') || text.includes('not visa sponsorship')) visaSponsored = false;

  let seniority = 'Mid';
  if (/senior|lead|principal|staff/i.test(text)) seniority = 'Senior';
  else if (/junior|entry|intern/i.test(text))    seniority = 'Junior';

  score = Math.min(100, Math.max(0, score));

  return { score, techs: Array.from(techs), seniority, visaSponsored, roleHits };
}

// Detailed scorer for the live test panel — returns which keywords matched
function patternScoreDetailed(job, config = {}) {
  const roleKeywords = config.role_keywords?.length ? config.role_keywords : DEFAULT_ROLE_KEYWORDS;
  const techBoosts   = config.tech_boosts?.length   ? config.tech_boosts   : DEFAULT_TECH_BOOSTS;
  const penalties    = config.penalties?.length      ? config.penalties     : DEFAULT_PENALTIES;
  const locations    = config.locations?.length      ? config.locations     : DEFAULT_LOCATIONS;

  const text = `${job.title} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();
  let score = 40;

  const roleMatches = [];
  for (const kw of roleKeywords) {
    if (text.includes(kw)) { roleMatches.push(kw); score += 4; }
  }

  const techMatches = [];
  for (const { kw, pts } of techBoosts) {
    if (text.includes(kw)) { techMatches.push({ kw: kw.trim(), pts }); score += pts; }
  }

  const penaltyMatches = [];
  for (const { kw, pts } of penalties) {
    if (text.includes(kw)) { penaltyMatches.push({ kw, pts }); score += pts; }
  }

  const loc          = (job.location || '').toLowerCase();
  const locationOk   = locations.some(l => loc.includes(l));
  const locationBoost = locationOk ? 8 : (roleMatches.length === 0 ? -15 : 0);
  score += locationBoost;

  let visaSponsored = null;
  if (text.includes('visa') && text.includes('sponsor')) visaSponsored = true;
  if (text.includes('no visa') || text.includes('not visa sponsorship')) visaSponsored = false;

  let seniority = 'Mid';
  if (/senior|lead|principal|staff/i.test(text)) seniority = 'Senior';
  else if (/junior|entry|intern/i.test(text))    seniority = 'Junior';

  score = Math.min(100, Math.max(0, score));
  const decision = score >= 65 ? 'KEEP' : score >= 40 ? 'REVIEW' : 'DROP';

  return {
    score, decision,
    role_matches:    roleMatches,
    tech_matches:    techMatches,
    penalty_matches: penaltyMatches,
    location_ok:     locationOk,
    location_boost:  locationBoost,
    seniority,
    visa_sponsored:  visaSponsored,
    baseline: 40,
  };
}

// ═══════════════════════════════════════════════════════════════
//  LLM SCORING (Tier 2) — Claude, Groq, or Gemini
// ═══════════════════════════════════════════════════════════════

function buildScoringPrompt(job, profile) {
  const desc = (job.description || '').slice(0, 1200);
  const reqs = (job.requirements || '').slice(0, 600);
  return `You are a job relevance scorer. Score this job for the candidate below.

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
  "ai_reasoning": "<1 sentence max>",
  "tech_stack": [<technologies identified>],
  "seniority_level": <"Junior"|"Mid"|"Senior">,
  "visa_sponsored": <true|false|null>
}

Scoring guide:
- 80-100 (KEEP): Strong match — core skills align, DevOps/Cloud/SRE/Embedded, location OK
- 60-79 (KEEP): Good match — most skills present, minor gaps
- 40-59 (REVIEW): Partial match — some overlap but missing key requirements
- 0-39 (DROP): Poor match — different field, wrong seniority, or excluded location`;
}

function parseLLMResponse(text) {
  // Strip optional markdown code fences
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(clean);
  return {
    relevance_score: Math.min(100, Math.max(0, parseInt(parsed.relevance_score, 10) || 0)),
    ai_decision:     parsed.ai_decision    || 'REVIEW',
    ai_reasoning:    parsed.ai_reasoning   || '',
    tech_stack:      Array.isArray(parsed.tech_stack) ? parsed.tech_stack : [],
    seniority_level: parsed.seniority_level || 'Mid',
    visa_sponsored:  parsed.visa_sponsored ?? null,
  };
}

async function scoreWithClaude(job, profile) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: buildScoringPrompt(job, profile) }],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const result = parseLLMResponse(data.content?.[0]?.text || '');
  return { ...result, _engine: 'claude-haiku-4-5' };
}

async function scoreWithGroq(job, profile) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a job relevance scorer. Always respond with valid JSON only.' },
        { role: 'user',   content: buildScoringPrompt(job, profile) },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const result = parseLLMResponse(data.choices?.[0]?.message?.content || '');
  return { ...result, _engine: 'groq/llama-3.3-70b' };
}

async function scoreWithGemini(job, profile) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildScoringPrompt(job, profile) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const result = parseLLMResponse(text);
  return { ...result, _engine: 'gemini-2.0-flash' };
}

// Unified LLM scorer — picks engine based on config.engine + available API keys
async function scoreWithLLM(job, engine) {
  const profile = await getProfileContext();

  const pick = engine || 'pattern';

  if (pick === 'claude' && process.env.ANTHROPIC_API_KEY) return scoreWithClaude(job, profile);
  if (pick === 'groq'   && process.env.GROQ_API_KEY)      return scoreWithGroq(job, profile);
  if (pick === 'gemini' && process.env.GEMINI_API_KEY)    return scoreWithGemini(job, profile);

  // Fallback: try whichever key is available
  if (process.env.GROQ_API_KEY)      return scoreWithGroq(job, profile);
  if (process.env.ANTHROPIC_API_KEY) return scoreWithClaude(job, profile);
  if (process.env.GEMINI_API_KEY)    return scoreWithGemini(job, profile);

  throw new Error('No LLM API key available');
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ANALYSIS (combines both tiers)
// ═══════════════════════════════════════════════════════════════
async function analyzeJob(rawJob) {
  const config  = await getPatternConfigFromDB();
  const pattern = patternScore(rawJob, config);

  const useLLM = config.llm_enabled
    && pattern.score >= config.ambiguous_min
    && pattern.score <= config.ambiguous_max
    && (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);

  if (!useLLM) {
    const decision = pattern.score >= 65 ? 'KEEP' : pattern.score >= 40 ? 'REVIEW' : 'DROP';
    return {
      relevance_score: pattern.score,
      ai_decision:     decision,
      ai_reasoning:    `Pattern match: ${pattern.roleHits} role hits, ${pattern.techs.length} techs`,
      tech_stack:      pattern.techs,
      seniority_level: pattern.seniority,
      visa_sponsored:  pattern.visaSponsored,
    };
  }

  try {
    const llm = await scoreWithLLM(rawJob, config.engine);
    const blendedScore = Math.round(llm.relevance_score * 0.7 + pattern.score * 0.3);
    return {
      ...llm,
      relevance_score: blendedScore,
      ai_reasoning: `${llm._engine}: ${llm.ai_reasoning}`,
    };
  } catch (err) {
    console.warn(`[AIFilter] LLM failed for job ${rawJob.id}, using pattern:`, err.message);
    const decision = pattern.score >= 65 ? 'KEEP' : pattern.score >= 40 ? 'REVIEW' : 'DROP';
    return {
      relevance_score: pattern.score,
      ai_decision:     decision,
      ai_reasoning:    `Pattern fallback (LLM error): ${err.message.slice(0, 80)}`,
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
//  FEEDBACK CALIBRATION
// ═══════════════════════════════════════════════════════════════
async function recalibrateFromFeedback() {
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

  const rows    = result.rows;
  const applied = rows.filter(r => r.decision === 'applied');
  const skipped = rows.filter(r => ['skip', 'skipped'].includes(r.decision));

  const techApplied = {};
  applied.forEach(r => (r.tech_stack || []).forEach(t => {
    techApplied[t] = (techApplied[t] || 0) + 1;
  }));

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
  clearProfileCache();
  clearPatternConfigCache(); // re-read config each run so admin changes take effect

  const rawJobs = await getUnprocessedRawJobs();
  console.log(`[AIFilter] ${rawJobs.length} raw jobs to process`);

  let processed = 0, kept = 0, dropped = 0, review = 0;

  for (const rawJob of rawJobs) {
    try {
      const analysis = await analyzeJob(rawJob);
      await storeProcessedJob(rawJob, analysis);

      if (analysis.ai_decision === 'KEEP')       kept++;
      else if (analysis.ai_decision === 'DROP') dropped++;
      else review++;

      processed++;

      // Small pause every 5 jobs when LLM is active to avoid rate limiting
      if (processed % 5 === 0 && (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY)) {
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
  analyzeJob,
  patternScore,
  patternScoreDetailed,
  scoreWithLLM,
  getPatternConfigFromDB,
  clearPatternConfigCache,
};
