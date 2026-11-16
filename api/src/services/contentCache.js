'use strict';
/**
 * TTL cache for the near-static, read-heavy content routes (projects,
 * certifications, education, social-links, blog, referees).
 *
 * Shared across every API pod through Redis, so an admin edit — which
 * calls invalidate() — is visible from all pods at once, not just the one
 * that handled the write. (With the HPA running 2–10 pods, a per-pod cache
 * kept serving the old content from the other pods for up to the TTL.)
 *
 * When Redis is not configured or unreachable, falls back to an in-process
 * Map — the previous behaviour — so a Redis outage never fails a request.
 *
 * Values must be JSON-serialisable: they are only ever sent with res.json().
 */

const { getRedis, isRedisReady } = require('./redisClient');

const DEFAULT_TTL_MS = 60_000;
const PREFIX = 'cache:content:';

const local = new Map(); // key -> { value, expiresAt }  (fallback only)

function localGet(key) {
  const entry = local.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    local.delete(key);
    return undefined;
  }
  return entry.value;
}

function localSet(key, value, ttlMs) {
  local.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function redis() {
  const r = getRedis();
  return r && isRedisReady() ? r : null;
}

async function get(key) {
  const r = redis();
  if (r) {
    try {
      const raw = await r.get(PREFIX + key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch { /* fall through to local */ }
  }
  return localGet(key);
}

async function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  const r = redis();
  if (r) {
    try {
      await r.set(PREFIX + key, JSON.stringify(value), 'PX', ttlMs);
      return;
    } catch { /* fall through to local */ }
  }
  localSet(key, value, ttlMs);
}

// Clears the key everywhere this pod can reach: Redis (all pods) and this
// pod's local fallback entry.
async function invalidate(key) {
  local.delete(key);
  const r = getRedis();
  if (!r) return;
  try { await r.del(PREFIX + key); } catch { /* Redis down: TTL bounds staleness */ }
}

// Wraps a route handler's DB fetch: returns the cached value if fresh,
// otherwise calls fetchFn(), caches the result, and returns it.
async function getOrSet(key, fetchFn, ttlMs = DEFAULT_TTL_MS) {
  const cached = await get(key);
  if (cached !== undefined) return cached;
  const value = await fetchFn();
  await set(key, value, ttlMs);
  return value;
}

module.exports = { get, set, invalidate, getOrSet, DEFAULT_TTL_MS };
