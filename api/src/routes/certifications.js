const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

// GET /api/certifications  — public
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, issuer, issue_date, expiry_date,
              credential_id, credential_url, image_mime, order_index,
              (image IS NOT NULL) AS has_image
       FROM certifications ORDER BY order_index ASC, issue_date DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/certifications/:id/image  — public binary
router.get('/:id/image', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT image, image_mime FROM certifications WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].image) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].image);
  } catch (err) { next(err); }
});

// POST /api/certifications  — admin
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
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/certifications/:id  — admin
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
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/certifications/:id  — admin
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM certifications WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Certification not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
