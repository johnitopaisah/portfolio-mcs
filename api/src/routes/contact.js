const router     = require('express').Router();
const pool       = require('../db/client');
const rateLimit  = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { notify }      = require('../services/notify');

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Too many messages sent. Please wait before trying again.' },
  standardHeaders: true, legacyHeaders: false,
});

// POST /api/contact  — public, rate-limited
router.post('/', contactLimiter, async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message)
      return res.status(400).json({ error: 'All fields are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Invalid email address' });

    // Save to database first
    await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES ($1,$2,$3,$4)',
      [name.trim(), email.trim(), subject.trim(), message.trim()]
    );

    // Fire notifications async — never blocks or delays the response
    notify({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() })
      .catch(err => console.error('[notify] Unhandled error:', err));

    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (err) { next(err); }
});

// GET /api/contact  — admin
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, subject, message, read, created_at FROM contact_messages ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/contact/:id/read  — admin
router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE contact_messages SET read = TRUE WHERE id = $1 RETURNING id, read',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/contact/:id  — admin
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Message not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
