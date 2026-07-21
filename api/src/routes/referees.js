const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const cache  = require('../services/contentCache');

const CACHE_KEY = 'referees:public';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'photo',    maxCount: 1 },
  { name: 'org_logo', maxCount: 1 },
]);

/**
 * @swagger
 * /api/referees:
 *   get:
 *     summary: List visible referees
 *     description: >
 *       Returns all referees where `visible = true`, ordered by `order_index` then
 *       creation date. When `available_on_request` is true, `email` and `phone`
 *       are omitted from the response. Each referee includes its `star_config`
 *       (null means default animation settings apply).
 *     tags: [Referees]
 *     responses:
 *       200:
 *         description: Array of public referee records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Referee'
 */
router.get('/', async (req, res, next) => {
  try {
    const rows = await cache.getOrSet(CACHE_KEY, async () => {
      const { rows } = await pool.query(
        `SELECT id, name, title, organization, relationship, review,
                linkedin_url, available_on_request,
                CASE WHEN available_on_request THEN NULL ELSE email END AS email,
                CASE WHEN available_on_request THEN NULL ELSE phone END AS phone,
                photo_mime, org_logo_mime, order_index,
                (photo    IS NOT NULL) AS has_photo,
                (org_logo IS NOT NULL) AS has_org_logo,
                star_config
         FROM referees
         WHERE visible = true
         ORDER BY order_index ASC, created_at ASC`
      );
      return rows;
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/all:
 *   get:
 *     summary: List all referees (admin)
 *     description: >
 *       Returns all referees regardless of visibility, including full contact
 *       details and `star_config`. Requires admin JWT.
 *     tags: [Referees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of full referee records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Referee'
 *                   - type: object
 *                     properties:
 *                       visible:
 *                         type: boolean
 *                       modification_requested:
 *                         type: boolean
 *       401:
 *         description: Unauthorised
 */
router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, title, organization, relationship, review,
              linkedin_url, email, phone, available_on_request, visible,
              photo_mime, org_logo_mime, order_index,
              (photo    IS NOT NULL) AS has_photo,
              (org_logo IS NOT NULL) AS has_org_logo,
              star_config
       FROM referees ORDER BY order_index ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/{id}/photo:
 *   get:
 *     summary: Get referee photo
 *     description: Returns the referee's headshot as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Referees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Photo binary
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Referee not found or no photo uploaded
 */
router.get('/:id/photo', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT photo, photo_mime FROM referees WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].photo) return res.status(404).end();
    res.set('Content-Type', rows[0].photo_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].photo);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/{id}/org-logo:
 *   get:
 *     summary: Get referee organisation logo
 *     description: Returns the organisation logo as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Referees]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Logo binary
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
 *         description: Referee not found or no logo uploaded
 */
router.get('/:id/org-logo', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT org_logo, org_logo_mime FROM referees WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].org_logo) return res.status(404).end();
    res.set('Content-Type', rows[0].org_logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].org_logo);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees:
 *   post:
 *     summary: Create a referee (admin)
 *     description: >
 *       Accepts `multipart/form-data`. Maximum file size for photo and org_logo
 *       is 3 MB each. Requires admin JWT.
 *     tags: [Referees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, title, organization, relationship]
 *             properties:
 *               name:                 { type: string, example: Mario Valdivia }
 *               title:                { type: string, example: Software Engineering Lead }
 *               organization:         { type: string, example: Quandela }
 *               relationship:         { type: string, example: Team Lead }
 *               review:               { type: string }
 *               linkedin_url:         { type: string, format: uri }
 *               email:                { type: string, format: email }
 *               phone:                { type: string }
 *               available_on_request: { type: boolean, default: true }
 *               visible:              { type: boolean, default: true }
 *               order_index:          { type: integer, default: 0 }
 *               photo:                { type: string, format: binary }
 *               org_logo:             { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Referee created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Referee'
 *       401:
 *         description: Unauthorised
 */
router.post('/', requireAuth, uploadFields, async (req, res, next) => {
  try {
    const {
      name, title, organization, relationship, review,
      linkedin_url, email, phone, available_on_request, visible, order_index,
    } = req.body;
    const photo    = req.files?.photo?.[0];
    const org_logo = req.files?.org_logo?.[0];
    const { rows } = await pool.query(
      `INSERT INTO referees
         (name, title, organization, relationship, review, linkedin_url,
          email, phone, available_on_request, visible,
          photo, photo_mime, org_logo, org_logo_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, name, title, organization, relationship, review,
                 linkedin_url, email, phone, available_on_request, visible,
                 photo_mime, org_logo_mime, order_index`,
      [
        name, title, organization, relationship,
        review || null, linkedin_url || null,
        email || null, phone || null,
        available_on_request === 'true' || available_on_request === true,
        visible !== 'false' && visible !== false,
        photo?.buffer || null, photo?.mimetype || null,
        org_logo?.buffer || null, org_logo?.mimetype || null,
        parseInt(order_index || '0'),
      ]
    );
    cache.invalidate(CACHE_KEY);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/{id}:
 *   put:
 *     summary: Update a referee (admin)
 *     description: >
 *       Partial update via `multipart/form-data`. Only fields that are provided
 *       are updated (COALESCE pattern). To update the photo or org logo supply
 *       new files; omit them to keep the current ones. Maximum file size is 3 MB.
 *       Does **not** update `star_config` — use `PUT /api/referees/{id}/star-config`
 *       for that. Requires admin JWT.
 *     tags: [Referees]
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
 *               name:                 { type: string }
 *               title:                { type: string }
 *               organization:         { type: string }
 *               relationship:         { type: string }
 *               review:               { type: string }
 *               linkedin_url:         { type: string, format: uri }
 *               email:                { type: string, format: email }
 *               phone:                { type: string }
 *               available_on_request: { type: boolean }
 *               visible:              { type: boolean }
 *               order_index:          { type: integer }
 *               photo:                { type: string, format: binary }
 *               org_logo:             { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated referee
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Referee'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id', requireAuth, uploadFields, async (req, res, next) => {
  try {
    const {
      name, title, organization, relationship, review,
      linkedin_url, email, phone, available_on_request, visible, order_index,
    } = req.body;
    const photo    = req.files?.photo?.[0];
    const org_logo = req.files?.org_logo?.[0];
    const { rows } = await pool.query(
      `UPDATE referees SET
         name                 = COALESCE($1,  name),
         title                = COALESCE($2,  title),
         organization         = COALESCE($3,  organization),
         relationship         = COALESCE($4,  relationship),
         review               = COALESCE($5,  review),
         linkedin_url         = COALESCE($6,  linkedin_url),
         email                = COALESCE($7,  email),
         phone                = COALESCE($8,  phone),
         available_on_request = COALESCE($9,  available_on_request),
         visible              = COALESCE($10, visible),
         photo                = COALESCE($11, photo),
         photo_mime           = COALESCE($12, photo_mime),
         org_logo             = COALESCE($13, org_logo),
         org_logo_mime        = COALESCE($14, org_logo_mime),
         order_index          = COALESCE($15, order_index)
       WHERE id = $16
       RETURNING id, name, title, organization, relationship, review,
                 linkedin_url, email, phone, available_on_request, visible,
                 photo_mime, org_logo_mime, order_index, updated_at`,
      [
        name || null, title || null, organization || null, relationship || null,
        review || null, linkedin_url || null,
        email || null, phone || null,
        available_on_request !== undefined
          ? (available_on_request === 'true' || available_on_request === true) : null,
        visible !== undefined
          ? (visible !== 'false' && visible !== false) : null,
        photo?.buffer || null, photo?.mimetype || null,
        org_logo?.buffer || null, org_logo?.mimetype || null,
        order_index !== undefined ? parseInt(order_index) : null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Referee not found' });
    cache.invalidate(CACHE_KEY);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/{id}/star-config:
 *   put:
 *     summary: Update star animation config (admin)
 *     description: >
 *       Replaces the `star_config` JSONB for a single referee. All fields in the
 *       request body become the new config. This is the only endpoint that modifies
 *       star animation settings — `PUT /api/referees/{id}` intentionally does not
 *       touch `star_config`. Requires admin JWT.
 *     tags: [Referees]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StarConfig'
 *     responses:
 *       200:
 *         description: Updated star config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:          { type: string, format: uuid }
 *                 star_config: { $ref: '#/components/schemas/StarConfig' }
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id/star-config', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE referees SET star_config = $1 WHERE id = $2
       RETURNING id, star_config`,
      [JSON.stringify(req.body), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Referee not found' });
    cache.invalidate(CACHE_KEY);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/referees/{id}:
 *   delete:
 *     summary: Delete a referee (admin)
 *     description: Permanently deletes the referee and all associated binary data. Requires admin JWT.
 *     tags: [Referees]
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
 *         description: Referee deleted
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM referees WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Referee not found' });
    cache.invalidate(CACHE_KEY);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
