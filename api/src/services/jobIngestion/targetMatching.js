'use strict';
/**
 * Target-scoped job matching — turns a job_targets row into SQL conditions
 * against the `jobs` table. There's no stored link between a job posting
 * and the target that "discovered" it (search discovers a board once, then
 * polls it directly forever after — see known_boards), so "jobs matching
 * this target" is always computed live from the target's own criteria
 * rather than read from history.
 */

const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'a', 'an', 'of', 'to', 'in', 'on']);
const MIN_KEYWORD_LENGTH = 3;

// Pure — no DB access — so it's unit-testable on its own.
function extractSignificantKeywords(roleQuery) {
  if (!roleQuery) return [];
  const seen = new Set();
  return roleQuery
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep unicode letters/digits
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => w.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(w))
    .filter(w => (seen.has(w) ? false : (seen.add(w), true)));
}

/**
 * Appends the target's fixed identity criteria — title keywords, locations,
 * recency — to an existing conditions/params pair, following the same
 * $N-placeholder convention as the pipeline query builder. Deliberately
 * excludes relevance_score: the caller resolves the effective score floor
 * itself, since that (unlike title/location/recency) is meant to be
 * adjustable per-visit rather than a fixed identity of the target.
 */
function applyTargetMatchConditions(target, conditions, params) {
  const keywords = extractSignificantKeywords(target.role_query);
  for (const kw of keywords) {
    params.push(`%${kw}%`);
    conditions.push(`j.title ILIKE $${params.length}`);
  }

  // Empty locations = no constraint at all (the Targets UI itself documents
  // this as "remote-open / no location constraint"), not "Remote only".
  if (Array.isArray(target.locations) && target.locations.length > 0) {
    const locConditions = [];
    for (const loc of target.locations) {
      params.push(`%${loc}%`);
      locConditions.push(`j.location ILIKE $${params.length}`);
    }
    // Remote jobs are location-agnostic — always let them through regardless
    // of which specific cities/countries the target lists.
    locConditions.push(`j.location ILIKE '%remote%'`);
    conditions.push(`(${locConditions.join(' OR ')})`);
  }

  if (target.posted_within_days) {
    params.push(target.posted_within_days);
    conditions.push(`j.posted_at >= NOW() - ($${params.length} || ' days')::interval`);
  }
}

module.exports = { extractSignificantKeywords, applyTargetMatchConditions };
