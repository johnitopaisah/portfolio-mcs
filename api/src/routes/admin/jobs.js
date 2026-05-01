/**
 * Admin Job API Routes
 * Protected endpoints for managing job ingestion, filtering, and monitoring
 * Requires admin authentication
 */

const express = require('express');
const pool = require('../../db/client');
const { authenticateToken } = require('../../middleware/auth');
const jobIngestionService = require('../../services/jobIngestion/jobIngestionService');
const aiFilteringService = require('../../services/jobIngestion/aiFilteringService');
const notificationService = require('../../services/jobIngestion/notificationService');
const { getIngestionStats, getRecentLogs } = require('../../services/jobIngestion/ingestionLogsService');

const router = express.Router();

// Middleware: Check admin role (you'll need to implement this)
const requireAdmin = (req, res, next) => {
  // TODO: Implement proper admin role checking
  // For now, we'll assume authenticated users can be admins
  if (req.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ============================================================
//  STATS & MONITORING
// ============================================================

/**
 * GET /api/admin/jobs/stats
 * Get job system statistics
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    const statsQuery = `
      SELECT
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_jobs,
        ROUND(AVG(relevance_score)::numeric, 1) as avg_relevance,
        COUNT(CASE WHEN posted_at > NOW() - INTERVAL '7 days' THEN 1 END) as jobs_this_week
      FROM jobs
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    // Get filtering stats
    const filterStats = await aiFilteringService.getFilteringStats(parseInt(hours, 10));
    const alertStats = await notificationService.getAlertStats(parseInt(hours, 10));

    res.json({
      jobs: stats,
      filtering: filterStats,
      alerts: alertStats,
    });
  } catch (error) {
    console.error('[Admin:Stats] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/jobs/logs
 * Get ingestion logs with pagination
 */
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const logs = await getRecentLogs(parseInt(limit, 10), parseInt(offset, 10));

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM job_ingestion_logs');
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      data: logs,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total,
      },
    });
  } catch (error) {
    console.error('[Admin:Logs] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/admin/jobs/logs/:id
 * Get a specific ingestion log with details
 */
router.get('/logs/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM job_ingestion_logs WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Admin:LogDetail] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

/**
 * GET /api/admin/jobs/ingestion-stats
 * Get ingestion statistics for the last N hours
 */
router.get('/ingestion-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hours = 24 } = req.query;

    const stats = await getIngestionStats(parseInt(hours, 10));

    res.json(stats);
  } catch (error) {
    console.error('[Admin:IngestionStats] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch ingestion stats' });
  }
});

// ============================================================
//  MANUAL OPERATIONS
// ============================================================

/**
 * POST /api/admin/jobs/ingest
 * Manually trigger job ingestion from all sources
 */
router.post('/ingest', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Admin] Manual ingestion triggered');

    // Run in background
    jobIngestionService.ingestAllJobs().catch((error) => {
      console.error('[Admin:Ingest] Background job failed:', error);
    });

    res.json({
      message: 'Ingestion started in background',
      status: 'pending',
    });
  } catch (error) {
    console.error('[Admin:Ingest] Error:', error.message);
    res.status(500).json({ error: 'Failed to trigger ingestion' });
  }
});

/**
 * POST /api/admin/jobs/filter
 * Manually trigger AI filtering on unprocessed jobs
 */
router.post('/filter', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Admin] Manual filtering triggered');

    // Run in background
    aiFilteringService.filterUnprocessedJobs().catch((error) => {
      console.error('[Admin:Filter] Background job failed:', error);
    });

    res.json({
      message: 'Filtering started in background',
      status: 'pending',
    });
  } catch (error) {
    console.error('[Admin:Filter] Error:', error.message);
    res.status(500).json({ error: 'Failed to trigger filtering' });
  }
});

/**
 * POST /api/admin/jobs/send-alerts
 * Manually trigger alert sending
 */
router.post('/send-alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Admin] Manual alert sending triggered');

    // Run in background
    notificationService.sendNewJobAlerts().catch((error) => {
      console.error('[Admin:Alerts] Background job failed:', error);
    });

    res.json({
      message: 'Alerts sending started in background',
      status: 'pending',
    });
  } catch (error) {
    console.error('[Admin:Alerts] Error:', error.message);
    res.status(500).json({ error: 'Failed to trigger alerts' });
  }
});

// ============================================================
//  JOB MANAGEMENT
// ============================================================

/**
 * GET /api/admin/jobs/raw
 * Get raw (unprocessed) jobs
 */
router.get('/raw', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT * FROM jobs_raw
      WHERE is_duplicate = FALSE
      ORDER BY posted_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [parseInt(limit, 10), parseInt(offset, 10)]);

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM jobs_raw WHERE is_duplicate = FALSE'
    );

    res.json({
      data: result.rows,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total: parseInt(countResult.rows[0].total, 10),
      },
    });
  } catch (error) {
    console.error('[Admin:RawJobs] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch raw jobs' });
  }
});

/**
 * DELETE /api/admin/jobs/:id
 * Soft-delete a job (mark as inactive)
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      UPDATE jobs
      SET is_active = FALSE, expires_at = NOW()
      WHERE id = $1
      RETURNING id;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job deactivated', id: result.rows[0].id });
  } catch (error) {
    console.error('[Admin:Delete] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

/**
 * PATCH /api/admin/jobs/:id
 * Update job relevance score or decision
 */
router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { relevance_score, ai_decision, ai_reasoning } = req.body;

    let query = 'UPDATE jobs SET';
    const params = [];
    let paramCount = 1;

    if (relevance_score !== undefined) {
      query += ` relevance_score = $${paramCount},`;
      params.push(relevance_score);
      paramCount++;
    }

    if (ai_decision) {
      query += ` ai_decision = $${paramCount},`;
      params.push(ai_decision);
      paramCount++;
    }

    if (ai_reasoning) {
      query += ` ai_reasoning = $${paramCount},`;
      params.push(ai_reasoning);
      paramCount++;
    }

    query += ` updated_at = NOW() WHERE id = $${paramCount} RETURNING *;`;
    params.push(id);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Admin:Patch] Error:', error.message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ============================================================
//  SYSTEM CONFIGURATION
// ============================================================

/**
 * GET /api/admin/jobs/config
 * Get current job system configuration
 */
router.get('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const config = {
      pollInterval: process.env.JOB_POLL_INTERVAL_MINUTES || '15',
      useLlmFiltering: process.env.USE_LLM_FILTERING === 'true',
      maxJobAge: '720', // 30 days
      notificationsEnabled: true,
      apiKeys: {
        jooble: !!process.env.JOOBLE_API_KEY,
        remoteOk: !!process.env.REMOTE_OK_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      },
    };

    res.json(config);
  } catch (error) {
    console.error('[Admin:Config] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

module.exports = router;
