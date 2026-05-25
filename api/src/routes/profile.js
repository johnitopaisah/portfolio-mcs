const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get portfolio profile
 *     description: Returns the single profile record powering the portfolio homepage hero section.
 *     tags: [Profile]
 *     responses:
 *       200:
 *         description: Profile data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profile'
 *       404:
 *         description: Profile not found (database not yet seeded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, headline, bio, avatar_mime, resume_mime,
              github_url, linkedin_url, email, hero_tags, updated_at,
              availability_status, orbit_badge_ids,
              (avatar     IS NOT NULL) AS has_avatar,
              (resume     IS NOT NULL) AS has_resume,
              (resume_en  IS NOT NULL) AS has_resume_en,
              (resume_fr  IS NOT NULL) AS has_resume_fr
       FROM profile LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/profile/avatar:
 *   get:
 *     summary: Get profile avatar image
 *     description: Returns the avatar as a raw binary image. Cache-Control is set to 24 hours.
 *     tags: [Profile]
 *     responses:
 *       200:
 *         description: Avatar image binary
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
 *         description: No avatar uploaded yet
 */
router.get('/avatar', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT avatar, avatar_mime FROM profile LIMIT 1');
    if (!rows.length || !rows[0].avatar) return res.status(404).end();
    res.set('Content-Type', rows[0].avatar_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].avatar);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/profile/resume:
 *   get:
 *     summary: Download resume / CV
 *     description: >
 *       Without `?lang`: returns the static uploaded resume PDF.
 *       With `?lang=en` or `?lang=fr`: generates a PDF on-the-fly from the
 *       active base CV record (no AI call) using the HTML template for that
 *       language and returns it as a downloadable file named `cv-{lang}.pdf`.
 *     tags: [Profile]
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           enum: [en, fr]
 *         description: Language of the generated CV (omit for static resume)
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No resume / base CV found
 */
router.get('/resume', async (req, res, next) => {
  try {
    const { lang } = req.query;

    if (lang === 'en' || lang === 'fr') {
      const col = lang === 'en' ? 'resume_en' : 'resume_fr';

      // 1. Serve uploaded language-specific PDF if present
      const { rows: profileRows } = await pool.query(
        `SELECT ${col}, ${col}_mime FROM profile LIMIT 1`
      );
      const uploaded = profileRows[0]?.[col];
      if (uploaded) {
        res.set('Content-Type', profileRows[0][`${col}_mime`] || 'application/pdf');
        res.set('Content-Disposition', `attachment; filename="cv-${lang}.pdf"`);
        return res.send(uploaded);
      }

      // 2. Fall back: generate on-the-fly from active base CV (no AI call)
      const baseCvService = require('../services/cvGeneration/baseCvService');
      const pdfService    = require('../services/cvGeneration/pdfService');

      const activeBaseCv = await baseCvService.getActiveBaseCv();
      const baseCvJson   = activeBaseCv.content_json;

      const aiOutput = {
        cv_summary:          baseCvJson.summary          || '',
        skills_to_emphasize: baseCvJson.skills           || [],
        tailored_experience: baseCvJson.experience       || [],
        final_cv_json:       baseCvJson,
      };

      const { pdfBuffer } = await pdfService.generate({
        applicationId: null,
        version:       activeBaseCv.version,
        aiOutput,
        language:      lang,
      });

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="cv-${lang}.pdf"`);
      return res.send(pdfBuffer);
    }

    // Default: serve the static uploaded PDF
    const { rows } = await pool.query('SELECT resume, resume_mime FROM profile LIMIT 1');
    if (!rows.length || !rows[0].resume) return res.status(404).end();
    res.set('Content-Type', rows[0].resume_mime || 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="resume.pdf"');
    res.send(rows[0].resume);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Update portfolio profile
 *     description: >
 *       Updates the profile record. All fields are optional — only provided fields are changed
 *       (COALESCE logic). Accepts `multipart/form-data` to support avatar and resume file uploads.
 *       Maximum file size is 5 MB.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Itopa ISAH
 *               headline:
 *                 type: string
 *                 example: DevOps & Cloud Engineer
 *               bio:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               github_url:
 *                 type: string
 *                 format: uri
 *               linkedin_url:
 *                 type: string
 *                 format: uri
 *               hero_tags:
 *                 type: string
 *                 description: JSON array string e.g. '["Kubernetes","Docker"]'
 *                 example: '["Kubernetes","Docker","AWS"]'
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Avatar image (JPEG/PNG, max 5 MB)
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Resume PDF (max 5 MB)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profile'
 *       401:
 *         description: Unauthorised — valid JWT required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/', requireAuth,
  upload.fields([
    { name: 'avatar',     maxCount: 1 },
    { name: 'resume',     maxCount: 1 },
    { name: 'resume_en',  maxCount: 1 },
    { name: 'resume_fr',  maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const { name, headline, bio, email, github_url, linkedin_url, hero_tags } = req.body;
      const avatarFile   = req.files?.avatar?.[0];
      const resumeFile   = req.files?.resume?.[0];
      const resumeEnFile = req.files?.resume_en?.[0];
      const resumeFrFile = req.files?.resume_fr?.[0];

      let parsedHeroTags = null;
      if (hero_tags !== undefined && hero_tags !== null && hero_tags !== '') {
        try {
          parsedHeroTags = JSON.parse(hero_tags);
          if (!Array.isArray(parsedHeroTags)) parsedHeroTags = null;
        } catch {
          parsedHeroTags = null;
        }
      }

      const { rows } = await pool.query(
        `UPDATE profile SET
           name            = COALESCE($1,  name),
           headline        = COALESCE($2,  headline),
           bio             = COALESCE($3,  bio),
           email           = COALESCE($4,  email),
           github_url      = COALESCE($5,  github_url),
           linkedin_url    = COALESCE($6,  linkedin_url),
           avatar          = COALESCE($7,  avatar),
           avatar_mime     = COALESCE($8,  avatar_mime),
           resume          = COALESCE($9,  resume),
           resume_mime     = COALESCE($10, resume_mime),
           hero_tags       = COALESCE($11, hero_tags),
           resume_en       = COALESCE($12, resume_en),
           resume_en_mime  = COALESCE($13, resume_en_mime),
           resume_fr       = COALESCE($14, resume_fr),
           resume_fr_mime  = COALESCE($15, resume_fr_mime)
         RETURNING id, name, headline, bio, email, github_url, linkedin_url, hero_tags, updated_at,
                   (resume    IS NOT NULL) AS has_resume,
                   (resume_en IS NOT NULL) AS has_resume_en,
                   (resume_fr IS NOT NULL) AS has_resume_fr`,
        [
          name || null, headline || null, bio || null, email || null,
          github_url || null, linkedin_url || null,
          avatarFile?.buffer   || null, avatarFile?.mimetype   || null,
          resumeFile?.buffer   || null, resumeFile?.mimetype   || null,
          parsedHeroTags,
          resumeEnFile?.buffer || null, resumeEnFile?.mimetype || null,
          resumeFrFile?.buffer || null, resumeFrFile?.mimetype || null,
        ]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

router.put('/orbit-badges', requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
      return res.status(400).json({ error: 'ids must be an array of strings' });
    }
    const { rows } = await pool.query(
      `UPDATE profile SET orbit_badge_ids = $1 RETURNING orbit_badge_ids`,
      [ids]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/availability', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'passive', 'not_open'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, passive, or not_open' });
    }
    const { rows } = await pool.query(
      `UPDATE profile SET availability_status = $1 RETURNING availability_status`,
      [status]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
