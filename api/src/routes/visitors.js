'use strict';
// ============================================================
//  POST /api/visitors  — fire-and-forget from user-ui middleware
//  GET  /api/visitors/stats — admin-only analytics
// ============================================================

const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const pool      = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { geoip }       = require('../services/geoip');
const {
  isBot, parseBrowser, parseOs, parseDevice, labelReferer, parseLanguage,
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
const visitorLimiter = rateLimit({
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

    // Real IP — Cloudflare CF-Connecting-IP is most reliable
    const ip =
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip']        ||
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip || '';

    const cfCountryCode = (req.headers['cf-ipcountry'] || '').toUpperCase();
    const sessionId     = req.headers['x-portfolio-sid'] || null;
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

    // Geo lookup async (cached 24h — response already sent to user-ui)
    const geo     = await geoip(ip);
    const country = geo.country || '';

    if (!bot && country) {
      visitorsByCountry.inc({ country });
    }

    await pool.query(
      `INSERT INTO visitor_logs
        (ip_address, country_code, country, city, region, latitude, longitude,
         browser, os, device_type, referer_raw, referer_label, language, is_bot, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        ip            || null,
        cfCountryCode || null,
        country       || null,
        geo.city      || null,
        geo.region    || null,
        geo.lat       || null,
        geo.lon       || null,
        browser       || null,
        os            || null,
        device,
        refererRaw    || null,
        refLabel,
        language      || null,
        bot,
        sessionId,
      ]
    );
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
      pool.query(`SELECT COUNT(DISTINCT COALESCE(session_id, ip_address)) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot`, [since]),
      pool.query(`SELECT COALESCE(country, country_code, 'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 10`, [since]),
      pool.query(`SELECT COALESCE(referer_label, 'Direct') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 8`, [since]),
      pool.query(`SELECT COALESCE(device_type,'desktop') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC`, [since]),
      pool.query(`SELECT COALESCE(browser,'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 6`, [since]),
      pool.query(`SELECT COALESCE(os,'Unknown') AS label, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY label ORDER BY n DESC LIMIT 6`, [since]),
      pool.query(`SELECT date_trunc('day', visited_at) AS day, COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot GROUP BY day ORDER BY day`, [since]),
      pool.query(`SELECT COUNT(*) AS n FROM visitor_logs WHERE NOT is_bot`),
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
