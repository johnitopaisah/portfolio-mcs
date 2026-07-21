const router = require('express').Router();
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { syncBlogFromMedium } = require('../services/blogIngestService');
const cache  = require('../services/contentCache');

const CACHE_KEY = 'blog:public';

/**
 * @swagger
 * /api/blog:
 *   get:
 *     summary: List visible blog posts
 *     description: Returns all posts where `visible_on_site = true`, newest first.
 *     tags: [Blog]
 *     responses:
 *       200:
 *         description: Array of blog post records
 */
router.get('/', async (req, res, next) => {
  try {
    const rows = await cache.getOrSet(CACHE_KEY, async () => {
      const { rows } = await pool.query(
        `SELECT id, title, excerpt, cover_image_url, medium_url, tags, published_at
         FROM blog_posts
         WHERE visible_on_site = true
         ORDER BY published_at DESC NULLS LAST`
      );
      return rows;
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/blog/all:
 *   get:
 *     summary: List all blog posts including hidden (admin)
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of all blog post records
 *       401:
 *         description: Unauthorised
 */
router.get('/all', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, excerpt, cover_image_url, medium_url, tags,
              published_at, ingested_at, visible_on_site,
              linkedin_shared_at, linkedin_post_urn
       FROM blog_posts
       ORDER BY published_at DESC NULLS LAST`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/blog/sync:
 *   post:
 *     summary: Pull latest posts from Medium RSS (admin)
 *     description: Admin-triggered only — there is no scheduled auto-sync.
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync result counts
 *       401:
 *         description: Unauthorised
 *       502:
 *         description: Medium feed could not be fetched
 */
router.post('/sync', requireAuth, async (req, res, next) => {
  try {
    const result = await syncBlogFromMedium();
    cache.invalidate(CACHE_KEY);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('MEDIUM_FEED_URL')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(502).json({ error: `Failed to sync from Medium: ${err.message}` });
  }
});

/**
 * @swagger
 * /api/blog/{id}:
 *   put:
 *     summary: Edit a blog post (admin)
 *     description: Partial update — only provided fields are changed. Requires admin JWT.
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Updated blog post
 *       401:
 *         description: Unauthorised
 *       404:
 *         description: Not found
 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { excerpt, cover_image_url, tags, visible_on_site } = req.body;
    const { rows } = await pool.query(
      `UPDATE blog_posts SET
         excerpt         = COALESCE($1, excerpt),
         cover_image_url = COALESCE($2, cover_image_url),
         tags            = COALESCE($3, tags),
         visible_on_site = COALESCE($4, visible_on_site)
       WHERE id = $5
       RETURNING id, title, excerpt, cover_image_url, medium_url, tags,
                 published_at, ingested_at, visible_on_site,
                 linkedin_shared_at, linkedin_post_urn`,
      [excerpt ?? null, cover_image_url ?? null, tags ?? null, visible_on_site ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    cache.invalidate(CACHE_KEY);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
