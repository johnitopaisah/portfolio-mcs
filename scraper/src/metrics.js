'use strict';
/**
 * Scraper Prometheus Metrics
 *
 * This process runs as a Kubernetes CronJob (k8s/scraper/03-cronjob-discovery.yaml)
 * — it exits before Prometheus's next scrape could ever reach it, so there is
 * no /metrics endpoint here. Instead, pushMetrics() ships everything to the
 * shared Pushgateway (monitoring/pushgateway/) right before the process exits,
 * and Prometheus scrapes the gateway as a static target.
 */

const client = require('prom-client');

const register = new client.Registry();

const jobIngestionDuration = new client.Histogram({
  name: 'job_ingestion_duration_seconds',
  help: 'Time taken for one discovery run pass (seconds), by source platform',
  labelNames: ['provider', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

const jobsIngestedTotal = new client.Counter({
  name: 'jobs_ingested_total',
  help: 'Total jobs fetched from a platform in a run, before dedup/filtering',
  labelNames: ['provider', 'status'], // status: success | failed
  registers: [register],
});

const jobsNewTotal = new client.Counter({
  name: 'jobs_new_total',
  help: 'Total new (non-duplicate) jobs stored in jobs_raw',
  labelNames: ['provider'],
  registers: [register],
});

const jobsDuplicateTotal = new client.Counter({
  name: 'jobs_duplicate_total',
  help: 'Total candidate URLs already seen in a prior run (crawl_seen_urls hit)',
  labelNames: ['provider'],
  registers: [register],
});

const gateway = new client.Pushgateway(
  process.env.PUSHGATEWAY_URL || 'http://pushgateway.monitoring.svc.cluster.local:9091',
  {},
  register
);

// A push failure (Pushgateway briefly unreachable) must never fail the
// discovery run itself — this is best-effort observability, not the job.
async function pushMetrics(jobName) {
  try {
    await gateway.pushAdd({ jobName });
  } catch (err) {
    console.error(`[Metrics] Failed to push to Pushgateway (non-fatal): ${err.message}`);
  }
}

module.exports = {
  register,
  jobIngestionDuration,
  jobsIngestedTotal,
  jobsNewTotal,
  jobsDuplicateTotal,
  pushMetrics,
};
