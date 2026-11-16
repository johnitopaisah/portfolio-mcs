/**
 * Redis-backed shared cache + rate limits, and their in-memory fallback.
 *
 * Fallback tests always run. Tests against a real Redis are skipped unless
 * TEST_REDIS_URL is set:
 *
 *   TEST_REDIS_URL=redis://:secret@localhost:56379 npm test
 */

const assert = require('assert');
const http   = require('http');
const express = require('express');

const { SharedStore } = require('../src/services/rateLimit');

const LIMIT_OPTS = { windowMs: 60_000, max: 3 };

// Re-require the Redis-aware modules with a given environment (they hold a
// module-level client).
function freshModules(env) {
  for (const k of ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD']) delete process.env[k];
  Object.assign(process.env, env);
  for (const m of ['../src/services/redisClient', '../src/services/contentCache', '../src/services/rateLimit']) {
    delete require.cache[require.resolve(m)];
  }
  return {
    redisClient:  require('../src/services/redisClient'),
    contentCache: require('../src/services/contentCache'),
    rateLimit:    require('../src/services/rateLimit'),
  };
}

const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); }
  return false;
};

async function hit(app, times) {
  const server = http.createServer(app).listen(0);
  const port = server.address().port;
  const codes = [];
  try {
    for (let i = 0; i < times; i++) codes.push((await fetch(`http://127.0.0.1:${port}/`)).status);
  } finally { server.close(); }
  return codes;
}

// ── Fallback (no Redis) ─────────────────────────────────────────
describe('Shared rate limit store — fallback', () => {
  it('counts in memory when Redis is not configured', async () => {
    const s = new SharedStore('t-noredis', { getRedis: () => null, isRedisReady: () => false });
    s.init(LIMIT_OPTS);
    assert.strictEqual((await s.increment('ip')).totalHits, 1);
    assert.strictEqual((await s.increment('ip')).totalHits, 2);
    await s.resetKey('ip');
    assert.strictEqual((await s.increment('ip')).totalHits, 1);
    s.shutdown();
  });

  it('falls back to memory when a Redis command fails', async () => {
    const broken = { defineCommand() {}, rateLimitIncrement: async () => { throw new Error('down'); } };
    const s = new SharedStore('t-broken', { getRedis: () => broken, isRedisReady: () => true });
    s.init(LIMIT_OPTS);
    assert.strictEqual((await s.increment('ip')).totalHits, 1);
    assert.strictEqual((await s.increment('ip')).totalHits, 2);
    s.shutdown();
  });

  it('express limiter still limits with Redis unreachable', async function () {
    this.timeout(10000);
    const { rateLimit, redisClient } = freshModules({ REDIS_HOST: '127.0.0.1', REDIS_PORT: '1' });
    const app = express();
    app.use(rateLimit.createRateLimiter('t-unreachable', { ...LIMIT_OPTS, max: 2 }));
    app.get('/', (_q, r) => r.send('ok'));
    assert.deepStrictEqual(await hit(app, 3), [200, 200, 429]);
    await redisClient.closeRedis();
  });

  it('content cache works without Redis', async () => {
    const { contentCache } = freshModules({});
    let calls = 0;
    const fetch = async () => { calls++; return [{ id: 1 }]; };
    assert.deepStrictEqual(await contentCache.getOrSet('k', fetch), [{ id: 1 }]);
    assert.deepStrictEqual(await contentCache.getOrSet('k', fetch), [{ id: 1 }]);
    assert.strictEqual(calls, 1);
    await contentCache.invalidate('k');
    await contentCache.getOrSet('k', fetch);
    assert.strictEqual(calls, 2);
  });

  it('refuses two limiters with the same name', () => {
    const { rateLimit } = freshModules({});
    rateLimit.createRateLimiter('dup', LIMIT_OPTS);
    assert.throws(() => rateLimit.createRateLimiter('dup', LIMIT_OPTS), /already exists/);
  });
});

// ── Real Redis ──────────────────────────────────────────────────
const REDIS_URL = process.env.TEST_REDIS_URL;

(REDIS_URL ? describe : describe.skip)('Redis shared cache + rate limits', function () {
  this.timeout(15000);
  const Redis = require('ioredis');
  const u = new URL(REDIS_URL || 'redis://localhost');
  const env = { REDIS_HOST: u.hostname, REDIS_PORT: u.port || '6379', REDIS_PASSWORD: decodeURIComponent(u.password) };
  let raw, mods;

  before(async () => {
    raw = new Redis({ host: env.REDIS_HOST, port: Number(env.REDIS_PORT), password: env.REDIS_PASSWORD });
  });
  after(async () => { raw.disconnect(); });
  beforeEach(async () => {
    await raw.flushdb();
    mods = freshModules(env);
    mods.redisClient.getRedis();
    assert(await waitFor(() => mods.redisClient.isRedisReady()), 'connected to Redis');
  });
  afterEach(async () => { await mods.redisClient.closeRedis(); });

  const podStore = name => {
    const s = new mods.rateLimit.SharedStore(name);   // a second "pod" = a second store instance
    s.init(LIMIT_OPTS);
    return s;
  };

  it('counts are shared between pods and expire with the window', async () => {
    const podA = podStore('contact'), podB = podStore('contact');
    assert.strictEqual((await podA.increment('1.2.3.4')).totalHits, 1);
    assert.strictEqual((await podB.increment('1.2.3.4')).totalHits, 2);
    assert.strictEqual((await podA.increment('1.2.3.4')).totalHits, 3);
    const ttl = await raw.pttl('rl:contact:1.2.3.4');
    assert(ttl > 0 && ttl <= 60_000, `window expiry set (${ttl})`);
    assert.strictEqual((await podB.get('1.2.3.4')).totalHits, 3);
    await podB.decrement('1.2.3.4');
    assert.strictEqual((await podA.get('1.2.3.4')).totalHits, 2);
    await podA.resetKey('1.2.3.4');
    assert.strictEqual(await podB.get('1.2.3.4'), undefined);
    podA.shutdown(); podB.shutdown();
  });

  it('separate limiters do not share counters', async () => {
    const a = podStore('contact'), b = podStore('rum');
    await a.increment('ip'); await a.increment('ip');
    assert.strictEqual((await b.increment('ip')).totalHits, 1);
    a.shutdown(); b.shutdown();
  });

  it('survives a Redis restart that drops loaded scripts (NOSCRIPT)', async () => {
    const s = podStore('contact');
    await s.increment('ip');
    await raw.script('FLUSH');
    assert.strictEqual((await s.increment('ip')).totalHits, 2);
    s.shutdown();
  });

  it('express limiter enforces the limit across two app instances (pods)', async () => {
    const appA = express(), appB = express();
    appA.use(mods.rateLimit.createRateLimiter('shared-a', { ...LIMIT_OPTS, max: 3 }));
    // Same Redis prefix for both "pods": reuse SharedStore name via a second module load.
    const second = freshModules(env);
    second.redisClient.getRedis();
    assert(await waitFor(() => second.redisClient.isRedisReady()));
    appB.use(second.rateLimit.createRateLimiter('shared-a', { ...LIMIT_OPTS, max: 3 }));
    for (const app of [appA, appB]) app.get('/', (_q, r) => r.send('ok'));

    const codes = [...await hit(appA, 2), ...await hit(appB, 2)];
    assert.deepStrictEqual(codes, [200, 200, 200, 429], 'one shared budget of 3, not 3 per pod');
    await second.redisClient.closeRedis();
  });

  it('content cache is shared and invalidation reaches every pod', async () => {
    let dbCalls = 0;
    const fromDb = async () => { dbCalls++; return [{ id: dbCalls, at: new Date('2026-11-16T00:00:00Z') }]; };
    const first = await mods.contentCache.getOrSet('projects', fromDb);
    assert.strictEqual(dbCalls, 1);
    assert(await raw.get('cache:content:projects'), 'stored in Redis');
    const ttl = await raw.pttl('cache:content:projects');
    assert(ttl > 0 && ttl <= 60_000);

    // "Pod B" — a separate module instance with its own (empty) local map.
    const podB = freshModules(env);
    podB.redisClient.getRedis();
    assert(await waitFor(() => podB.redisClient.isRedisReady()));
    const fromB = await podB.contentCache.getOrSet('projects', fromDb);
    assert.strictEqual(dbCalls, 1, 'pod B served from the shared cache');
    assert.deepStrictEqual(fromB, JSON.parse(JSON.stringify(first)), 'same JSON as pod A sent');

    await podB.contentCache.invalidate('projects');   // admin edit handled by pod B
    await mods.contentCache.getOrSet('projects', fromDb);
    assert.strictEqual(dbCalls, 2, 'pod A refetched after pod B invalidated');
    await podB.redisClient.closeRedis();
  });

  it('falls back to memory when Redis goes away mid-flight, and recovers', async () => {
    const s = podStore('contact');
    await s.increment('ip');
    await raw.client('KILL', 'TYPE', 'normal', 'SKIPME', 'yes'); // drop the module's connection
    // Immediately after the drop: either still-ready-then-fail or not-ready — both must work.
    const during = await s.increment('ip');
    assert(during.totalHits >= 1);
    assert(await waitFor(() => mods.redisClient.isRedisReady(), 12000), 'reconnected');
    const after = await s.increment('ip');
    assert(after.totalHits >= 2, 'back on the shared Redis counter');
    s.shutdown();
  });
});
