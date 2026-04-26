const router     = require('express').Router();
const pool       = require('../db/client');
const rateLimit  = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { notify }      = require('../services/notify');
const {
  contactSubmissionsTotal,
} = require('../metrics');

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Too many messages sent. Please wait before trying again.' },
  standardHeaders: true, legacyHeaders: false,
  // Count rate-limited requests as a metric
  handler: (req, res) => {
    contactSubmissionsTotal.inc({ status: 'rate_limited' });
    res.status(429).json({ error: 'Too many messages sent. Please wait before trying again.' });
  },
});

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit a contact form message
 *     description: >
 *       Saves the message to the database and fires three parallel notifications:
 *       an owner alert email, a sender acknowledgement email, and an SMS via Twilio.
 *       Notifications use `Promise.allSettled` so a notification failure never
 *       blocks or delays the response.
 *
 *       **Rate limited:** 5 requests per 15 minutes per IP.
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, subject, message]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Recruiter
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@company.com
 *               subject:
 *                 type: string
 *                 example: Job opportunity
 *               message:
 *                 type: string
 *                 example: Hi John, I'd love to connect about a DevOps role we have open.
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Message sent successfully
 *       400:
 *         description: Missing fields or invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', contactLimiter, async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      contactSubmissionsTotal.inc({ status: 'error' });
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      contactSubmissionsTotal.inc({ status: 'error' });
      return res.status(400).json({ error: 'Invalid email address' });
    }

    await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES ($1,$2,$3,$4)',
      [name.trim(), email.trim(), subject.trim(), message.trim()]
    );

    contactSubmissionsTotal.inc({ status: 'success' });

    notify({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() })
      .catch(err => console.error('[notify] Unhandled error:', err));

    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    contactSubmissionsTotal.inc({ status: 'error' });
    next(err);
  }
});

/**
 * @swagger
 * /api/contact:
 *   get:
 *     summary: List all contact messages
 *     description: Returns all contact form submissions ordered by created_at descending.
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of contact messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ContactMessage'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, subject, message, read, created_at FROM contact_messages ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/contact/{id}/read:
 *   patch:
 *     summary: Mark a message as read
 *     description: Sets the `read` flag to `true` for a contact message.
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 read:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Message not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/contact/{id}:
 *   delete:
 *     summary: Delete a contact message
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Message deleted — no content returned
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Message not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Message not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
