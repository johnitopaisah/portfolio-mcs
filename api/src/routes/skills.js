const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

/**
 * @swagger
 * /api/skills:
 *   get:
 *     summary: List all skills
 *     description: Returns all skills ordered by category then order_index. Grouped by category on the portfolio frontend.
 *     tags: [Skills]
 *     responses:
 *       200:
 *         description: Array of skills
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Skill'
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, category, proficiency, icon_mime, order_index,
              (icon IS NOT NULL) AS has_icon
       FROM skills ORDER BY category ASC, order_index ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/skills/{id}/icon:
 *   get:
 *     summary: Get skill icon image
 *     description: Returns the skill icon as raw binary (typically SVG or PNG). Cache-Control is set to 24 hours.
 *     tags: [Skills]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Skill icon binary
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Skill not found or no icon uploaded
 */
router.get('/:id/icon', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT icon, icon_mime FROM skills WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].icon) return res.status(404).end();
    res.set('Content-Type', rows[0].icon_mime || 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].icon);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/skills:
 *   post:
 *     summary: Create a new skill
 *     description: Accepts `multipart/form-data`. Maximum icon file size is 1 MB.
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, category, proficiency]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Kubernetes
 *               category:
 *                 type: string
 *                 example: DevOps
 *               proficiency:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               order_index:
 *                 type: integer
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Skill icon image (SVG/PNG, max 1 MB)
 *     responses:
 *       201:
 *         description: Skill created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, upload.single('icon'), async (req, res, next) => {
  try {
    const { name, category, proficiency, order_index } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO skills (name, category, proficiency, icon, icon_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, category, proficiency, icon_mime, order_index`,
      [name, category, parseInt(proficiency),
       req.file?.buffer || null, req.file?.mimetype || null,
       parseInt(order_index || '0')]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/skills/{id}:
 *   put:
 *     summary: Update a skill
 *     description: Partially updates a skill. All fields are optional.
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               proficiency:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               order_index:
 *                 type: integer
 *               icon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Skill updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Skill'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', requireAuth, upload.single('icon'), async (req, res, next) => {
  try {
    const { name, category, proficiency, order_index } = req.body;
    const { rows } = await pool.query(
      `UPDATE skills SET
         name        = COALESCE($1, name),
         category    = COALESCE($2, category),
         proficiency = COALESCE($3, proficiency),
         icon        = COALESCE($4, icon),
         icon_mime   = COALESCE($5, icon_mime),
         order_index = COALESCE($6, order_index)
       WHERE id = $7
       RETURNING id, name, category, proficiency, icon_mime, order_index`,
      [name || null, category || null,
       proficiency ? parseInt(proficiency) : null,
       req.file?.buffer || null, req.file?.mimetype || null,
       order_index !== undefined ? parseInt(order_index) : null,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Skill not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/skills/{id}:
 *   delete:
 *     summary: Delete a skill
 *     tags: [Skills]
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
 *         description: Skill deleted — no content returned
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Skill not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM skills WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Skill not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
