'use strict';
/**
 * express-rate-limit with counters shared across every API pod (Redis).
 *
 * The HPA runs 2–10 API pods. With the default per-pod MemoryStore a
 * "5 per 15 min" limit was really 5 × (number of pods). Counters now live
 * in Redis so a limit means what it says.
 *
 * Redis is optional: when it is not configured or unreachable, each
 * limiter falls back to its own in-memory store (the previous behaviour)
 * instead of failing open or failing requests.
 *
 * Usage — a drop-in for rateLimit(), plus a unique name per limiter:
 *   const contactLimiter = createRateLimiter('contact', { windowMs, max, ... });
 */

const { rateLimit, MemoryStore } = require('express-rate-limit');
const { getRedis, isRedisReady }  = require('./redisClient');

const PREFIX = 'rl:';

// Fixed window, atomic: INCR, set the expiry on the first hit of a window,
// and return the hit count with the remaining window time.
const INCREMENT_LUA = `
local hits = redis.call('INCR', KEYS[1])
local ttl  = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { hits, ttl }
`;

function ensureCommand(redis) {
  // defineCommand uses EVALSHA and transparently re-loads the script after
  // a Redis restart (NOSCRIPT), unlike a script SHA cached at startup.
  if (typeof redis.rateLimitIncrement !== 'function') {
    redis.defineCommand('rateLimitIncrement', { numberOfKeys: 1, lua: INCREMENT_LUA });
  }
}

class SharedStore {
  /**
   * @param {string} name   unique per limiter — becomes the Redis key prefix
   * @param {object} [deps] { getRedis, isRedisReady } — injectable for tests
   */
  constructor(name, deps = {}) {
    this.name     = name;
    this.prefix   = `${PREFIX}${name}:`;
    this.getRedis = deps.getRedis || getRedis;
    this.isReady  = deps.isRedisReady || isRedisReady;
    this.memory   = new MemoryStore();
    this.windowMs = 60_000;
    // Counts are not local to this process when Redis is used.
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  redis() {
    const r = this.getRedis();
    if (!r || !this.isReady()) return null;
    ensureCommand(r);
    return r;
  }

  async increment(key) {
    const r = this.redis();
    if (r) {
      try {
        const [hits, ttl] = await r.rateLimitIncrement(this.prefix + key, this.windowMs);
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) };
      } catch { /* fall back to memory for this request */ }
    }
    return this.memory.increment(key);
  }

  async decrement(key) {
    const r = this.redis();
    if (r) {
      try { await r.decr(this.prefix + key); return; } catch { /* fall back */ }
    }
    await this.memory.decrement(key);
  }

  async resetKey(key) {
    const r = this.redis();
    if (r) {
      try { await r.del(this.prefix + key); } catch { /* fall back */ }
    }
    await this.memory.resetKey(key);
  }

  async get(key) {
    const r = this.redis();
    if (r) {
      try {
        const [hits, ttl] = await Promise.all([r.get(this.prefix + key), r.pttl(this.prefix + key)]);
        if (hits == null) return undefined;
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(Number(ttl), 0)) };
      } catch { /* fall back */ }
    }
    return this.memory.get(key);
  }

  shutdown() {
    this.memory.shutdown();
  }
}

const names = new Set();

/**
 * @param {string} name     unique, stable identifier (e.g. 'contact')
 * @param {object} options  express-rate-limit options
 */
function createRateLimiter(name, options) {
  if (names.has(name)) throw new Error(`rate limiter "${name}" already exists`);
  names.add(name);
  return rateLimit({ ...options, store: new SharedStore(name) });
}

module.exports = { createRateLimiter, SharedStore, INCREMENT_LUA };
