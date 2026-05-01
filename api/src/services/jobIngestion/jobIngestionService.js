/**
 * Job Ingestion Service
 * Polls job APIs, deduplicates, and stores raw jobs for AI filtering
 */

const axios = require('axios');
const pool = require('../../db/client');
const config = require('./config');
const { deduplicateJobs, calculateDeduplicationHash } = require('./deduplicationService');
const { recordIngestionLog, getLastSuccessfulRun } = require('./ingestionLogsService');

class JobIngestionService {
  /**
   * Main ingestion entry point
   * Polls all configured providers and stores raw jobs
   */
  async ingestAllJobs() {
    const startTime = Date.now();
    const results = {};

    console.log('[JobIngestion] Starting job ingestion cycle...');

    for (const [providerKey, provider] of Object.entries(config.providers)) {
      if (!provider.apiKey) {
        console.warn(`[JobIngestion] Skipping provider ${providerKey} - API key not set`);
        continue;
      }

      try {
        results[providerKey] = await this.ingestFromProvider(providerKey, provider);
      } catch (error) {
        console.error(`[JobIngestion] Failed to ingest from ${providerKey}:`, error.message);
        await recordIngestionLog(
          providerKey,
          'FAILED',
          0,
          0,
          0,
          0,
          error.message,
          Date.now() - startTime
        );
      }
    }

    console.log('[JobIngestion] Completed:', results);
    return results;
  }

  /**
   * Ingest from a single provider
   */
  async ingestFromProvider(providerKey, provider) {
    const startTime = Date.now();
    let jobsFetched = 0;
    let jobsNew = 0;
    let jobsDuplicates = 0;

    console.log(`[JobIngestion:${providerKey}] Starting ingestion...`);

    const queries = config.searchQueries[providerKey] || [];
    const allJobs = [];

    // Fetch from all search queries
    for (const query of queries) {
      try {
        const jobs = await this.fetchJobsFromApi(providerKey, provider, query);
        allJobs.push(...jobs);
        jobsFetched += jobs.length;
      } catch (error) {
        console.error(`[JobIngestion:${providerKey}] Failed to fetch for query "${query}":`, error.message);
      }
    }

    console.log(`[JobIngestion:${providerKey}] Fetched ${jobsFetched} jobs from ${queries.length} queries`);

    // Deduplicate and store
    const { newJobs, duplicates } = await deduplicateJobs(allJobs, providerKey);
    jobsNew = newJobs.length;
    jobsDuplicates = duplicates.length;

    // Store raw jobs
    for (const job of newJobs) {
      try {
        await this.storeRawJob(job, providerKey);
      } catch (error) {
        console.error(`[JobIngestion:${providerKey}] Failed to store job ${job.external_id}:`, error.message);
      }
    }

    const durationMs = Date.now() - startTime;

    // Log ingestion run
    await recordIngestionLog(
      providerKey,
      'SUCCESS',
      jobsFetched,
      jobsNew,
      jobsDuplicates,
      0, // filtered jobs (AI filtering happens later)
      null,
      durationMs
    );

    console.log(
      `[JobIngestion:${providerKey}] Complete: ${jobsNew} new, ${jobsDuplicates} duplicates in ${durationMs}ms`
    );

    return { jobsFetched, jobsNew, jobsDuplicates, durationMs };
  }

  /**
   * Fetch jobs from a specific provider's API
   */
  async fetchJobsFromApi(providerKey, provider, query) {
    console.log(`[JobIngestion:${providerKey}] Fetching for query: "${query}"`);

    if (providerKey === 'joobleApi') {
      return this.fetchFromJooble(provider, query);
    } else if (providerKey === 'remoteOk') {
      return this.fetchFromRemoteOk(provider, query);
    }

    throw new Error(`Unknown provider: ${providerKey}`);
  }

  /**
   * Jooble API Implementation
   * Reference: https://jooble.org/api/about
   */
  async fetchFromJooble(provider, query) {
    const pageLimit = 5; // Fetch 5 pages (100 jobs per page)
    const allJobs = [];

    for (let page = 0; page < pageLimit; page++) {
      try {
        const response = await axios.post(provider.baseUrl, {
          keywords: query,
          location: 'Remote',
          // datePosted: 7, // Last 7 days (optional)
        }, {
          headers: {
            'Content-Type': 'application/json',
          },
          params: {
            apiKey: provider.apiKey,
          },
          timeout: 10000,
        });

        const jobs = response.data.jobs || [];
        console.log(`[JobIngestion:joobleApi] Page ${page + 1}: ${jobs.length} jobs`);

        if (jobs.length === 0) break; // No more jobs

        const normalized = jobs.map((job) => ({
          external_id: job.id,
          company_name: job.company,
          title: job.title,
          location: job.location || 'Remote',
          job_type: job.type || 'Full-time',
          description: job.snippet || job.description || '',
          requirements: job.requirements || '',
          salary_min: job.salary_min || null,
          salary_max: job.salary_max || null,
          salary_currency: job.salary_currency || 'USD',
          posted_at: new Date(job.updated * 1000 || Date.now()), // Jooble uses Unix timestamp
          apply_url: job.link,
          source_api: 'joobleApi',
          raw_data: job,
        }));

        allJobs.push(...normalized);
      } catch (error) {
        console.error(`[JobIngestion:joobleApi] Page ${page} error:`, error.message);
        if (page === 0) throw error; // Fail if first page fails
        break;
      }
    }

    return allJobs;
  }

  /**
   * RemoteOK API Implementation
   * Reference: https://remoteok.com/api
   */
  async fetchFromRemoteOk(provider, keyword) {
    try {
      const response = await axios.get(`${provider.baseUrl}?search=${keyword}`, {
        timeout: 10000,
      });

      const jobs = response.data || [];
      console.log(`[JobIngestion:remoteOk] Fetched ${jobs.length} jobs`);

      const normalized = jobs
        .filter((job) => job.id !== 'api-ad') // Filter out API ad
        .map((job) => ({
          external_id: `remote_ok_${job.id}`,
          company_name: job.company,
          title: job.title,
          location: job.location || 'Remote',
          job_type: 'Remote',
          description: job.description || job.title,
          requirements: '',
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          posted_at: new Date(job.date_posted * 1000 || Date.now()),
          apply_url: job.url,
          source_api: 'remoteOk',
          raw_data: job,
        }));

      return normalized;
    } catch (error) {
      console.error('[JobIngestion:remoteOk] API error:', error.message);
      throw error;
    }
  }

  /**
   * Store a raw job in the database
   */
  async storeRawJob(job, sourceApi) {
    const dedup_hash = calculateDeduplicationHash(
      job.title,
      job.company_name,
      job.location
    );

    const query = `
      INSERT INTO jobs_raw (
        external_id,
        company_name,
        title,
        location,
        job_type,
        description,
        requirements,
        salary_min,
        salary_max,
        salary_currency,
        posted_at,
        apply_url,
        source_api,
        dedup_hash,
        raw_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id;
    `;

    const values = [
      job.external_id,
      job.company_name,
      job.title,
      job.location,
      job.job_type,
      job.description,
      job.requirements,
      job.salary_min,
      job.salary_max,
      job.salary_currency,
      job.posted_at,
      job.apply_url,
      sourceApi,
      dedup_hash,
      JSON.stringify(job.raw_data),
    ];

    const result = await pool.query(query, values);
    return result.rows[0]?.id;
  }

  /**
   * Cleanup: Mark old jobs as inactive (soft delete via TTL)
   */
  async markExpiredJobs() {
    const maxAgeHours = config.jobFiltering.maxAgeHours;

    const query = `
      UPDATE jobs
      SET is_active = FALSE,
          expires_at = NOW()
      WHERE is_active = TRUE
        AND posted_at < NOW() - INTERVAL '1 hour' * $1
    `;

    const result = await pool.query(query, [maxAgeHours]);
    console.log(`[JobIngestion] Marked ${result.rowCount} jobs as expired`);
    return result.rowCount;
  }
}

module.exports = new JobIngestionService();
