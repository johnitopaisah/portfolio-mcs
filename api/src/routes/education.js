const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * @swagger
 * /api/education:
 *   get:
 *     summary: List education entries
 *     description: Returns all education records ordered by `order_index` then `start_date` descending.
 *     tags: [Education]
 *     responses:
 *       200:
 *         description: Array of education records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Education' }
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, institution, institution_url, degree, field_of_study,
              description, grade, activities, start_date, end_date, ongoing,
              logo_mime, order_index,
              (logo IS NOT NULL) AS has_logo
       FROM education ORDER BY order_index ASC, start_date DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/education/{id}/logo:
 *   get:
 *     summary: Get institution logo
 *     description: Returns the institution logo as raw binary. Cache-Control is set to 24 hours.
 *     tags: [Education]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Logo binary
 *         content:
 *           image/png:
 *             schema: { type: string, format: binary }
 *           image/jpeg:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: Education entry not found or no logo uploaded
 */
router.get('/:id/logo', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT logo, logo_mime FROM education WHERE id = $1', [req.params.id]
    );
    if (!rows.length || !rows[0].logo) return res.status(404).end();
    res.set('Content-Type', rows[0].logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].logo);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/education:
 *   post:
 *     summary: Create an education entry (admin)
 *     description: Accepts `multipart/form-data`. Maximum logo size is 2 MB. Requires admin JWT.
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [institution, degree, field_of_study, start_date]
 *             properties:
 *               institution:     { type: string, example: École Polytechnique }
 *               institution_url: { type: string, format: uri }
 *               degree:          { type: string, example: Master of Science }
 *               field_of_study:  { type: string, example: Computer Science }
 *               description:     { type: string }
 *               grade:           { type: string, example: 'First Class Honours' }
 *               activities:      { type: string }
 *               start_date:      { type: string, format: date }
 *               end_date:        { type: string, format: date }
 *               ongoing:         { type: boolean }
 *               order_index:     { type: integer, default: 0 }
 *               logo:            { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Education entry created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Education' }
 *       401:
 *         description: Unauthorised
 */
router.post('/', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const {
      institution, institution_url, degree, field_of_study,
      description, grade, activities, start_date, end_date, ongoing, order_index,
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO education
         (institution, institution_url, degree, field_of_study, description, grade,
          activities, start_date, end_date, ongoing, logo, logo_mime, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, institution, institution_url, degree, field_of_study, description,
                 grade, activities, start_date, end_date, ongoing, logo_mime, order_index`,
      [
        institution, institution_url || null, degree, field_of_study,
        description || null, grade || null, activities || null,
        start_date, end_date || null,
        ongoing === 'true' || ongoing === true,
        req.file?.buffer || null, req.file?.mimetype || null,
        parseInt(order_index || '0'),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/education/{id}:
 *   put:
 *     summary: Update an education entry (admin)
 *     description: Partial update via `multipart/form-data`. Only provided fields are updated. Requires admin JWT.
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               institution:     { type: string }
 *               institution_url: { type: string, format: uri }
 *               degree:          { type: string }
 *               field_of_study:  { type: string }
 *               description:     { type: string }
 *               grade:           { type: string }
 *               activities:      { type: string }
 *               start_date:      { type: string, format: date }
 *               end_date:        { type: string, format: date }
 *               ongoing:         { type: boolean }
 *               order_index:     { type: integer }
 *               logo:            { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated education entry
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Education' }
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.put('/:id', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    const {
      institution, institution_url, degree, field_of_study,
      description, grade, activities, start_date, end_date, ongoing, order_index,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE education SET
         institution     = COALESCE($1,  institution),
         institution_url = COALESCE($2,  institution_url),
         degree          = COALESCE($3,  degree),
         field_of_study  = COALESCE($4,  field_of_study),
         description     = COALESCE($5,  description),
         grade           = COALESCE($6,  grade),
         activities      = COALESCE($7,  activities),
         start_date      = COALESCE($8,  start_date),
         end_date        = COALESCE($9,  end_date),
         ongoing         = COALESCE($10, ongoing),
         logo            = COALESCE($11, logo),
         logo_mime       = COALESCE($12, logo_mime),
         order_index     = COALESCE($13, order_index)
       WHERE id = $14
       RETURNING id, institution, institution_url, degree, field_of_study, description,
                 grade, activities, start_date, end_date, ongoing, logo_mime, order_index, updated_at`,
      [
        institution || null, institution_url || null, degree || null, field_of_study || null,
        description || null, grade || null, activities || null,
        start_date || null, end_date || null,
        ongoing !== undefined ? (ongoing === 'true' || ongoing === true) : null,
        req.file?.buffer || null, req.file?.mimetype || null,
        order_index !== undefined ? parseInt(order_index) : null,
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Education entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/education/{id}:
 *   delete:
 *     summary: Delete an education entry (admin)
 *     description: Permanently removes the education record and its logo. Requires admin JWT.
 *     tags: [Education]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM education WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Education entry not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
