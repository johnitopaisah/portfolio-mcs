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

// ── GET /api/admin/ai/status ──────────────────────────────────
// Engine health: active engine, API key status, 24h scoring stats, last run.
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

// ── PUT /api/admin/ai/status ──────────────────────────────────
// Save engine settings (engine type, LLM toggle, ambiguous range).
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

// ── GET /api/admin/ai/pattern-config ─────────────────────────
// Returns the editable pattern arrays. Falls back to hardcoded defaults
// when the DB columns are empty (fresh migration, not yet customised).
router.get('/pattern-config', async (req, res) => {
  try {
    const config = await getPatternConfigFromDB();
    res.json(config);
  } catch (err) {
    console.error('[Admin:AI:PatternConfig]', err.message);
    res.status(500).json({ error: 'Failed to fetch pattern config' });
  }
});

// ── PUT /api/admin/ai/pattern-config ─────────────────────────
// Save editable pattern arrays to DB.
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

// ── POST /api/admin/ai/test-score ─────────────────────────────
// Live-score a job description. Returns pattern breakdown + optional LLM score.
router.post('/test-score', async (req, res) => {
  try {
    const { title, company_name, location, description, requirements } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const job = { title, company_name: company_name || '', location: location || '', description: description || '', requirements: requirements || '' };

    const config = await getPatternConfigFromDB();
    const patternResult = patternScoreDetailed(job, config);

    // Optionally run LLM if enabled and API key is available
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

// ── GET /api/admin/ai/calibration ────────────────────────────
// Score distribution histogram + false positives/negatives from feedback.
router.get('/calibration', async (req, res) => {
  try {
    const [distRes, feedbackRes, falseNegRes, falsePosRes] = await Promise.all([
      // Score distribution: 10 buckets of width 10
      pool.query(`
        SELECT
          (relevance_score / 10) * 10 AS bucket_start,
          COUNT(*)                     AS count
        FROM jobs
        WHERE is_active = TRUE
        GROUP BY bucket_start
        ORDER BY bucket_start
      `),

      // Feedback summary per decision type
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

      // False negatives: jobs you applied to that scored below 65
      pool.query(`
        SELECT j.id, j.title, j.company_name, j.location,
               j.relevance_score, j.ai_decision, j.ai_reasoning
        FROM job_feedback jf
        JOIN jobs j ON j.id = jf.job_id
        WHERE jf.decision IN ('applied') AND j.relevance_score < 65
        ORDER BY j.relevance_score ASC
        LIMIT 15
      `),

      // False positives: jobs you skipped that scored >= 65
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

    // Build full 10-bucket distribution (0-9 through 90-100) filling gaps with 0
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

    // Feedback summary keyed by decision
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

module.exports = router;
