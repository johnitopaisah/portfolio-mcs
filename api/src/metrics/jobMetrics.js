/**
 * Job System Metrics (Prometheus)
 * Tracks job ingestion, filtering, and notification events
 */

const client = require('prom-client');

// jobWorker.js (the only process that increments the filtering/relevance/
// alert-delivery metrics below) runs as a Kubernetes CronJob, not inside the
// always-on API pod — it exits before Prometheus's next scrape could ever
// reach it. pushMetrics() ships the default registry (shared with client.register,
// same one api/src/metrics.js exposes at /metrics) to the shared Pushgateway
// right before the process exits.
const gateway = new client.Pushgateway(
  process.env.PUSHGATEWAY_URL || 'http://pushgateway.monitoring.svc.cluster.local:9091',
  {},
  client.register
);

async function pushMetrics(jobName) {
  try {
    await gateway.pushAdd({ jobName });
  } catch (err) {
    console.error(`[Metrics] Failed to push to Pushgateway (non-fatal): ${err.message}`);
  }
}

// ============================================================
//  Job Ingestion Metrics
// ============================================================

const jobsIngestionDuration = new client.Histogram({
  name: 'job_ingestion_duration_seconds',
  help: 'Time taken to ingest jobs from API (seconds)',
  labelNames: ['provider', 'status'],
  buckets: [5, 10, 30, 60, 120, 300],
});

const jobsIngestionTotal = new client.Counter({
  name: 'jobs_ingested_total',
  help: 'Total jobs ingested from APIs',
  labelNames: ['provider', 'status'], // success, failed
});

const jobsNewTotal = new client.Counter({
  name: 'jobs_new_total',
  help: 'Total new (non-duplicate) jobs ingested',
  labelNames: ['provider'],
});

const jobsDuplicateTotal = new client.Counter({
  name: 'jobs_duplicate_total',
  help: 'Total duplicate jobs detected',
  labelNames: ['provider'],
});

const jobsActive = new client.Gauge({
  name: 'jobs_active_total',
  help: 'Current number of active jobs in database',
});

// ============================================================
//  AI Filtering Metrics
// ============================================================

const jobsFiltered = new client.Counter({
  name: 'jobs_filtered_total',
  help: 'Total jobs processed by AI filter',
  labelNames: ['decision'], // KEEP, REVIEW, DROP
});

// Named without the "_bucket" suffix — prom-client's Histogram class already
// appends _bucket/_sum/_count to whatever name is given here. The original
// name ("job_relevance_score_bucket") would have exposed as
// "job_relevance_score_bucket_bucket", silently breaking every dashboard
// query against it.
const jobRelevanceScore = new client.Histogram({
  name: 'job_relevance_score',
  help: 'Distribution of job relevance scores',
  labelNames: ['decision'],
  buckets: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
});

const aiFilteringDuration = new client.Histogram({
  name: 'ai_filtering_duration_seconds',
  help: 'Time taken to filter a single job (seconds)',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// ============================================================
//  Notification Metrics
// ============================================================

const jobAlertsTotal = new client.Counter({
  name: 'job_alerts_sent_total',
  help: 'Total job alerts sent to users',
  labelNames: ['channel', 'status'], // channel: email, telegram, slack; status: success, failed
});

const jobAlertsDuration = new client.Histogram({
  name: 'job_alerts_duration_seconds',
  help: 'Time taken to send job alerts (seconds)',
  labelNames: ['channel'],
  buckets: [0.5, 1, 2, 5, 10],
});

const usersWithPreferences = new client.Gauge({
  name: 'users_with_job_preferences_total',
  help: 'Number of users with active job preferences',
});

// ============================================================
//  API Usage Metrics
// ============================================================

const jobsApiRequests = new client.Counter({
  name: 'jobs_api_requests_total',
  help: 'Total requests to jobs API endpoints',
  labelNames: ['endpoint', 'method', 'status'],
});

const jobsApiDuration = new client.Histogram({
  name: 'jobs_api_duration_seconds',
  help: 'Time taken to respond to jobs API requests',
  labelNames: ['endpoint', 'method'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// ============================================================
//  API Rate Limiting Metrics
// ============================================================

const apiRateLimitExceeded = new client.Counter({
  name: 'api_rate_limit_exceeded_total',
  help: 'Total API rate limit exceeded errors',
  labelNames: ['provider'],
});

// ============================================================
//  Export Metrics
// ============================================================

module.exports = {
  pushMetrics,
  jobsIngestionDuration,
  jobsIngestionTotal,
  jobsNewTotal,
  jobsDuplicateTotal,
  jobsActive,
  jobsFiltered,
  jobRelevanceScore,
  aiFilteringDuration,
  jobAlertsTotal,
  jobAlertsDuration,
  usersWithPreferences,
  jobsApiRequests,
  jobsApiDuration,
  apiRateLimitExceeded,
};
