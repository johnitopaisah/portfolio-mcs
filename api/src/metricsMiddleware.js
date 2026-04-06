'use strict';
// ============================================================
//  Portfolio MCS — Prometheus HTTP Middleware
//  Auto-instruments every Express request.
//  Mount BEFORE all routes in index.js.
// ============================================================

const {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
} = require('./metrics');

// Keep cardinality low — replace dynamic path segments with placeholders.
function normaliseRoute(path) {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/$/, '') || '/';
}

function prometheusMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();

  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method:      req.method,
      route:       normaliseRoute(req.path),
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
    httpRequestsInFlight.dec();
  });

  next();
}

module.exports = prometheusMiddleware;
