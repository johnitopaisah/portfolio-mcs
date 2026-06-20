'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/user-settings
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM user_settings LIMIT 1');
    if (!rows.length) {
      await pool.query('INSERT INTO user_settings DEFAULT VALUES');
      const r = await pool.query('SELECT * FROM user_settings LIMIT 1');
      return res.json(r.rows[0]);
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/user-settings
router.patch('/', requireAuth, async (req, res, next) => {
  const allowed = [
    'weekly_application_goal', 'goal_start_day', 'job_hunt_active',
    'target_role', 'target_salary_min', 'target_salary_max',
    'target_locations', 'target_work_arrangements',
    'available_from', 'notice_period_days',
  ];
  const fields = [];
  const vals   = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
  vals.push(new Date());
  try {
    const { rows } = await pool.query(
      `UPDATE user_settings SET ${fields.join(', ')}, updated_at = $${i}
       RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/user-settings/automation-rules
router.get('/automation-rules', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM automation_rules ORDER BY id'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/user-settings/automation-rules/:key
router.patch('/automation-rules/:key', requireAuth, async (req, res, next) => {
  const { is_enabled } = req.body;
  if (typeof is_enabled !== 'boolean') {
    return res.status(400).json({ error: 'is_enabled must be boolean' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE automation_rules SET is_enabled=$1 WHERE rule_key=$2 RETURNING *',
      [is_enabled, req.params.key]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
