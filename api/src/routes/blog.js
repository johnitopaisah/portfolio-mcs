const router = require('express').Router();
const { createRateLimiter } = require('../services/rateLimit');
const pool   = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { syncBlogFromMedium } = require('../services/blogIngestService');
const cache  = require('../services/contentCache');
const { recordClick, getInsights } = require('../services/blogClickService');
const { isBot, clientIp } = require('../services/parseVisitor');

const CACHE_KEY = 'blog:public';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stops one client inflating a post's numbers. Over the limit the reader is
// still redirected — the click just isn't recorded.
const clickLimiter = createRateLimiter('blog-click', {
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: clientIp,
  handler: (req, _res, next) => { req.skipClickRecord = true; next(); },
});

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
        `SELECT id, title, excerpt, cover_image_url, medium_url, tags, published_at, first_ingested_at
         FROM blog_posts
         WHERE visible_on_site = true
         ORDER BY published_at DESC NULLS LAST`
      );
      // Images are served from this site (privacy): the visitor's browser never
      // contacts Medium's CDN. See GET /:id/cover.
      return rows.map(r => ({ ...r, cover_image_url: r.cover_image_url ? `/api/blog/${r.id}/cover` : null }));
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
      `SELECT p.id, p.title, p.excerpt, p.cover_image_url, p.medium_url, p.tags,
              p.published_at, p.ingested_at, p.visible_on_site,
              p.linkedin_shared_at, p.linkedin_post_urn,
              ((SELECT COUNT(*) FROM blog_clicks c WHERE c.post_id = p.id)
               + COALESCE((SELECT SUM(d.clicks) FROM blog_click_daily d WHERE d.post_id = p.id), 0))::int AS click_count
       FROM blog_posts p
       ORDER BY p.published_at DESC NULLS LAST`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/blog/insights:
 *   get:
 *     summary: Blog click analytics (admin)
 *     description: >
 *       Clicks through to Medium. Breakdowns and recent clicks cover at most the
 *       last 90 days; totals and the timeline for range=all include older daily totals.
 *     tags: [Blog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema: { type: string, enum: ['7', '30', '90', all], default: '30' }
 *       - in: query
 *         name: post
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Totals, timeline, top posts, breakdowns and recent clicks
 *       400:
 *         description: Invalid range or post
 *       401:
 *         description: Unauthorised
 */
router.get('/insights', requireAuth, async (req, res, next) => {
  try {
    const { range = '30', post } = req.query;
    if (!['7', '30', '90', 'all'].includes(range)) return res.status(400).json({ error: 'Invalid range' });
    if (post && !UUID_RE.test(post)) return res.status(400).json({ error: 'Invalid post' });
    res.json(await getInsights({ range, postId: post || null }));
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/blog/{id}/go:
 *   get:
 *     summary: Record a reader's click and redirect to the post on Medium
 *     description: >
 *       The target comes from the database, so this can't be used as an open
 *       redirect. The reader is redirected first and the click recorded afterwards;
 *       a tracking failure never affects them. Bots and prefetches aren't recorded.
 *     tags: [Blog]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, enum: [home, blog] }
 *         description: Where on the site the link was
 *     responses:
 *       302:
 *         description: Redirect to Medium
 *       404:
 *         description: Not found
 */
// ── GET /:id/cover — the post's cover image, from this site ──────────
// Fetched from Medium once (server side, HTTPS, *.medium.com only, ≤ 3 MB),
// stored in blog_posts.cover_image, then served from here with long caching.
const COVER_MAX_BYTES = 3 * 1024 * 1024;
const isMediumImageUrl = u => {
  try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'medium.com' || x.hostname.endsWith('.medium.com')); }
  catch { return false; }
};
async function fetchCover(url) {
  if (!isMediumImageUrl(url)) return null;
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!r.ok || !isMediumImageUrl(r.url)) return null;
  const mime = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(png|jpe?g|gif|webp|avif)$/.test(mime)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length && buf.length <= COVER_MAX_BYTES ? { buf, mime } : null;
}

router.get('/:id/cover', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).end();
    const { rows } = await pool.query(
      'SELECT cover_image, cover_image_mime, cover_image_url FROM blog_posts WHERE id = $1 AND visible_on_site = true', [req.params.id]);
    if (!rows.length || !rows[0].cover_image_url) return res.status(404).end();
    let { cover_image: buf, cover_image_mime: mime } = rows[0];
    if (!buf) {
      const got = await fetchCover(rows[0].cover_image_url).catch(() => null);
      if (!got) return res.status(404).end();
      ({ buf, mime } = got);
      await pool.query('UPDATE blog_posts SET cover_image = $1, cover_image_mime = $2 WHERE id = $3', [buf, mime, req.params.id]);
    }
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/:id/go', clickLimiter, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });

    const { rows } = await pool.query('SELECT id, medium_url FROM blog_posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.redirect(302, rows[0].medium_url);

    const isPrefetch = /prefetch|prerender/i.test(`${req.headers['sec-purpose'] || ''} ${req.headers.purpose || ''}`);
    if (req.method === 'GET' && !req.skipClickRecord && !isPrefetch && !isBot(req.headers['user-agent'])) {
      recordClick(req, rows[0].id).catch(err => console.error('[Blog] click not recorded:', err.message));
    }
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
    await cache.invalidate(CACHE_KEY);
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
         cover_image      = CASE WHEN $2::text IS NOT NULL AND $2::text IS DISTINCT FROM cover_image_url THEN NULL ELSE cover_image END,
         cover_image_mime = CASE WHEN $2::text IS NOT NULL AND $2::text IS DISTINCT FROM cover_image_url THEN NULL ELSE cover_image_mime END,
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
    await cache.invalidate(CACHE_KEY);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
