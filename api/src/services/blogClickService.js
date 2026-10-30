'use strict';
// ============================================================
//  Blog click tracking — records reader clicks through to Medium
//  and answers the admin Blog Insights page.
//
//  No IP address is stored. It is used for the geo lookup and for
//  visitor_hash, a keyed hash that changes every UTC day: enough to
//  count unique visitors within a day, not to follow anyone across days.
// ============================================================

const crypto = require('crypto');
const pool   = require('../db/client');
const { geoip } = require('./geoip');
const {
  clientIp, parseBrowser, parseOs, parseDevice, parseLanguage,
} = require('./parseVisitor');

const RETENTION_DAYS = 90;
const RANGES = { 7: 7, 30: 30, 90: 90 };   // 'all' additionally reads blog_click_daily
const SOURCE_PAGES = new Set(['home', 'blog']);

function normalizeSourcePage(from) {
  return SOURCE_PAGES.has(from) ? from : 'other';
}

function visitorHash(ip, userAgent, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const key = crypto.createHash('sha256')
    .update(`blog-click:${process.env.JWT_SECRET || ''}:${day}`)
    .digest();
  return crypto.createHmac('sha256', key).update(`${ip}|${userAgent}`).digest('hex');
}

function sessionIdFromCookie(cookieHeader) {
  const match = /(?:^|;\s*)portfolio-sid=([^;]+)/.exec(cookieHeader || '');
  return match ? match[1] : null;
}

// The click itself always comes from our own site, so the external source
// can only come from the visit that started this session. The visitor log
// only covers homepage landings, hence 'Unknown' for anyone arriving straight
// on /blog or after the 30-minute session cookie has lapsed.
async function trafficSource(sessionId) {
  if (!sessionId) return 'Unknown';
  const { rows } = await pool.query(
    `SELECT referer_label FROM visitor_logs
     WHERE session_id = $1 ORDER BY visited_at ASC LIMIT 1`,
    [sessionId]
  );
  return rows[0]?.referer_label || 'Unknown';
}

async function recordClick(req, postId) {
  const ua  = req.headers['user-agent'] || '';
  const ip  = clientIp(req);
  const geo = await geoip(ip);

  await pool.query(
    `INSERT INTO blog_clicks
       (post_id, visitor_hash, country_code, country, region, city,
        device_type, os, browser, language, source_page, traffic_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      postId,
      visitorHash(ip, ua),
      (req.headers['cf-ipcountry'] || '').toUpperCase() || null,
      geo.country || null,
      geo.region  || null,
      geo.city    || null,
      parseDevice(ua),
      parseOs(ua),
      parseBrowser(ua),
      parseLanguage(req.headers['accept-language'] || '') || null,
      normalizeSourcePage(req.query.from),
      await trafficSource(sessionIdFromCookie(req.headers.cookie)),
    ]
  );
}

// Folds per-click rows past the retention window into daily totals.
// Runs in one transaction, so a re-run after a failure can't double count.
async function rollupOldClicks() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cutoff = `date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '${RETENTION_DAYS} days'`;
    await client.query(
      `INSERT INTO blog_click_daily (post_id, day, clicks, uniques)
       SELECT post_id, (clicked_at AT TIME ZONE 'UTC')::date, COUNT(*), COUNT(DISTINCT visitor_hash)
       FROM blog_clicks
       WHERE clicked_at AT TIME ZONE 'UTC' < ${cutoff}
       GROUP BY 1, 2
       ON CONFLICT (post_id, day) DO UPDATE SET
         clicks  = blog_click_daily.clicks  + EXCLUDED.clicks,
         uniques = blog_click_daily.uniques + EXCLUDED.uniques`
    );
    const { rowCount } = await client.query(
      `DELETE FROM blog_clicks WHERE clicked_at AT TIME ZONE 'UTC' < ${cutoff}`
    );
    await client.query('COMMIT');
    return { rolledUp: rowCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {{ range?: string, postId?: string|null }} options
 *   range: '7' | '30' | '90' | 'all'. Breakdowns and recent clicks only ever
 *   cover the retention window; totals and the timeline for 'all' also
 *   include the daily rollups.
 */
async function getInsights({ range = '30', postId = null } = {}) {
  const days  = RANGES[range] || null;
  const isAll = !days;

  const params = [days, postId];
  const where = `
    ($1::int IS NULL OR c.clicked_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') - make_interval(days => $1::int - 1)) AT TIME ZONE 'UTC')
    AND ($2::uuid IS NULL OR c.post_id = $2::uuid)`;

  const breakdown = async (column, extra = '') => {
    const { rows } = await pool.query(
      `SELECT COALESCE(${column}, 'Unknown') AS label, COUNT(*)::int AS clicks
       FROM blog_clicks c
       WHERE ${where} ${extra}
       GROUP BY 1 ORDER BY clicks DESC, label LIMIT 8`,
      params
    );
    return rows;
  };

  const rollupSql = isAll ? `
    UNION ALL
    SELECT d.post_id, d.day, d.clicks, d.uniques FROM blog_click_daily d
    WHERE ($2::uuid IS NULL OR d.post_id = $2::uuid)` : '';

  const [totals, timeline, topPosts, recent, countries, cities, devices, oses, browsers, sources, pages] =
    await Promise.all([
      pool.query(
        `WITH detail AS (
           SELECT COUNT(*)::int AS clicks, COUNT(DISTINCT visitor_hash)::int AS uniques
           FROM blog_clicks c WHERE ${where}
         ), rolled AS (
           SELECT COALESCE(SUM(d.clicks), 0)::int AS clicks, COALESCE(SUM(d.uniques), 0)::int AS uniques
           FROM blog_click_daily d
           WHERE $1::int IS NULL AND ($2::uuid IS NULL OR d.post_id = $2::uuid)
         )
         SELECT detail.clicks + rolled.clicks AS clicks, detail.uniques + rolled.uniques AS uniques
         FROM detail, rolled`,
        params
      ),
      pool.query(
        `WITH per_day AS (
           SELECT c.post_id, (c.clicked_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS clicks,
                  COUNT(DISTINCT c.visitor_hash)::int AS uniques
           FROM blog_clicks c WHERE ${where}
           GROUP BY 1, 2
           ${rollupSql}
         ), bounds AS (
           SELECT COALESCE(
                    (NOW() AT TIME ZONE 'UTC')::date - ($1::int - 1),
                    (SELECT MIN(day) FROM per_day),
                    (NOW() AT TIME ZONE 'UTC')::date
                  ) AS start_day
         )
         SELECT d::date::text AS day,
                COALESCE(SUM(p.clicks), 0)::int AS clicks,
                COALESCE(SUM(p.uniques), 0)::int AS uniques
         FROM bounds,
              generate_series(bounds.start_day::timestamp, (NOW() AT TIME ZONE 'UTC')::date::timestamp, INTERVAL '1 day') AS d
         LEFT JOIN per_day p ON p.day = d::date
         GROUP BY d ORDER BY d`,
        params
      ),
      pool.query(
        `WITH per_day AS (
           SELECT c.post_id, (c.clicked_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS clicks,
                  COUNT(DISTINCT c.visitor_hash)::int AS uniques
           FROM blog_clicks c WHERE ${where}
           GROUP BY 1, 2
           ${rollupSql}
         )
         SELECT p.post_id AS id, b.title, SUM(p.clicks)::int AS clicks, SUM(p.uniques)::int AS uniques
         FROM per_day p JOIN blog_posts b ON b.id = p.post_id
         GROUP BY 1, 2 ORDER BY clicks DESC, b.title LIMIT 10`,
        params
      ),
      pool.query(
        `SELECT c.id, c.clicked_at, b.title, c.country, c.country_code, c.region, c.city,
                c.device_type, c.os, c.browser, c.language, c.source_page, c.traffic_source
         FROM blog_clicks c JOIN blog_posts b ON b.id = c.post_id
         WHERE ${where}
         ORDER BY c.clicked_at DESC LIMIT 25`,
        params
      ),
      breakdown('c.country'),
      breakdown(`c.city || COALESCE(', ' || c.country_code, '')`, 'AND c.city IS NOT NULL'),
      breakdown('c.device_type'),
      breakdown('c.os'),
      breakdown('c.browser'),
      breakdown('c.traffic_source'),
      breakdown('c.source_page'),
    ]);

  return {
    range: isAll ? 'all' : String(days),
    retention_days: RETENTION_DAYS,
    totals: totals.rows[0],
    timeline: timeline.rows,
    top_posts: topPosts.rows,
    recent: recent.rows,
    countries,
    cities,
    devices,
    operating_systems: oses,
    browsers,
    traffic_sources: sources,
    source_pages: pages,
  };
}

module.exports = {
  recordClick, getInsights, rollupOldClicks,
  normalizeSourcePage, visitorHash, sessionIdFromCookie, RETENTION_DAYS,
};
