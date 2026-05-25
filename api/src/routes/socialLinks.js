const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');

// Public — returns only visible links ordered by order_index
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, platform, label, url, order_index
       FROM social_links
       WHERE visible = true
       ORDER BY order_index ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin — returns all links including hidden
router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, platform, label, url, order_index, visible, created_at
       FROM social_links
       ORDER BY order_index ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin — create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { platform, label, url, order_index = 0, visible = true } = req.body;
    if (!platform || !label || !url) {
      return res.status(400).json({ error: 'platform, label, and url are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO social_links (platform, label, url, order_index, visible)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, platform, label, url, order_index, visible`,
      [platform, label, url, order_index, visible]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Admin — update
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { platform, label, url, order_index, visible } = req.body;
    const { rows } = await pool.query(
      `UPDATE social_links SET
         platform    = COALESCE($1, platform),
         label       = COALESCE($2, label),
         url         = COALESCE($3, url),
         order_index = COALESCE($4, order_index),
         visible     = COALESCE($5, visible)
       WHERE id = $6
       RETURNING id, platform, label, url, order_index, visible`,
      [
        platform ?? null, label ?? null, url ?? null,
        order_index ?? null, visible ?? null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Link not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Admin — delete
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM social_links WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Link not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
