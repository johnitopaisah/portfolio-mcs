const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * @swagger
 * /api/experiences:
 *   get:
 *     summary: List all work experiences
 *     description: Returns all experience entries ordered by order_index then start_date descending.
 *     tags: [Experiences]
 *     responses:
 *       200:
 *         description: Array of experiences
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Experience'
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, company, role, description, start_date, end_date,
              ongoing, tech_stack, logo_mime, order_index,
              (logo IS NOT NULL) AS has_logo
       FROM experiences ORDER BY order_index ASC, start_date DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/experiences/{id}/logo:
 *   get:
 *     summary: Get company logo image
 *     description: Returns the company logo as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Experiences]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Company logo binary
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Experience not found or no logo uploaded
 */
router.get('/:id/logo', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT logo, logo_mime FROM experiences WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].logo) return res.status(404).end();
    res.set('Content-Type', rows[0].logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].logo);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/experiences:
 *   post:
 *     summary: Create a new experience entry
 *     description: >
 *       Accepts `multipart/form-data`. `tech_stack` must be a JSON array string.
 *       When `ongoing` is `'true'`, `end_date` is automatically set to null.
 *       Maximum logo file size is 2 MB.
 *     tags: [Experiences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [company, role, description, start_date]
 *             properties:
 *               company:
 *                 type: string
 *                 example: ALX Africa
 *               role:
 *                 type: string
 *                 example: DevOps Engineer
 *               description:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: '2023-01-01'
 *               end_date:
 *                 type: string
 *                 format: date
 *                 example: '2024-06-01'
 *               ongoing:
 *                 type: string
 *                 enum: ['true', 'false']
 *                 description: When true, end_date is ignored and set to null
 *               tech_stack:
 *                 type: string
 *                 description: JSON array string e.g. '["Kubernetes","Docker"]'
 *               order_index:
 *                 type: integer
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Company logo image (max 2 MB)
 *     responses:
 *       201:
 *         description: Experience created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Experience'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const { company, role, description, start_date, end_date, order_index, ongoing } = req.body;
    const tech_stack = JSON.parse(req.body.tech_stack || '[]');
    const isOngoing  = ongoing === 'true';

    const { rows } = await pool.query(
      `INSERT INTO experiences
         (company, role, description, start_date, end_date, ongoing,
          tech_stack, logo, logo_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, company, role, description, start_date, end_date,
                 ongoing, tech_stack, logo_mime, order_index`,
      [
        company, role, description, start_date,
        isOngoing ? null : (end_date || null),
        isOngoing,
        tech_stack,
        req.file?.buffer || null, req.file?.mimetype || null,
        parseInt(order_index || '0'),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/experiences/{id}:
 *   put:
 *     summary: Update an experience entry
 *     description: >
 *       Partially updates an experience. All fields are optional.
 *       When `ongoing` is `'true'`, `end_date` is automatically cleared to null.
 *     tags: [Experiences]
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
 *               company:
 *                 type: string
 *               role:
 *                 type: string
 *               description:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *               ongoing:
 *                 type: string
 *                 enum: ['true', 'false']
 *               tech_stack:
 *                 type: string
 *               order_index:
 *                 type: integer
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Experience updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Experience'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Experience not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const { company, role, description, start_date, end_date, order_index, ongoing } = req.body;
    const tech_stack = req.body.tech_stack ? JSON.parse(req.body.tech_stack) : null;
    const isOngoing  = ongoing !== undefined ? ongoing === 'true' : null;

    const { rows } = await pool.query(
      `UPDATE experiences SET
         company     = COALESCE($1,  company),
         role        = COALESCE($2,  role),
         description = COALESCE($3,  description),
         start_date  = COALESCE($4,  start_date),
         end_date    = COALESCE($5,  end_date),
         ongoing     = COALESCE($6,  ongoing),
         tech_stack  = COALESCE($7,  tech_stack),
         logo        = COALESCE($8,  logo),
         logo_mime   = COALESCE($9,  logo_mime),
         order_index = COALESCE($10, order_index)
       WHERE id = $11
       RETURNING id, company, role, description, start_date, end_date,
                 ongoing, tech_stack, logo_mime, order_index, updated_at`,
      [
        company     || null,
        role        || null,
        description || null,
        start_date  || null,
        isOngoing === true ? null : (end_date || null),
        isOngoing,
        tech_stack,
        req.file?.buffer   || null,
        req.file?.mimetype || null,
        order_index !== undefined ? parseInt(order_index) : null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/experiences/{id}:
 *   delete:
 *     summary: Delete an experience entry
 *     tags: [Experiences]
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
 *         description: Experience deleted — no content returned
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Experience not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM experiences WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Experience not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
