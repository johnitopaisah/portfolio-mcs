'use strict';
/**
 * Shared Redis connection for the API pods — used ONLY for the shared
 * content cache (contentCache.js) and shared rate-limit counters
 * (rateLimit.js). Redis is a cache here, never a source of truth: nothing
 * is persisted, and every caller falls back to per-pod memory when Redis
 * is unavailable, so a Redis outage degrades to the pre-Redis behaviour
 * instead of failing requests.
 *
 * Disabled entirely (getRedis() → null) when REDIS_HOST is unset: local
 * dev without Redis, tests, and the CronJob workers.
 */

const Redis = require('ioredis');

let client = null;
let connected = false;
const listeners = new Set();

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  for (const fn of listeners) {
    try { fn(value); } catch { /* listener errors are not ours */ }
  }
}

function createClient(env = process.env) {
  const c = new Redis({
    host:     env.REDIS_HOST,
    port:     parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    db:       parseInt(env.REDIS_DB || '0', 10),
    // Fail fast instead of queueing: while Redis is down every command
    // rejects immediately and the caller uses its in-memory fallback,
    // rather than requests hanging until a reconnect.
    enableOfflineQueue:   false,
    maxRetriesPerRequest: 1,
    connectTimeout:       2_000,
    commandTimeout:       500,
    // Keep retrying in the background with a capped back-off.
    retryStrategy: times => Math.min(times * 500, 10_000),
    lazyConnect: false,
  });
  c.on('ready', () => {
    if (!connected) console.log('[Redis] connected');
    setConnected(true);
  });
  c.on('end',   () => setConnected(false));
  c.on('close', () => setConnected(false));
  // Without a listener ioredis logs every failed reconnect as an unhandled
  // error event. Log once per outage instead.
  c.on('error', err => {
    if (connected) console.warn(`[Redis] connection lost: ${err.message} — falling back to in-memory`);
    setConnected(false);
  });
  return c;
}

/** The shared client, or null when Redis is not configured. */
function getRedis() {
  if (!process.env.REDIS_HOST) return null;
  if (!client) client = createClient();
  return client;
}

/** True only while a connection is established and ready for commands. */
function isRedisReady() {
  return !!client && connected && client.status === 'ready';
}

function onConnectionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function closeRedis() {
  if (!client) return;
  const c = client;
  client = null;
  setConnected(false);
  try { await c.quit(); } catch { c.disconnect(); }
}

module.exports = { getRedis, isRedisReady, onConnectionChange, closeRedis };
