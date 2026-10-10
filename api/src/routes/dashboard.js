'use strict';

const express                             = require('express');
const { requireAuth }                     = require('../middleware/auth');
const { getDashboardStats }               = require('../services/dashboardService');
const { runAllRules }                     = require('../services/automationService');

const router = express.Router();

// GET /api/dashboard/stats
// ?tz=<IANA zone> sets where "today" starts for the per-day counts.
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const stats = await getDashboardStats({ timeZone: req.query.tz });
    res.json(stats);
  } catch (err) { next(err); }
});

// POST /api/dashboard/run-automation  (manual trigger)
router.post('/run-automation', requireAuth, async (_req, res, next) => {
  try {
    const result = await runAllRules();
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
