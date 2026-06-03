const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'photo',    maxCount: 1 },
  { name: 'org_logo', maxCount: 1 },
]);

// Public: hide email/phone when available_on_request is true
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, title, organization, relationship, review,
              linkedin_url, available_on_request,
              CASE WHEN available_on_request THEN NULL ELSE email END AS email,
              CASE WHEN available_on_request THEN NULL ELSE phone END AS phone,
              photo_mime, org_logo_mime, order_index,
              (photo    IS NOT NULL) AS has_photo,
              (org_logo IS NOT NULL) AS has_org_logo
       FROM referees
       WHERE visible = true
       ORDER BY order_index ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin-only: full data including hidden contact details
router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, title, organization, relationship, review,
              linkedin_url, email, phone, available_on_request, visible,
              photo_mime, org_logo_mime, order_index,
              (photo    IS NOT NULL) AS has_photo,
              (org_logo IS NOT NULL) AS has_org_logo
       FROM referees ORDER BY order_index ASC, created_at ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

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
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

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
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM referees WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Referee not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
