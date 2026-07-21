const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const cache  = require('../services/contentCache');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const CACHE_KEY = 'certifications:public';

/**
 * @swagger
 * /api/certifications:
 *   get:
 *     summary: List all certifications
 *     description: Returns all certifications ordered by order_index then issue_date descending.
 *     tags: [Certifications]
 *     responses:
 *       200:
 *         description: Array of certifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Certification'
 */
router.get('/', async (req, res, next) => {
  try {
    const rows = await cache.getOrSet(CACHE_KEY, async () => {
      const { rows } = await pool.query(
        `SELECT id, name, issuer, issue_date, expiry_date,
                credential_id, credential_url, image_mime, order_index,
                (image IS NOT NULL) AS has_image
         FROM certifications ORDER BY order_index ASC, issue_date DESC`
      );
      return rows;
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/certifications/{id}/image:
 *   get:
 *     summary: Get certification badge image
 *     description: Returns the certification image as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Certifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Certification image binary
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
 *         description: Certification not found or no image uploaded
 */
router.get('/:id/image', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT image, image_mime FROM certifications WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].image) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].image);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/certifications:
 *   post:
 *     summary: Create a new certification
 *     description: Accepts `multipart/form-data`. Maximum image file size is 3 MB.
 *     tags: [Certifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, issuer, issue_date]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Certified Kubernetes Administrator
 *               issuer:
 *                 type: string
 *                 example: CNCF
 *               issue_date:
 *                 type: string
 *                 format: date
 *                 example: '2024-03-15'
 *               expiry_date:
 *                 type: string
 *                 format: date
 *                 example: '2027-03-15'
 *               credential_id:
 *                 type: string
 *               credential_url:
 *                 type: string
 *                 format: uri
 *               order_index:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Certification badge image (max 3 MB)
 *     responses:
 *       201:
 *         description: Certification created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Certification'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const { name, issuer, issue_date, expiry_date, credential_id, credential_url, order_index } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO certifications
         (name, issuer, issue_date, expiry_date, credential_id, credential_url, image, image_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, name, issuer, issue_date, expiry_date, credential_id, credential_url, image_mime, order_index`,
      [name, issuer, issue_date, expiry_date || null,
       credential_id || null, credential_url || null,
       req.file?.buffer || null, req.file?.mimetype || null,
       parseInt(order_index || '0')]
    );
    cache.invalidate(CACHE_KEY);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/certifications/{id}:
 *   put:
 *     summary: Update a certification
 *     description: Partially updates a certification. All fields are optional.
 *     tags: [Certifications]
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
 *               issuer:
 *                 type: string
 *               issue_date:
 *                 type: string
 *                 format: date
 *               expiry_date:
 *                 type: string
 *                 format: date
 *               credential_id:
 *                 type: string
 *               credential_url:
 *                 type: string
 *                 format: uri
 *               order_index:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Certification updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Certification'
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Certification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const { name, issuer, issue_date, expiry_date, credential_id, credential_url, order_index } = req.body;
    const { rows } = await pool.query(
      `UPDATE certifications SET
         name           = COALESCE($1, name),
         issuer         = COALESCE($2, issuer),
         issue_date     = COALESCE($3, issue_date),
         expiry_date    = COALESCE($4, expiry_date),
         credential_id  = COALESCE($5, credential_id),
         credential_url = COALESCE($6, credential_url),
         image          = COALESCE($7, image),
         image_mime     = COALESCE($8, image_mime),
         order_index    = COALESCE($9, order_index)
       WHERE id = $10
       RETURNING id, name, issuer, issue_date, expiry_date, credential_id, credential_url, image_mime, order_index, updated_at`,
      [name || null, issuer || null, issue_date || null,
       expiry_date || null, credential_id || null, credential_url || null,
       req.file?.buffer || null, req.file?.mimetype || null,
       order_index !== undefined ? parseInt(order_index) : null,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Certification not found' });
    cache.invalidate(CACHE_KEY);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/certifications/{id}:
 *   delete:
 *     summary: Delete a certification
 *     tags: [Certifications]
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
 *         description: Certification deleted — no content returned
 *       401:
 *         description: Unauthorised
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Certification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM certifications WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Certification not found' });
    cache.invalidate(CACHE_KEY);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
