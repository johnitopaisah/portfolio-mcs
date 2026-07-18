'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/company-research/:appId
router.get('/:appId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM company_research WHERE application_id=$1',
      [req.params.appId]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

// PUT /api/company-research/:appId  (upsert)
router.put('/:appId', requireAuth, async (req, res, next) => {
  const {
    funding_stage, employee_count_range, glassdoor_rating,
    interview_difficulty, headquarters, founded_year,
    tech_stack_confirmed, competitors, recent_news,
    culture_notes, red_flags, links, raw_notes,
  } = req.body;

  try {
    const { rows } = await pool.query(`
      INSERT INTO company_research
        (application_id, funding_stage, employee_count_range, glassdoor_rating,
         interview_difficulty, headquarters, founded_year,
         tech_stack_confirmed, competitors, recent_news,
         culture_notes, red_flags, links, raw_notes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
      ON CONFLICT (application_id) DO UPDATE SET
        funding_stage         = EXCLUDED.funding_stage,
        employee_count_range  = EXCLUDED.employee_count_range,
        glassdoor_rating      = EXCLUDED.glassdoor_rating,
        interview_difficulty  = EXCLUDED.interview_difficulty,
        headquarters          = EXCLUDED.headquarters,
        founded_year          = EXCLUDED.founded_year,
        tech_stack_confirmed  = EXCLUDED.tech_stack_confirmed,
        competitors           = EXCLUDED.competitors,
        recent_news           = EXCLUDED.recent_news,
        culture_notes         = EXCLUDED.culture_notes,
        red_flags             = EXCLUDED.red_flags,
        links                 = EXCLUDED.links,
        raw_notes             = EXCLUDED.raw_notes,
        updated_at            = NOW()
      RETURNING *
    `, [
      req.params.appId, funding_stage || null, employee_count_range || null,
      glassdoor_rating || null, interview_difficulty || null,
      headquarters || null, founded_year || null,
      tech_stack_confirmed || [], competitors || [],
      recent_news || null, culture_notes || null, red_flags || null,
      JSON.stringify(links || []), raw_notes || null,
    ]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/company-research/:appId/reference-usage
router.get('/:appId/references', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT ru.*, r.name, r.title, r.organization
      FROM reference_usage ru
      JOIN referees r ON r.id = ru.referee_id
      WHERE ru.application_id = $1
      ORDER BY ru.created_at
    `, [req.params.appId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-research/:appId/references
router.post('/:appId/references', requireAuth, async (req, res, next) => {
  const { referee_id, asked_at, note } = req.body;
  if (!referee_id) return res.status(400).json({ error: 'referee_id required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO reference_usage (application_id, referee_id, asked_at, note)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.appId, referee_id, asked_at || null, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/company-research/:appId/references/:id
router.patch('/:appId/references/:id', requireAuth, async (req, res, next) => {
  const { confirmed_at, note } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE reference_usage SET confirmed_at=$1, note=$2 WHERE id=$3 AND application_id=$4 RETURNING *`,
      [confirmed_at || null, note || null, req.params.id, req.params.appId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/company-research/:appId/references/:id
router.delete('/:appId/references/:id', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM reference_usage WHERE id=$1 AND application_id=$2',
      [req.params.id, req.params.appId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
