'use strict';

const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const pool       = require('../db/client');
const router     = require('express').Router();
const { sendPasswordResetEmail } = require('../services/notify');
const {
  authAttemptsTotal,
  passwordResetRequestsTotal,
} = require('../metrics');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Admin login
 *     description: Authenticates the admin user and returns a signed JWT token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 example: your-password
 *     responses:
 *       200:
 *         description: Login successful — returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT to use as Bearer token on admin endpoints
 *                 username:
 *                   type: string
 *       400:
 *         description: Missing username or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password are required' });

    const { rows } = await pool.query(
      'SELECT id, username, password_hash FROM admin_user WHERE username = $1',
      [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      authAttemptsTotal.inc({ result: 'failure' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    authAttemptsTotal.inc({ result: 'success' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token, username: user.username });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     description: >
 *       Sends a time-limited reset link to the admin's registered email address.
 *       Always returns the same response to prevent email enumeration attacks.
 *       The reset token expires after 1 hour.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: connect@johnisah.com
 *     responses:
 *       200:
 *         description: Response is always identical regardless of whether the email matched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: If that email is associated with an admin account, a reset link has been sent.
 *       400:
 *         description: Email field missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    passwordResetRequestsTotal.inc();

    const { rows } = await pool.query(
      'SELECT email FROM profile WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()]
    );

    if (rows.length > 0) {
      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        'INSERT INTO password_reset_tokens (token, expires_at) VALUES ($1, $2)',
        [token, expiresAt]
      );

      const adminUrl  = process.env.ADMIN_URL || 'http://localhost:3001';
      const resetLink = `${adminUrl}/reset-password?token=${token}`;

      sendPasswordResetEmail({ email: email.trim(), resetLink, expiresAt })
        .catch(err => console.error('[auth] Reset email failed:', err.message));

      console.log(`[auth] Password reset token created for: ${email.trim()}`);
    } else {
      console.log(`[auth] Forgot-password attempt for unknown email: ${email.trim()}`);
    }

    res.json({
      message: 'If that email is associated with an admin account, a reset link has been sent.',
    });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset admin password using a token
 *     description: >
 *       Consumes a single-use password reset token (obtained via forgot-password)
 *       and updates the admin password. The token is immediately invalidated after use.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The reset token received in the email link
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: newSecurePassword123
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully. You can now sign in.
 *       400:
 *         description: Missing fields, password too short, or token invalid/expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { rows } = await pool.query(
      `SELECT id FROM password_reset_tokens
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query('BEGIN');
    await pool.query('UPDATE admin_user SET password_hash = $1', [passwordHash]);
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1',
      [token]
    );
    await pool.query('COMMIT');

    console.log('[auth] Admin password reset successfully');
    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    next(err);
  }
});

module.exports = router;
