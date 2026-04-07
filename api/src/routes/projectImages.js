const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB per image
});

const MAX_IMAGES_PER_PROJECT = 20;

/**
 * @swagger
 * /api/projects/{id}/images:
 *   get:
 *     summary: List demo images for a project
 *     description: Returns metadata for all demo slideshow images. Does not return binary data.
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Array of image metadata ordered by order_index
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:          { type: string, format: uuid }
 *                   project_id:  { type: string, format: uuid }
 *                   caption:     { type: string, nullable: true }
 *                   order_index: { type: integer }
 *                   created_at:  { type: string, format: date-time }
 */
router.get('/:id/images', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, project_id, caption, order_index, created_at
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
 *     summary: Serve a demo image binary
 *     description: Returns the raw binary image. Cached for 24 hours.
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
 *     summary: Upload a demo image for a project
 *     description: >
 *       Adds a new demo image to the project slideshow.
 *       Max 20 images per project, max 5 MB per image.
 *       Accepts multipart/form-data.
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
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *                 description: Optional label shown below the slide
 *               order_index:
 *                 type: integer
 *                 description: Display order (lower = first)
 *     responses:
 *       201:
 *         description: Image uploaded
 *       400:
 *         description: No image file or limit reached
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Project not found
 */
router.post('/:id/images', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });

    // Verify project exists
    const { rows: proj } = await pool.query(
      'SELECT id FROM projects WHERE id = $1', [req.params.id]
    );
    if (!proj.length) return res.status(404).json({ error: 'Project not found' });

    // Enforce max 20 images
    const { rows: count } = await pool.query(
      'SELECT COUNT(*) AS n FROM project_images WHERE project_id = $1',
      [req.params.id]
    );
    if (parseInt(count[0].n, 10) >= MAX_IMAGES_PER_PROJECT) {
      return res.status(400).json({
        error: `Maximum ${MAX_IMAGES_PER_PROJECT} demo images allowed per project`,
      });
    }

    const { caption, order_index } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO project_images (project_id, image, image_mime, caption, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, project_id, caption, order_index, created_at`,
      [
        req.params.id,
        req.file.buffer,
        req.file.mimetype,
        caption?.trim() || null,
        parseInt(order_index || '0', 10),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/projects/{id}/images/{imgId}:
 *   put:
 *     summary: Update a demo image caption or order
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
 *               caption:     { type: string }
 *               order_index: { type: integer }
 *     responses:
 *       200:
 *         description: Updated image metadata
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Image not found
 */
router.put('/:id/images/:imgId', requireAuth, async (req, res, next) => {
  try {
    const { caption, order_index } = req.body;
    const { rows } = await pool.query(
      `UPDATE project_images
       SET caption     = COALESCE($1, caption),
           order_index = COALESCE($2, order_index)
       WHERE id = $3 AND project_id = $4
       RETURNING id, project_id, caption, order_index, created_at`,
      [
        caption !== undefined ? caption.trim() || null : null,
        order_index !== undefined ? parseInt(order_index, 10) : null,
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
 *     summary: Delete a demo image
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
 *         description: Deleted
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
