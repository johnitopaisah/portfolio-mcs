const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/experiences  — public
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, company, role, description, start_date, end_date,
              logo_mime, order_index,
              (logo IS NOT NULL) AS has_logo
       FROM experiences ORDER BY order_index ASC, start_date DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/experiences/:id/logo  — public binary
router.get('/:id/logo', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT logo, logo_mime FROM experiences WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].logo) return res.status(404).end();
    res.set('Content-Type', rows[0].logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].logo);
  } catch (err) { next(err); }
});

// POST /api/experiences  — admin
router.post('/', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const { company, role, description, start_date, end_date, order_index } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO experiences (company, role, description, start_date, end_date, logo, logo_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, company, role, description, start_date, end_date, logo_mime, order_index`,
      [company, role, description, start_date, end_date || null,
       req.file?.buffer || null, req.file?.mimetype || null,
       parseInt(order_index || '0')]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/experiences/:id  — admin
router.put('/:id', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const { company, role, description, start_date, end_date, order_index } = req.body;
    const { rows } = await pool.query(
      `UPDATE experiences SET
         company     = COALESCE($1, company),
         role        = COALESCE($2, role),
         description = COALESCE($3, description),
         start_date  = COALESCE($4, start_date),
         end_date    = COALESCE($5, end_date),
         logo        = COALESCE($6, logo),
         logo_mime   = COALESCE($7, logo_mime),
         order_index = COALESCE($8, order_index)
       WHERE id = $9
       RETURNING id, company, role, description, start_date, end_date, logo_mime, order_index, updated_at`,
      [company || null, role || null, description || null, start_date || null,
       end_date || null,
       req.file?.buffer || null, req.file?.mimetype || null,
       order_index !== undefined ? parseInt(order_index) : null,
       req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/experiences/:id  — admin
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM experiences WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Experience not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
