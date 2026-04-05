const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/projects  — public (published only)
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

// GET /api/projects/all  — admin (all including unpublished)
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

// GET /api/projects/:id  — public
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

// GET /api/projects/:id/image  — public binary
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

// POST /api/projects  — admin
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

// PUT /api/projects/:id  — admin
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
        // When ongoing is being set to true, explicitly clear end_date
        ongoing === 'true' ? null : (end_date || null),
        ongoing !== undefined ? ongoing === 'true' : null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id  — admin
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Project not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
