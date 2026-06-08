'use strict';
// ============================================================
//  Portfolio MCS — Prometheus Metrics
// ============================================================

const client = require('prom-client');
const register = client.register;

client.collectDefaultMetrics({
  register,
  prefix: 'portfolio_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10,
});

// ── HTTP ─────────────────────────────────────────────────────
const httpRequestsTotal = new client.Counter({
  name: 'portfolio_http_requests_total',
  help: 'Total HTTP requests by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'portfolio_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsInFlight = new client.Gauge({
  name: 'portfolio_http_requests_in_flight',
  help: 'Current number of HTTP requests in progress',
  registers: [register],
});

// ── Database ──────────────────────────────────────────────────
const dbQueryDurationSeconds = new client.Histogram({
  name: 'portfolio_db_query_duration_seconds',
  help: 'PostgreSQL query duration in seconds by operation',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const dbPoolConnectionsActive = new client.Gauge({
  name: 'portfolio_db_pool_connections_active',
  help: 'Active connections in the PostgreSQL pool',
  registers: [register],
});

const dbPoolConnectionsIdle = new client.Gauge({
  name: 'portfolio_db_pool_connections_idle',
  help: 'Idle connections in the PostgreSQL pool',
  registers: [register],
});

const dbErrorsTotal = new client.Counter({
  name: 'portfolio_db_errors_total',
  help: 'Total database errors by type',
  labelNames: ['type'],
  registers: [register],
});

// ── Business ──────────────────────────────────────────────────
const contactSubmissionsTotal = new client.Counter({
  name: 'portfolio_contact_submissions_total',
  help: 'Contact form submissions by status',
  labelNames: ['status'],
  registers: [register],
});

const authAttemptsTotal = new client.Counter({
  name: 'portfolio_auth_attempts_total',
  help: 'Authentication attempts by result',
  labelNames: ['result'],
  registers: [register],
});

const passwordResetRequestsTotal = new client.Counter({
  name: 'portfolio_password_reset_requests_total',
  help: 'Password reset requests',
  registers: [register],
});

const profileRequestsTotal = new client.Counter({
  name: 'portfolio_profile_requests_total',
  help: 'Public profile GET requests',
  registers: [register],
});

const projectsRequestsTotal = new client.Counter({
  name: 'portfolio_projects_requests_total',
  help: 'Public projects list requests',
  registers: [register],
});

const contentCreatedTotal = new client.Counter({
  name: 'portfolio_content_created_total',
  help: 'Content items created by type',
  labelNames: ['type'],
  registers: [register],
});

const contentUpdatedTotal = new client.Counter({
  name: 'portfolio_content_updated_total',
  help: 'Content items updated by type',
  labelNames: ['type'],
  registers: [register],
});

const contentDeletedTotal = new client.Counter({
  name: 'portfolio_content_deleted_total',
  help: 'Content items deleted by type',
  labelNames: ['type'],
  registers: [register],
});

// ── Visitor Analytics ─────────────────────────────────────────
// These power the Grafana "Visitor Analytics" dashboard (07).
// Incremented in api/src/routes/visitors.js on every non-bot visit.

const visitorsTotal = new client.Counter({
  name: 'portfolio_visitors_total',
  help: 'Total real (non-bot) portfolio homepage visits',
  registers: [register],
});

const visitorsByCountry = new client.Counter({
  name: 'portfolio_visitors_by_country_total',
  help: 'Portfolio visitors segmented by country',
  labelNames: ['country'],
  registers: [register],
});

const visitorsByDevice = new client.Counter({
  name: 'portfolio_visitors_by_device_total',
  help: 'Portfolio visitors segmented by device type (desktop/mobile/tablet)',
  labelNames: ['device'],
  registers: [register],
});

const visitorsByReferrer = new client.Counter({
  name: 'portfolio_visitors_by_referrer_total',
  help: 'Portfolio visitors segmented by traffic source',
  labelNames: ['referrer'],
  registers: [register],
});

const visitorsByBrowser = new client.Counter({
  name: 'portfolio_visitors_by_browser_total',
  help: 'Portfolio visitors segmented by browser',
  labelNames: ['browser'],
  registers: [register],
});

const visitorBotsFiltered = new client.Counter({
  name: 'portfolio_visitor_bots_filtered_total',
  help: 'Bot requests detected and excluded from visitor analytics',
  registers: [register],
});

// ── Referee contact requests ──────────────────────────────────
const refereeContactRequestsTotal = new client.Counter({
  name: 'portfolio_referee_contact_requests_total',
  help: 'Referee contact requests by status transition',
  labelNames: ['status'],
  registers: [register],
});

const refereeConsentResponsesTotal = new client.Counter({
  name: 'portfolio_referee_consent_responses_total',
  help: 'Referee consent responses by decision',
  labelNames: ['decision'],
  registers: [register],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  dbQueryDurationSeconds,
  dbPoolConnectionsActive,
  dbPoolConnectionsIdle,
  dbErrorsTotal,
  contactSubmissionsTotal,
  authAttemptsTotal,
  passwordResetRequestsTotal,
  profileRequestsTotal,
  projectsRequestsTotal,
  contentCreatedTotal,
  contentUpdatedTotal,
  contentDeletedTotal,
  // Visitor analytics
  visitorsTotal,
  visitorsByCountry,
  visitorsByDevice,
  visitorsByReferrer,
  visitorsByBrowser,
  visitorBotsFiltered,
  refereeContactRequestsTotal,
  refereeConsentResponsesTotal,
};
