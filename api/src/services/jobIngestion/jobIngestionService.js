'use strict';
/**
 * Job Ingestion Service
 * Providers: Jooble, RemoteOK, Adzuna (free official API — cleaner signal than aggregators)
 * Uses native fetch (Node 20+) — no axios dependency needed here.
 */

const pool   = require('../../db/client');
const config = require('./config');
const { deduplicateJobs, calculateDeduplicationHash } = require('./deduplicationService');
const { recordIngestionLog } = require('./ingestionLogsService');

// ── HTTP helpers ─────────────────────────────────────────────
async function httpGet(url, opts = {}) {
  const res = await fetch(url, {
    signal:  AbortSignal.timeout(opts.timeout || 12_000),
    headers: opts.headers || {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function httpPost(url, body, opts = {}) {
  const res = await fetch(url, {
    method:  'POST',
    signal:  AbortSignal.timeout(opts.timeout || 12_000),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

class JobIngestionService {

  async ingestAllJobs() {
    const t0 = Date.now();
    const results = {};
    console.log('[JobIngestion] Starting ingestion cycle…');

    for (const [key, provider] of Object.entries(config.providers)) {
      // Adzuna needs appId + apiKey; RemoteOK is public; others need apiKey
      const ok = key === 'adzuna'
        ? (provider.appId && provider.apiKey)
        : key === 'remoteOk' ? true : !!provider.apiKey;

      if (!ok) {
        console.warn(`[JobIngestion] Skipping ${key} — credentials not set`);
        continue;
      }

      try {
        results[key] = await this.ingestFromProvider(key, provider);
      } catch (err) {
        console.error(`[JobIngestion:${key}] Failed:`, err.message);
        await recordIngestionLog(key, 'FAILED', 0, 0, 0, 0, err.message, Date.now() - t0);
      }
    }

    console.log('[JobIngestion] Complete:', results);
    return results;
  }

  async ingestFromProvider(key, provider) {
    const t0 = Date.now();
    let fetched = 0, newCount = 0, dupeCount = 0;

    const queries = config.searchQueries[key] || [];
    const allJobs = [];

    for (const query of queries) {
      try {
        let jobs = [];
        if      (key === 'joobleApi')  jobs = await this.fetchFromJooble(provider, query);
        else if (key === 'remoteOk')   jobs = await this.fetchFromRemoteOk(provider, query);
        else if (key === 'adzuna')     jobs = await this.fetchFromAdzuna(provider, query);
        allJobs.push(...jobs);
        fetched += jobs.length;
      } catch (err) {
        console.error(`[JobIngestion:${key}] Query "${query}" failed:`, err.message);
      }
    }

    console.log(`[JobIngestion:${key}] Fetched ${fetched} across ${queries.length} queries`);

    const { newJobs, duplicates } = await deduplicateJobs(allJobs, key);
    newCount  = newJobs.length;
    dupeCount = duplicates.length;

    for (const job of newJobs) {
      try { await this.storeRawJob(job, key); }
      catch (err) { console.error(`[JobIngestion:${key}] Store error:`, err.message); }
    }

    const ms = Date.now() - t0;
    await recordIngestionLog(key, 'SUCCESS', fetched, newCount, dupeCount, 0, null, ms);
    console.log(`[JobIngestion:${key}] ${newCount} new, ${dupeCount} dupes — ${ms}ms`);

    return { fetched, newCount, dupeCount, ms };
  }

  // ── Jooble ─────────────────────────────────────────────────
  async fetchFromJooble(provider, query) {
    const all = [];
    // 3 pages × ~20 results = ~60 per query (down from 5 to reduce volume)
    for (let page = 0; page < 3; page++) {
      try {
        const data = await httpPost(
          `${provider.baseUrl}?apiKey=${provider.apiKey}`,
          { keywords: query, location: 'Remote', page }
        );
        const jobs = data.jobs || [];
        if (!jobs.length) break;

        all.push(...jobs.map(j => ({
          external_id:     String(j.id),
          company_name:    j.company            || 'Unknown',
          title:           j.title              || '',
          location:        j.location           || 'Remote',
          job_type:        j.type               || 'Full-time',
          description:     j.snippet || j.description || '',
          requirements:    j.requirements       || '',
          salary_min:      j.salary_min         || null,
          salary_max:      j.salary_max         || null,
          salary_currency: j.salary_currency    || 'USD',
          posted_at:       j.updated ? new Date(j.updated * 1000) : new Date(),
          apply_url:       j.link               || '',
          source_api:      'joobleApi',
          raw_data:        j,
        })));
      } catch (err) {
        console.error(`[Jooble] Page ${page} error:`, err.message);
        if (page === 0) throw err;
        break;
      }
    }
    return all;
  }

  // ── RemoteOK ───────────────────────────────────────────────
  async fetchFromRemoteOk(provider, keyword) {
    const data = await httpGet(
      `${provider.baseUrl}?search=${encodeURIComponent(keyword)}`,
      { headers: { 'User-Agent': 'portfolio-mcs/1.0 (job aggregator)' } }
    );
    return (data || [])
      .filter(j => j.id && j.id !== 'api-ad')
      .map(j => ({
        external_id:     `remoteok_${j.id}`,
        company_name:    j.company   || 'Unknown',
        title:           j.title     || '',
        location:        j.location  || 'Remote',
        job_type:        'Remote',
        description:     j.description || j.title || '',
        requirements:    '',
        salary_min:      null, salary_max: null, salary_currency: null,
        posted_at:       j.date ? new Date(j.date) : new Date(),
        apply_url:       j.url       || '',
        source_api:      'remoteOk',
        raw_data:        j,
      }));
  }

  // ── Adzuna (new) ───────────────────────────────────────────
  // Free official API: https://developer.adzuna.com/
  // 250 req/day free. Returns higher quality job data than aggregators.
  async fetchFromAdzuna(provider, query) {
    const countries = provider.countries || ['gb', 'fr', 'de', 'nl'];
    const all = [];

    for (const country of countries) {
      try {
        const params = new URLSearchParams({
          app_id:          provider.appId,
          app_key:         provider.apiKey,
          results_per_page: '20',
          what:            query,
          where:           'Remote',
          sort_by:         'date',
          max_days_old:    '7',
        });

        const data = await httpGet(
          `${provider.baseUrl}/${country}/search/1?${params}`
        );

        const currency = country === 'us' ? 'USD' : country === 'gb' ? 'GBP' : 'EUR';

        all.push(...(data.results || []).map(j => ({
          external_id:     `adzuna_${j.id}`,
          company_name:    j.company?.display_name || 'Unknown',
          title:           j.title                 || '',
          location:        j.location?.display_name || country.toUpperCase(),
          job_type:        j.contract_time          || 'Full-time',
          description:     j.description            || '',
          requirements:    '',
          salary_min:      j.salary_min             || null,
          salary_max:      j.salary_max             || null,
          salary_currency: currency,
          posted_at:       j.created ? new Date(j.created) : new Date(),
          apply_url:       j.redirect_url           || '',
          source_api:      'adzuna',
          raw_data:        j,
        })));
      } catch (err) {
        console.error(`[Adzuna:${country}] "${query}" failed:`, err.message);
      }

      // Respect 1 req/sec rate limit
      await new Promise(r => setTimeout(r, 1100));
    }

    return all;
  }

  // ── Store raw job ──────────────────────────────────────────
  async storeRawJob(job, sourceApi) {
    const hash = calculateDeduplicationHash(job.title, job.company_name, job.location);
    await pool.query(
      `INSERT INTO jobs_raw (
         external_id, company_name, title, location, job_type,
         description, requirements, salary_min, salary_max, salary_currency,
         posted_at, apply_url, source_api, dedup_hash, raw_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (external_id) DO NOTHING`,
      [
        job.external_id, job.company_name, job.title, job.location, job.job_type,
        job.description, job.requirements, job.salary_min, job.salary_max, job.salary_currency,
        job.posted_at, job.apply_url, sourceApi, hash, JSON.stringify(job.raw_data || {}),
      ]
    );
  }

  // ── Expire old jobs ────────────────────────────────────────
  async markExpiredJobs() {
    const maxAge = config.jobFiltering.maxAgeHours;
    const result = await pool.query(
      `UPDATE jobs SET is_active = FALSE, expires_at = NOW()
       WHERE is_active = TRUE AND posted_at < NOW() - INTERVAL '1 hour' * $1`,
      [maxAge]
    );
    console.log(`[JobIngestion] Expired ${result.rowCount} old jobs`);
    return result.rowCount;
  }
}

module.exports = new JobIngestionService();
