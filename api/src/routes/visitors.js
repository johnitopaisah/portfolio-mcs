'use strict';
// ============================================================
//  POST /api/visitors  — fire-and-forget from user-ui middleware
//  GET  /api/visitors/stats — admin-only analytics
// ============================================================

const router    = require('express').Router();
const { createRateLimiter } = require('../services/rateLimit');
const pool      = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { geoFromHeaders } = require('../services/geoip');
const { dailyVisitorHash, refererOrigin } = require('../services/visitorHash');
const {
  isBot, parseBrowser, parseOs, parseDevice, labelReferer, parseLanguage, clientIp,
} = require('../services/parseVisitor');
const {
  visitorsTotal,
  visitorsByCountry,
  visitorsByDevice,
  visitorsByReferrer,
  visitorsByBrowser,
  visitorBotsFiltered,
} = require('../metrics');

// ── Rate limiter ──────────────────────────────────────────────
// Generous limit — legitimate browsers hit this once per page load.
// Protects the DB from direct API abuse without blocking real traffic.
const visitorLimiter = createRateLimiter('visitors', {
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 pings/min per IP — well above any real browser need
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).end(),
});

// ── POST /api/visitors ────────────────────────────────────────
// Called by user-ui middleware on every homepage GET.
// Responds 204 immediately — all processing runs after response.
router.post('/', visitorLimiter, async (req, res) => {
  res.status(204).end();

  try {
    const ua  = req.headers['user-agent'] || '';
    const bot = isBot(ua);

    if (bot) {
      visitorBotsFiltered.inc();
    }

    const ip = clientIp(req);

    const cfCountryCode = (req.headers['cf-ipcountry'] || '').toUpperCase();
    const refererRaw    = req.headers['referer']         || req.headers['x-referer']         || '';
    const acceptLang    = req.headers['accept-language'] || req.headers['x-accept-language'] || '';

    const browser  = parseBrowser(ua);
    const os       = parseOs(ua);
    const device   = parseDevice(ua);
    const refLabel = labelReferer(refererRaw);
    const language = parseLanguage(acceptLang);

    // Prometheus counters — real visitors only
    if (!bot) {
      visitorsTotal.inc();
      visitorsByDevice.inc({ device });
      visitorsByReferrer.inc({ referrer: refLabel });
      visitorsByBrowser.inc({ browser });
    }

    // Location from Cloudflare's headers — no IP is sent anywhere or stored.
    const geo     = geoFromHeaders(req.headers);
    const country = geo.country || '';

    if (!bot && country) {
      visitorsByCountry.inc({ country });
    }

    // Bots are counted in Prometheus but never stored in the DB —
    // they'd be filtered out of every analytics query anyway and
    // just consume space (was 1M+ rows / 350 MB before cleanup).
    if (!bot) {
      await pool.query(
        `INSERT INTO visitor_logs
          (visitor_hash, country_code, country, city, region,
           browser, os, device_type, referer_raw, referer_label, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          dailyVisitorHash(ip, ua),
          cfCountryCode || geo.country_code || null,
          country       || null,
          geo.city      || null,
          geo.region    || null,
          browser       || null,
          os            || null,
          device,
          refererOrigin(refererRaw),
          refLabel,
          language      || null,
        ]
      );
    }
  } catch (err) {
    // Never crash — analytics is non-critical
    console.error('[visitors] Insert error:', err.message);
  }
});

// ── GET /api/visitors/stats (admin-only) ──────────────────────
router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const days  = Math.min(parseInt(req.query.days || '7'), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, uniqueRes, countryRes, refererRes, deviceRes,
           browserRes, osRes, timelineRes, allTimeRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot`, [since]),
      pool.query(`SELECT COUNT(DISTINCT COALESCE(visitor_hash, session_id::text, id::text)) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot`, [since]),
      pool.query(`SELECT COALESCE(country, country_code, 'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 10`, [since]),
      pool.query(`SELECT COALESCE(referer_label, 'Direct') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 8`, [since]),
      pool.query(`SELECT COALESCE(device_type,'desktop') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC`, [since]),
      pool.query(`SELECT COALESCE(browser,'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 6`, [since]),
      pool.query(`SELECT COALESCE(os,'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 6`, [since]),
      pool.query(`SELECT date_trunc('day', visited_at) AS day, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY day ORDER BY day`, [since]),
      // all-time = individual visits + visits already folded into daily totals (> 13 months)
      pool.query(`SELECT (SELECT COUNT(*) FROM visitor_logs WHERE NOT is_bot) + (SELECT COALESCE(SUM(visits), 0) FROM visitor_daily) AS n`),
    ]);

    res.json({
      period_days: days,
      total:       parseInt(totalRes.rows[0]?.n   || 0),
      unique:      parseInt(uniqueRes.rows[0]?.n  || 0),
      all_time:    parseInt(allTimeRes.rows[0]?.n || 0),
      by_country:  countryRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
      by_referrer: refererRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
      by_device:   deviceRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
      by_browser:  browserRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
      by_os:       osRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
      timeline:    timelineRes.rows.map(r => ({ day: r.day, n: parseInt(r.n) })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
