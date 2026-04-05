const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/profile  — public
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, headline, bio, avatar_mime, resume_mime,
              github_url, linkedin_url, email, hero_tags, updated_at,
              (avatar IS NOT NULL) AS has_avatar,
              (resume IS NOT NULL) AS has_resume
       FROM profile LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/profile/avatar  — public binary
router.get('/avatar', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT avatar, avatar_mime FROM profile LIMIT 1');
    if (!rows.length || !rows[0].avatar) return res.status(404).end();
    res.set('Content-Type', rows[0].avatar_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].avatar);
  } catch (err) { next(err); }
});

// GET /api/profile/resume  — public binary
router.get('/resume', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT resume, resume_mime FROM profile LIMIT 1');
    if (!rows.length || !rows[0].resume) return res.status(404).end();
    res.set('Content-Type', rows[0].resume_mime || 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="resume.pdf"');
    res.send(rows[0].resume);
  } catch (err) { next(err); }
});

// PUT /api/profile  — admin only
router.put('/', requireAuth,
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'resume', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const { name, headline, bio, email, github_url, linkedin_url, hero_tags } = req.body;
      const avatarFile = req.files?.avatar?.[0];
      const resumeFile = req.files?.resume?.[0];

      // hero_tags arrives as a JSON string e.g. '["Kubernetes","AWS"]'
      // Parse it only when provided; null means "keep existing value" via COALESCE
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
           name         = COALESCE($1,  name),
           headline     = COALESCE($2,  headline),
           bio          = COALESCE($3,  bio),
           email        = COALESCE($4,  email),
           github_url   = COALESCE($5,  github_url),
           linkedin_url = COALESCE($6,  linkedin_url),
           avatar       = COALESCE($7,  avatar),
           avatar_mime  = COALESCE($8,  avatar_mime),
           resume       = COALESCE($9,  resume),
           resume_mime  = COALESCE($10, resume_mime),
           hero_tags    = COALESCE($11, hero_tags)
         RETURNING id, name, headline, bio, email, github_url, linkedin_url, hero_tags, updated_at`,
        [
          name || null, headline || null, bio || null, email || null,
          github_url || null, linkedin_url || null,
          avatarFile?.buffer || null, avatarFile?.mimetype || null,
          resumeFile?.buffer || null, resumeFile?.mimetype || null,
          parsedHeroTags,
        ]
      );
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

module.exports = router;
