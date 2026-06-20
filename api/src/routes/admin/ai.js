'use strict';
/**
 * Admin AI Management Routes
 * Endpoints for configuring the AI scoring engine, editing pattern config,
 * live-testing the scorer, and viewing calibration data.
 */

const express = require('express');
const pool    = require('../../db/client');
const { requireAuth } = require('../../middleware/auth');
const { getFilteringStats, patternScoreDetailed, scoreWithLLM, getPatternConfigFromDB } =
  require('../../services/jobIngestion/aiFilteringService');

const router = express.Router();
const PREFS_ID = '00000000-0000-0000-0000-000000000001';

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/ai/status:
 *   get:
 *     summary: Get AI engine status
 *     description: >
 *       Returns the active engine configuration, API key availability, last
 *       successful ingestion run timestamp, and 24-hour scoring statistics.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI engine status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 engine:
 *                   type: string
 *                   enum: [pattern, claude, groq, gemini]
 *                   example: pattern
 *                 llm_enabled:
 *                   type: boolean
 *                 ambiguous_min:
 *                   type: integer
 *                   example: 30
 *                   description: Lower bound of the ambiguous score range sent to LLM
 *                 ambiguous_max:
 *                   type: integer
 *                   example: 72
 *                   description: Upper bound of the ambiguous score range sent to LLM
 *                 api_keys:
 *                   type: object
 *                   properties:
 *                     anthropic: { type: boolean }
 *                     groq:      { type: boolean }
 *                     gemini:    { type: boolean }
 *                 last_24h:
 *                   type: object
 *                   description: Filtering statistics for the last 24 hours
 *                 last_run:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       401:
 *         description: Unauthorised
 */
router.get('/status', async (req, res) => {
  try {
    const [prefsRes, statsRes, lastRunRes] = await Promise.all([
      pool.query(
        `SELECT ai_engine, llm_enabled, ambiguous_min, ambiguous_max
         FROM job_preferences WHERE id = $1`,
        [PREFS_ID]
      ),
      getFilteringStats(24),
      pool.query(
        `SELECT MAX(created_at) AS last_run FROM job_ingestion_logs WHERE status = 'SUCCESS'`
      ),
    ]);

    const prefs = prefsRes.rows[0] || {};

    res.json({
      engine:       prefs.ai_engine    || 'pattern',
      llm_enabled:  prefs.llm_enabled  ?? false,
      ambiguous_min: prefs.ambiguous_min ?? 30,
      ambiguous_max: prefs.ambiguous_max ?? 72,
      api_keys: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        groq:      !!process.env.GROQ_API_KEY,
        gemini:    !!process.env.GEMINI_API_KEY,
      },
      last_24h: statsRes,
      last_run: lastRunRes.rows[0]?.last_run || null,
    });
  } catch (err) {
    console.error('[Admin:AI:Status]', err.message);
    res.status(500).json({ error: 'Failed to fetch AI status' });
  }
});

/**
 * @swagger
 * /api/admin/ai/status:
 *   put:
 *     summary: Save AI engine settings
 *     description: >
 *       Persists the active engine selection, LLM toggle, and ambiguous score
 *       range. Uses UPSERT so it is safe to call on a fresh database.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               engine:
 *                 type: string
 *                 enum: [pattern, claude, groq, gemini]
 *                 example: groq
 *               llm_enabled:
 *                 type: boolean
 *                 example: true
 *               ambiguous_min:
 *                 type: integer
 *                 example: 30
 *               ambiguous_max:
 *                 type: integer
 *                 example: 72
 *     responses:
 *       200:
 *         description: Settings saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       401:
 *         description: Unauthorised
 */
router.put('/status', async (req, res) => {
  try {
    const { engine, llm_enabled, ambiguous_min, ambiguous_max } = req.body;
    await pool.query(
      `INSERT INTO job_preferences (id, ai_engine, llm_enabled, ambiguous_min, ambiguous_max)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         ai_engine     = COALESCE($2, job_preferences.ai_engine),
         llm_enabled   = COALESCE($3, job_preferences.llm_enabled),
         ambiguous_min = COALESCE($4, job_preferences.ambiguous_min),
         ambiguous_max = COALESCE($5, job_preferences.ambiguous_max),
         updated_at    = NOW()`,
      [PREFS_ID, engine || null, llm_enabled ?? null, ambiguous_min ?? null, ambiguous_max ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin:AI:SaveStatus]', err.message);
    res.status(500).json({ error: 'Failed to save engine settings' });
  }
});

/**
 * @swagger
 * /api/admin/ai/pattern-config:
 *   get:
 *     summary: Get pattern scoring configuration
 *     description: >
 *       Returns the editable keyword arrays used by the pattern scorer.
 *       Falls back to hardcoded defaults when the DB columns are empty.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pattern config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role_keywords:
 *                   type: array
 *                   items: { type: string }
 *                   example: [DevOps, Platform Engineer, SRE]
 *                 tech_boosts:
 *                   type: array
 *                   items: { type: object }
 *                   description: Array of { term, boost } objects
 *                 penalties:
 *                   type: array
 *                   items: { type: object }
 *                   description: Array of { term, penalty } objects
 *                 locations:
 *                   type: array
 *                   items: { type: string }
 *                   example: [Paris, Remote, France]
 *       401:
 *         description: Unauthorised
 */
router.get('/pattern-config', async (req, res) => {
  try {
    const config = await getPatternConfigFromDB();
    res.json(config);
  } catch (err) {
    console.error('[Admin:AI:PatternConfig]', err.message);
    res.status(500).json({ error: 'Failed to fetch pattern config' });
  }
});

/**
 * @swagger
 * /api/admin/ai/pattern-config:
 *   put:
 *     summary: Save pattern scoring configuration
 *     description: All four arrays are required and must be valid JSON arrays.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role_keywords, tech_boosts, penalties, locations]
 *             properties:
 *               role_keywords:
 *                 type: array
 *                 items: { type: string }
 *                 example: [DevOps, Platform Engineer]
 *               tech_boosts:
 *                 type: array
 *                 items: { type: object }
 *               penalties:
 *                 type: array
 *                 items: { type: object }
 *               locations:
 *                 type: array
 *                 items: { type: string }
 *                 example: [Paris, Remote]
 *     responses:
 *       200:
 *         description: Config saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 saved:
 *                   type: object
 *                   properties:
 *                     role_keywords: { type: integer }
 *                     tech_boosts:   { type: integer }
 *                     penalties:     { type: integer }
 *                     locations:     { type: integer }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 */
router.put('/pattern-config', async (req, res) => {
  try {
    const { role_keywords, tech_boosts, penalties, locations } = req.body;

    if (!Array.isArray(role_keywords) || !Array.isArray(tech_boosts) ||
        !Array.isArray(penalties)     || !Array.isArray(locations)) {
      return res.status(400).json({ error: 'role_keywords, tech_boosts, penalties, locations must all be arrays' });
    }

    await pool.query(
      `INSERT INTO job_preferences
         (id, pattern_role_keywords, pattern_tech_boosts, pattern_penalties, pattern_locations)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         pattern_role_keywords = $2,
         pattern_tech_boosts   = $3,
         pattern_penalties     = $4,
         pattern_locations     = $5,
         updated_at            = NOW()`,
      [PREFS_ID, role_keywords, JSON.stringify(tech_boosts), JSON.stringify(penalties), locations]
    );

    res.json({ ok: true, saved: { role_keywords: role_keywords.length, tech_boosts: tech_boosts.length, penalties: penalties.length, locations: locations.length } });
  } catch (err) {
    console.error('[Admin:AI:SavePattern]', err.message);
    res.status(500).json({ error: 'Failed to save pattern config' });
  }
});

/**
 * @swagger
 * /api/admin/ai/test-score:
 *   post:
 *     summary: Live-score a job description
 *     description: >
 *       Scores a job using the current pattern config and optionally the active
 *       LLM engine. Returns the full pattern breakdown (which keywords matched,
 *       which scored negatively) plus the LLM result if enabled.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:        { type: string, example: Platform Engineer }
 *               company_name: { type: string, example: Acme Corp }
 *               location:     { type: string, example: Paris, France }
 *               description:  { type: string }
 *               requirements: { type: string }
 *     responses:
 *       200:
 *         description: Scoring result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pattern:
 *                   type: object
 *                   description: Pattern scorer breakdown (score, matched keywords, penalties applied)
 *                 llm:
 *                   type: object
 *                   nullable: true
 *                   description: LLM result if enabled and API key is set; null otherwise
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 */
router.post('/test-score', async (req, res) => {
  try {
    const { title, company_name, location, description, requirements } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const job = { title, company_name: company_name || '', location: location || '', description: description || '', requirements: requirements || '' };

    const config = await getPatternConfigFromDB();
    const patternResult = patternScoreDetailed(job, config);

    let llmResult = null;
    if (config.llm_enabled && (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY)) {
      try {
        llmResult = await scoreWithLLM(job, config.engine);
      } catch (e) {
        llmResult = { error: e.message };
      }
    }

    res.json({ pattern: patternResult, llm: llmResult });
  } catch (err) {
    console.error('[Admin:AI:TestScore]', err.message);
    res.status(500).json({ error: 'Failed to score job' });
  }
});

/**
 * @swagger
 * /api/admin/ai/calibration:
 *   get:
 *     summary: Get AI calibration data
 *     description: >
 *       Returns a score distribution histogram, a feedback summary keyed by
 *       decision type, and the top 15 false positives/negatives derived from
 *       your applied/skipped feedback history.
 *     tags: [Admin: AI Engine]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calibration report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_jobs:
 *                   type: integer
 *                 score_distribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       bucket: { type: string, example: '60–69' }
 *                       count:  { type: integer }
 *                       pct:    { type: integer, description: Percentage of total }
 *                 feedback_summary:
 *                   type: object
 *                   description: Keyed by decision (applied, saved, skipped, etc.)
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       count:     { type: integer }
 *                       avg_score: { type: number }
 *                 false_negatives:
 *                   type: array
 *                   description: Jobs you applied to that scored below 65
 *                   items: { type: object }
 *                 false_positives:
 *                   type: array
 *                   description: Jobs you skipped that scored >= 65
 *                   items: { type: object }
 *       401:
 *         description: Unauthorised
 */
router.get('/calibration', async (req, res) => {
  try {
    const [distRes, feedbackRes, falseNegRes, falsePosRes] = await Promise.all([
      pool.query(`
        SELECT
          (relevance_score / 10) * 10 AS bucket_start,
          COUNT(*)                     AS count
        FROM jobs
        WHERE is_active = TRUE
        GROUP BY bucket_start
        ORDER BY bucket_start
      `),
      pool.query(`
        SELECT
          jf.decision,
          COUNT(*)                                           AS count,
          ROUND(AVG(j.relevance_score)::numeric, 1)         AS avg_score
        FROM job_feedback jf
        JOIN jobs j ON j.id = jf.job_id
        GROUP BY jf.decision
        ORDER BY jf.decision
      `),
      pool.query(`
        SELECT j.id, j.title, j.company_name, j.location,
               j.relevance_score, j.ai_decision, j.ai_reasoning
        FROM job_feedback jf
        JOIN jobs j ON j.id = jf.job_id
        WHERE jf.decision IN ('applied') AND j.relevance_score < 65
        ORDER BY j.relevance_score ASC
        LIMIT 15
      `),
      pool.query(`
        SELECT j.id, j.title, j.company_name, j.location,
               j.relevance_score, j.ai_decision, j.ai_reasoning
        FROM job_feedback jf
        JOIN jobs j ON j.id = jf.job_id
        WHERE jf.decision IN ('skip', 'skipped') AND j.relevance_score >= 65
        ORDER BY j.relevance_score DESC
        LIMIT 15
      `),
    ]);

    const distMap = {};
    for (const row of distRes.rows) {
      distMap[parseInt(row.bucket_start, 10)] = parseInt(row.count, 10);
    }
    const totalJobs = Object.values(distMap).reduce((s, c) => s + c, 0);
    const scoreDistribution = Array.from({ length: 10 }, (_, i) => {
      const start = i * 10;
      const end   = i === 9 ? 100 : start + 9;
      const count = distMap[start] || 0;
      return {
        bucket: `${start}–${end}`,
        count,
        pct: totalJobs ? Math.round((count / totalJobs) * 100) : 0,
      };
    });

    const feedbackSummary = {};
    for (const row of feedbackRes.rows) {
      feedbackSummary[row.decision] = {
        count:     parseInt(row.count, 10),
        avg_score: parseFloat(row.avg_score) || 0,
      };
    }

    res.json({
      total_jobs: totalJobs,
      score_distribution: scoreDistribution,
      feedback_summary: feedbackSummary,
      false_negatives: falseNegRes.rows,
      false_positives: falsePosRes.rows,
    });
  } catch (err) {
    console.error('[Admin:AI:Calibration]', err.message);
    res.status(500).json({ error: 'Failed to fetch calibration data' });
  }
});

// ── Base CV: refresh snapshot from current DB data ────────────
router.post('/refresh-base-cv', requireAuth, async (req, res) => {
  try {
    const baseCvService = require('../../services/cvGeneration/baseCvService');
    const result = await baseCvService.refreshBaseCv();
    const c = result.content_json;
    res.json({
      version:      result.version,
      created_at:   result.created_at,
      section_counts: {
        experiences:    (c.experiences    || []).length,
        skills:         (c.skills         || []).length,
        certifications: (c.certifications || []).length,
        education:      (c.education      || []).length,
        projects:       (c.projects       || []).length,
        references:     (c.references     || []).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
