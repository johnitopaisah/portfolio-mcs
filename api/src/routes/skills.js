const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

// GET /api/skills  — public
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

// GET /api/skills/:id/icon  — public binary
router.get('/:id/icon', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT icon, icon_mime FROM skills WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].icon) return res.status(404).end();
    res.set('Content-Type', rows[0].icon_mime || 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].icon);
  } catch (err) { next(err); }
});

// POST /api/skills  — admin
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

// PUT /api/skills/:id  — admin
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

// DELETE /api/skills/:id  — admin
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM skills WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Skill not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
