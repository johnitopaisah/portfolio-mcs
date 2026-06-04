const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');

/**
 * @swagger
 * /api/social-links:
 *   get:
 *     summary: List visible social / contact links
 *     description: Returns all links where `visible = true`, ordered by `order_index`.
 *     tags: [Social Links]
 *     responses:
 *       200:
 *         description: Array of social link records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/SocialLink' }
 */
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

/**
 * @swagger
 * /api/social-links/all:
 *   get:
 *     summary: List all social links including hidden (admin)
 *     description: Returns all links regardless of visibility. Requires admin JWT.
 *     tags: [Social Links]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of all social link records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/SocialLink'
 *                   - type: object
 *                     properties:
 *                       visible:    { type: boolean }
 *                       created_at: { type: string, format: date-time }
 *       401:
 *         description: Unauthorised
 */
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

/**
 * @swagger
 * /api/social-links:
 *   post:
 *     summary: Create a social link (admin)
 *     description: Requires admin JWT.
 *     tags: [Social Links]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [platform, label, url]
 *             properties:
 *               platform:    { type: string, example: GitHub }
 *               label:       { type: string, example: GitHub }
 *               url:         { type: string, format: uri, example: 'https://github.com/johnitopaisah' }
 *               order_index: { type: integer, default: 0 }
 *               visible:     { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Social link created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocialLink' }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 */
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

/**
 * @swagger
 * /api/social-links/{id}:
 *   put:
 *     summary: Update a social link (admin)
 *     description: Partial update — only provided fields are changed. Requires admin JWT.
 *     tags: [Social Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platform:    { type: string }
 *               label:       { type: string }
 *               url:         { type: string, format: uri }
 *               order_index: { type: integer }
 *               visible:     { type: boolean }
 *     responses:
 *       200:
 *         description: Updated social link
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SocialLink' }
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/social-links/{id}:
 *   delete:
 *     summary: Delete a social link (admin)
 *     description: Permanently removes the social link. Requires admin JWT.
 *     tags: [Social Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
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
