/**
 * Job Deduplication Service
 * Identifies duplicate jobs based on title, company, and location
 */

const crypto = require('crypto');
const pool = require('../../db/client');

/**
 * Calculate deduplication hash
 * Based on: title + company + location (case-insensitive)
 */
function calculateDeduplicationHash(title, company, location) {
  const normalized = `${title.toLowerCase()}-${company.toLowerCase()}-${(location || 'remote').toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Deduplicate jobs against existing database records
 * Returns { newJobs, duplicates }
 */
async function deduplicateJobs(jobs, sourceApi) {
  const newJobs = [];
  const duplicates = [];

  // Build dedup hashes for all incoming jobs
  const jobsByHash = {};
  for (const job of jobs) {
    const hash = calculateDeduplicationHash(job.title, job.company_name, job.location);
    job.dedup_hash = hash;
    if (!jobsByHash[hash]) jobsByHash[hash] = [];
    jobsByHash[hash].push(job);
  }

  // Check which hashes already exist in the database
  const existingHashes = await getExistingJobHashes(Object.keys(jobsByHash));

  // Separate new from duplicates
  for (const [hash, jobList] of Object.entries(jobsByHash)) {
    if (existingHashes.has(hash)) {
      // Mark as duplicate
      jobList.forEach((job) => {
        job.is_duplicate = true;
        duplicates.push(job);
      });
    } else {
      // Passed exact-hash dedup — but that only catches identical title+
      // company+location text. Check for near-duplicates too (same posting
      // mirrored elsewhere with slightly different wording/location
      // formatting, e.g. "Berlin" vs "Berlin, Germany") before accepting
      // each candidate as genuinely new.
      for (const job of jobList) {
        const similar = await findSimilarJobs(job.title, job.company_name);
        if (similar.length > 0) {
          job.is_duplicate = true;
          duplicates.push(job);
        } else {
          job.is_duplicate = false;
          newJobs.push(job);
        }
      }
    }
  }

  console.log(`[Deduplication] ${newJobs.length} new, ${duplicates.length} duplicates from ${sourceApi}`);

  return { newJobs, duplicates };
}

/**
 * Get existing job dedup hashes from database
 */
async function getExistingJobHashes(hashes) {
  if (hashes.length === 0) return new Set();

  // Build parameterized query
  const placeholders = hashes.map((_, i) => `$${i + 1}`).join(',');
  const query = `SELECT dedup_hash FROM jobs_raw WHERE dedup_hash IN (${placeholders})`;

  const result = await pool.query(query, hashes);
  return new Set(result.rows.map((row) => row.dedup_hash));
}

/**
 * Find near-duplicate jobs (fuzzy matching)
 * Uses Levenshtein distance for similar titles
 * Useful for catching variations like "Senior Dev" vs "Senior Developer"
 */
async function findSimilarJobs(title, company, threshold = 0.85) {
  // PostgreSQL pg_trgm extension for trigram similarity
  const query = `
    SELECT id, title, company_name, similarity(title, $1) AS sim
    FROM jobs_raw
    WHERE similarity(title, $1) > $2
      AND company_name ILIKE $3
    ORDER BY sim DESC
    LIMIT 5;
  `;

  try {
    const result = await pool.query(query, [title, threshold, `%${company}%`]);
    return result.rows;
  } catch (error) {
    console.warn('[Deduplication] Similarity search failed (pg_trgm not available):', error.message);
    return [];
  }
}

module.exports = {
  calculateDeduplicationHash,
  deduplicateJobs,
  getExistingJobHashes,
  findSimilarJobs,
};
