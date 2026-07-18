'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/portfolio-items
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM portfolio_items ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/portfolio-items
router.post('/', requireAuth, async (req, res, next) => {
  const { title, description, url, item_type, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO portfolio_items (title, description, url, item_type, tags)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title, description || null, url || null, item_type || 'other', tags || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/portfolio-items/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  const { title, description, url, item_type, tags } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE portfolio_items
       SET title=$1, description=$2, url=$3, item_type=$4, tags=$5
       WHERE id=$6 RETURNING *`,
      [title, description || null, url || null, item_type || 'other', tags || [], req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/portfolio-items/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM portfolio_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Per-application portfolio links ──────────────────────────────────
// GET /api/portfolio-items/application/:appId
router.get('/application/:appId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT pi.*, api.note, api.id AS link_id
       FROM portfolio_items pi
       JOIN application_portfolio_items api ON api.portfolio_item_id = pi.id
       WHERE api.application_id = $1
       ORDER BY api.created_at`,
      [req.params.appId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/portfolio-items/application/:appId  { portfolio_item_id, note }
router.post('/application/:appId', requireAuth, async (req, res, next) => {
  const { portfolio_item_id, note } = req.body;
  if (!portfolio_item_id) return res.status(400).json({ error: 'portfolio_item_id required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO application_portfolio_items (application_id, portfolio_item_id, note)
       VALUES ($1,$2,$3)
       ON CONFLICT (application_id, portfolio_item_id) DO UPDATE SET note=EXCLUDED.note
       RETURNING *`,
      [req.params.appId, portfolio_item_id, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/portfolio-items/application/:appId/:linkId
router.delete('/application/:appId/:linkId', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM application_portfolio_items WHERE id=$1 AND application_id=$2',
      [req.params.linkId, req.params.appId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
