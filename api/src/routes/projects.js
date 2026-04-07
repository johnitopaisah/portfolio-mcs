const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload       = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// Allow up to 20 images in one multi-upload request
const uploadMany   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────
//  Existing routes — UNCHANGED
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: List published projects
 *     description: Returns all projects where `published = true`, ordered by `order_index` then `created_at`.
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: Array of published projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, tech_stack, live_url, repo_url,
              image_mime, featured, order_index, created_at,
              start_date, end_date, ongoing,
              (image IS NOT NULL) AS has_image
       FROM projects WHERE published = TRUE
       ORDER BY order_index ASC, created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/all:
 *   get:
 *     summary: List all projects including drafts
 *     description: Admin endpoint — returns all projects regardless of published status.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of all projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 *       401:
 *         description: Unauthorised
 */
router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, tech_stack, live_url, repo_url,
              image_mime, featured, published, order_index, created_at, updated_at,
              start_date, end_date, ongoing,
              (image IS NOT NULL) AS has_image
       FROM projects ORDER BY order_index ASC, created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get a single published project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       404:
 *         description: Project not found or not published
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, tech_stack, live_url, repo_url,
              image_mime, featured, order_index, created_at,
              start_date, end_date, ongoing,
              (image IS NOT NULL) AS has_image
       FROM projects WHERE id = $1 AND published = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/image:
 *   get:
 *     summary: Get project cover/thumbnail image
 *     description: Returns the project cover image as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project image binary
 *       404:
 *         description: Project not found or no image uploaded
 */
router.get('/:id/image', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT image, image_mime FROM projects WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].image) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].image);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               tech_stack: { type: string, description: "JSON array string" }
 *               live_url: { type: string, format: uri }
 *               repo_url: { type: string, format: uri }
 *               featured: { type: string, enum: ['true','false'] }
 *               published: { type: string, enum: ['true','false'] }
 *               order_index: { type: integer }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *               ongoing: { type: string, enum: ['true','false'] }
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       401:
 *         description: Unauthorised
 */
router.post('/', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const {
      title, description, live_url, repo_url,
      featured, published, order_index,
      start_date, end_date, ongoing,
    } = req.body;
    const tech_stack = JSON.parse(req.body.tech_stack || '[]');
    const { rows } = await pool.query(
      `INSERT INTO projects
         (title, description, tech_stack, live_url, repo_url, image, image_mime,
          featured, published, order_index, start_date, end_date, ongoing)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, title, description, tech_stack, live_url, repo_url,
                 image_mime, featured, published, order_index,
                 start_date, end_date, ongoing, created_at`,
      [
        title, description, tech_stack,
        live_url || null, repo_url || null,
        req.file?.buffer || null, req.file?.mimetype || null,
        featured === 'true', published === 'true',
        parseInt(order_index || '0'),
        start_date || null,
        end_date   || null,
        ongoing === 'true',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Project not found
 */
router.put('/:id', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const {
      title, description, live_url, repo_url,
      featured, published, order_index,
      start_date, end_date, ongoing,
    } = req.body;
    const tech_stack = req.body.tech_stack ? JSON.parse(req.body.tech_stack) : null;

    const { rows } = await pool.query(
      `UPDATE projects SET
         title       = COALESCE($1,  title),
         description = COALESCE($2,  description),
         tech_stack  = COALESCE($3,  tech_stack),
         live_url    = COALESCE($4,  live_url),
         repo_url    = COALESCE($5,  repo_url),
         image       = COALESCE($6,  image),
         image_mime  = COALESCE($7,  image_mime),
         featured    = COALESCE($8,  featured),
         published   = COALESCE($9,  published),
         order_index = COALESCE($10, order_index),
         start_date  = COALESCE($11, start_date),
         end_date    = COALESCE($12, end_date),
         ongoing     = COALESCE($13, ongoing)
       WHERE id = $14
       RETURNING id, title, description, tech_stack, live_url, repo_url,
                 image_mime, featured, published, order_index,
                 start_date, end_date, ongoing, updated_at`,
      [
        title || null, description || null, tech_stack,
        live_url || null, repo_url || null,
        req.file?.buffer || null, req.file?.mimetype || null,
        featured  !== undefined ? featured  === 'true' : null,
        published !== undefined ? published === 'true' : null,
        order_index !== undefined ? parseInt(order_index) : null,
        start_date || null,
        ongoing === 'true' ? null : (end_date || null),
        ongoing !== undefined ? ongoing === 'true' : null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Project deleted
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Project not found
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Project not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  NEW — Demo image slideshow routes
// ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/projects/{id}/images:
 *   get:
 *     summary: List demo images for a project
 *     description: >
 *       Returns metadata for all slideshow images attached to a project,
 *       ordered by order_index. Does NOT return binary data — use
 *       GET /api/projects/:id/images/:imgId/file to retrieve each image.
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Array of image metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   caption: { type: string, nullable: true }
 *                   order_index: { type: integer }
 *                   image_mime: { type: string }
 *                   created_at: { type: string, format: date-time }
 */
router.get('/:id/images', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, caption, order_index, image_mime, created_at
       FROM project_images
       WHERE project_id = $1
       ORDER BY order_index ASC, created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/images/{imgId}/file:
 *   get:
 *     summary: Serve a single demo image binary
 *     description: Returns the raw image binary. Cache-Control is set to 24 hours.
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: imgId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Image binary
 *       404:
 *         description: Image not found
 */
router.get('/:id/images/:imgId/file', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT image, image_mime FROM project_images
       WHERE id = $1 AND project_id = $2`,
      [req.params.imgId, req.params.id]
    );
    if (!rows.length || !rows[0].image) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].image);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/images:
 *   post:
 *     summary: Upload one or more demo images for a project
 *     description: >
 *       Accepts multipart/form-data with a field named `images` (multiple files allowed).
 *       Optional fields: `captions` (JSON array of strings, one per file),
 *       `order_start` (integer, default 0 — first image gets this order_index).
 *       Maximum 20 images per project total. Maximum 5 MB per file.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               captions:
 *                 type: string
 *                 description: "JSON array of captions e.g. [\"System Overview\",\"API Performance\"]"
 *               order_start:
 *                 type: integer
 *                 description: "order_index for the first uploaded image (default: current max + 1)"
 *     responses:
 *       201:
 *         description: Images uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   caption: { type: string }
 *                   order_index: { type: integer }
 *       400:
 *         description: No files provided or limit exceeded
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Project not found
 */
router.post('/:id/images', requireAuth, uploadMany.array('images', 20), async (req, res, next) => {
  try {
    // Verify project exists
    const { rows: proj } = await pool.query(
      'SELECT id FROM projects WHERE id = $1', [req.params.id]
    );
    if (!proj.length) return res.status(404).json({ error: 'Project not found' });

    const files = req.files;
    if (!files || !files.length) {
      return res.status(400).json({ error: 'No images provided' });
    }

    // Check existing image count to enforce 20-image cap
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM project_images WHERE project_id = $1',
      [req.params.id]
    );
    const existing = countRows[0].cnt;
    if (existing + files.length > 20) {
      return res.status(400).json({
        error: `Upload would exceed the 20-image limit. Currently ${existing} images, uploading ${files.length}.`,
      });
    }

    // Parse optional captions array
    let captions = [];
    try { captions = JSON.parse(req.body.captions || '[]'); } catch { captions = []; }

    // Determine starting order_index
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(order_index), -1) AS max FROM project_images WHERE project_id = $1',
      [req.params.id]
    );
    const orderStart = req.body.order_start !== undefined
      ? parseInt(req.body.order_start)
      : maxRows[0].max + 1;

    // Insert all images
    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      const file    = files[i];
      const caption = captions[i] || null;
      const { rows } = await pool.query(
        `INSERT INTO project_images (project_id, image, image_mime, caption, order_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, caption, order_index, image_mime, created_at`,
        [req.params.id, file.buffer, file.mimetype, caption, orderStart + i]
      );
      inserted.push(rows[0]);
    }

    res.status(201).json(inserted);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/images/{imgId}:
 *   put:
 *     summary: Update a demo image caption or order
 *     description: Updates caption and/or order_index of a single demo image. No file re-upload.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: imgId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caption: { type: string, nullable: true }
 *               order_index: { type: integer }
 *     responses:
 *       200:
 *         description: Image metadata updated
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Image not found
 */
router.put('/:id/images/:imgId', requireAuth, async (req, res, next) => {
  try {
    const { caption, order_index } = req.body;
    const { rows } = await pool.query(
      `UPDATE project_images SET
         caption     = COALESCE($1, caption),
         order_index = COALESCE($2, order_index)
       WHERE id = $3 AND project_id = $4
       RETURNING id, caption, order_index, image_mime, created_at`,
      [
        caption     !== undefined ? caption : null,
        order_index !== undefined ? parseInt(order_index) : null,
        req.params.imgId,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/images/{imgId}:
 *   delete:
 *     summary: Delete a single demo image
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: imgId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Image deleted
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Image not found
 */
router.delete('/:id/images/:imgId', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM project_images WHERE id = $1 AND project_id = $2',
      [req.params.imgId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Image not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
