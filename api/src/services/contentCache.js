'use strict';
/**
 * In-process TTL cache for the near-static, read-heavy content routes
 * (projects, certifications, education, social-links, blog, referees).
 * Per-pod, not shared — fine at this scale (2 API pods, rarely-changing
 * content) and avoids operating a new service (Redis) for a workload this
 * small. Admin writes call invalidate() so edits are visible immediately
 * rather than waiting out the TTL.
 */

const DEFAULT_TTL_MS = 60_000;

const store = new Map(); // key -> { value, expiresAt }

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidate(key) {
  store.delete(key);
}

// Wraps a route handler's DB fetch: returns the cached value if fresh,
// otherwise calls fetchFn(), caches the result, and returns it.
async function getOrSet(key, fetchFn, ttlMs = DEFAULT_TTL_MS) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await fetchFn();
  set(key, value, ttlMs);
  return value;
}

module.exports = { get, set, invalidate, getOrSet };
