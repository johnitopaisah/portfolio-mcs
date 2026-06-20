'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { generateQuestions } = require('../services/interviewPrepService');

const router = express.Router();

// GET /api/interview-prep/:appId/questions
router.get('/:appId/questions', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT iq.*, ss.title AS star_story_title
       FROM interview_questions iq
       LEFT JOIN star_stories ss ON ss.id = iq.star_story_id
       WHERE iq.application_id=$1
       ORDER BY iq.question_type, iq.id`,
      [req.params.appId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/interview-prep/:appId/generate
router.post('/:appId/generate', requireAuth, async (req, res, next) => {
  try {
    const result = await generateQuestions(req.params.appId);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /api/interview-prep/:appId/questions/:qId
router.patch('/:appId/questions/:qId', requireAuth, async (req, res, next) => {
  const { answer_notes, star_story_id, was_asked } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE interview_questions
       SET answer_notes=$1, star_story_id=$2, was_asked=$3
       WHERE id=$4 AND application_id=$5 RETURNING *`,
      [answer_notes ?? null, star_story_id ?? null, was_asked ?? false,
       req.params.qId, req.params.appId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/interview-prep/:appId/questions/:qId
router.delete('/:appId/questions/:qId', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM interview_questions WHERE id=$1 AND application_id=$2',
      [req.params.qId, req.params.appId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/interview-prep/:appId/debrief
router.patch('/:appId/debrief', requireAuth, async (req, res, next) => {
  const { went_well, improve, follow_up_sent, outcome_feeling, rating } = req.body;
  try {
    const { rows: curr } = await pool.query(
      'SELECT interview_prep FROM applications WHERE id=$1',
      [req.params.appId]
    );
    if (!curr.length) return res.status(404).json({ error: 'Not found' });
    const prep = curr[0].interview_prep || {};
    prep.debrief = { went_well, improve, follow_up_sent, outcome_feeling, rating };
    await pool.query(
      'UPDATE applications SET interview_prep=$1 WHERE id=$2',
      [JSON.stringify(prep), req.params.appId]
    );
    res.json(prep);
  } catch (err) { next(err); }
});

module.exports = router;
