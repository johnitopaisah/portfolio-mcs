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

function prometheusMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();

  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    // req.route is only set once Express has matched a registered route
    // handler, so it gives the parameterised pattern (e.g. /api/jobs/:id)
    // instead of the literal URL. Anything that never matched a route
    // (404s, vulnerability-scanner probes like /.env or /wp-*.php) is
    // collapsed into a single "unmatched" bucket — otherwise every scanner
    // hit mints its own permanent, unique route label, which is what
    // drove portfolio_http_request_duration_seconds_bucket to 800+ series.
    const route = req.route ? (req.baseUrl + req.route.path) : 'unmatched';
    const labels = {
      method:      req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
    httpRequestsInFlight.dec();
  });

  next();
}

module.exports = prometheusMiddleware;
