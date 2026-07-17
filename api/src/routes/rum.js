'use strict';
/**
 * Frontend RUM (Real User Monitoring)
 * Receives Web Vitals + uncaught JS errors from admin-ui/user-ui and turns
 * them into Prometheus series. No auth (runs from anonymous browsers) —
 * rate-limited and label values are strictly allowlisted/hashed so a
 * malicious client can't blow up metric cardinality.
 */

const router    = require('express').Router();
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const { webVitalsSeconds, frontendErrorsTotal } = require('../metrics');

const rumLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, // generous — one real page load reports ~5 vitals
  standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many RUM reports' }),
});

const ALLOWED_APPS   = new Set(['admin-ui', 'user-ui']);
const ALLOWED_METRICS = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']);
const MAX_ROUTE_LENGTH = 100;

// Routes are free text from the browser's location — cap length and drop
// query strings so a crafted URL can't create unbounded label cardinality.
function sanitizeRoute(route) {
  if (typeof route !== 'string' || !route) return '/unknown';
  return route.split('?')[0].slice(0, MAX_ROUTE_LENGTH);
}

router.post('/', rumLimiter, (req, res) => {
  const { app, metric, value, route } = req.body || {};

  if (!ALLOWED_APPS.has(app) || !ALLOWED_METRICS.has(metric) || typeof value !== 'number' || !Number.isFinite(value)) {
    return res.status(400).json({ error: 'Invalid RUM payload' });
  }

  // CLS has no unit (a raw layout-shift score); INP/others are already ms
  // from the web-vitals library — normalize everything to seconds so one
  // histogram can hold all five metrics.
  const seconds = metric === 'CLS' ? value : value / 1000;

  webVitalsSeconds.observe({ metric, app, route: sanitizeRoute(route) }, seconds);
  res.status(204).end();
});

router.post('/error', rumLimiter, (req, res) => {
  const { app, message } = req.body || {};

  if (!ALLOWED_APPS.has(app) || typeof message !== 'string') {
    return res.status(400).json({ error: 'Invalid error payload' });
  }

  // Hash server-side (not client-supplied) so cardinality is bounded no
  // matter what a client sends, and so this route stays a one-liner to call.
  const messageHash = crypto.createHash('sha256').update(message).digest('hex').slice(0, 8);
  frontendErrorsTotal.inc({ app, message_hash: messageHash });
  res.status(204).end();
});

module.exports = router;
