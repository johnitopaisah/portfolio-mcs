'use strict';

const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const pool       = require('../db/client');
const router     = require('express').Router();
const { sendPasswordResetEmail } = require('../services/notify');

// POST /api/auth/login
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
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token, username: user.username });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
// Matches the submitted email against the profile table (where the admin's real
// email is stored). Always returns the same response to prevent email enumeration.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Check if the email matches the admin's profile email
    const { rows } = await pool.query(
      'SELECT email FROM profile WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()]
    );

    if (rows.length > 0) {
      const token    = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

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

    // Always return the same response
    res.json({
      message: 'If that email is associated with an admin account, a reset link has been sent.',
    });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
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
