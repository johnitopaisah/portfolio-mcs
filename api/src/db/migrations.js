'use strict';
/**
 * Schema migrations — shared by the runner (scripts/migrate.js, run by the
 * ArgoCD PreSync Job before every API rollout) and by the CronJob workers,
 * which refuse to run against a schema that is behind their own code.
 *
 * Source of truth: the .sql files in db/migrations, bundled into the API
 * image at /app/migrations, so every image carries exactly the migrations
 * its code expects. Applied files are recorded in schema_migrations with a
 * checksum; an applied file that is later edited is an error.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const TABLE = 'schema_migrations';

// Arbitrary constant: one migration run at a time, cluster-wide.
const LOCK_KEY = 718_204_633_011;

function resolveMigrationsDir(env = process.env) {
  if (env.MIGRATIONS_DIR) return env.MIGRATIONS_DIR;
  const bundled = path.resolve(__dirname, '../../migrations');      // /app/migrations in the image
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(__dirname, '../../../db/migrations');         // repo checkout (local dev)
}

/** @returns {{ filename: string, sql: string, checksum: string }[]} sorted by filename */
function listMigrationFiles(dir = resolveMigrationsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(filename => {
      const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
      return { filename, sql, checksum: checksumOf(sql) };
    });
}

// Line endings are normalised so a CRLF checkout doesn't look "edited".
function checksumOf(sql) {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Splits a SQL script into top-level statements, so a "-- migrate:no-transaction"
 * file can be sent one statement at a time. (Postgres runs a multi-statement
 * query string as one implicit transaction, where CREATE INDEX CONCURRENTLY is
 * not allowed.) Semicolons inside quotes, quoted identifiers, dollar-quoted
 * bodies ($$ … $$, $tag$ … $tag$) and comments do not split.
 * @returns {string[]} statements without the trailing ';', empty ones dropped
 */
function splitStatements(sql) {
  const out = [];
  let start = 0, i = 0;
  const n = sql.length;
  const push = end => {
    const stmt = sql.slice(start, end).trim();
    if (stmt.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim()) out.push(stmt);
  };
  while (i < n) {
    const c = sql[i], d = sql[i + 1];
    if (c === '-' && d === '-') {                          // line comment
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
    } else if (c === '/' && d === '*') {                   // block comment (nestable)
      let depth = 1; i += 2;
      while (i < n && depth) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
    } else if (c === '\'') {                               // string; E'' allows \' escapes
      const escapes = /[eE]/.test(sql[i - 1] || '') && !/[\w$]/.test(sql[i - 2] || '');
      i++;
      while (i < n) {
        if (escapes && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === '\'') { if (sql[i + 1] === '\'') { i += 2; continue; } i++; break; }
        i++;
      }
    } else if (c === '"') {                                // quoted identifier
      i++;
      while (i < n) {
        if (sql[i] === '"') { if (sql[i + 1] === '"') { i += 2; continue; } i++; break; }
        i++;
      }
    } else if (c === '$' && !/[\w$]/.test(sql[i - 1] || '')) {   // dollar quote
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const close = sql.indexOf(m[0], i + m[0].length);
        i = close === -1 ? n : close + m[0].length;
      } else i++;
    } else if (c === ';') {
      push(i); i++; start = i;
    } else i++;
  }
  push(n);
  return out;
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      filename    TEXT        PRIMARY KEY,
      checksum    TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration_ms INTEGER,
      applied_by  TEXT        NOT NULL DEFAULT 'migrate'   -- 'migrate' | 'baseline'
    )`);
}

/** Map filename → checksum, or null if the tracking table doesn't exist yet. */
async function appliedMigrations(db) {
  const { rows: [t] } = await db.query(`SELECT to_regclass('public.${TABLE}') IS NOT NULL AS exists`);
  if (!t.exists) return null;
  const { rows } = await db.query(`SELECT filename, checksum FROM ${TABLE}`);
  return new Map(rows.map(r => [r.filename, r.checksum]));
}

/**
 * Compares the files on disk with what the database has applied.
 * @returns {{ pending: object[], changed: string[], applied: Map|null }}
 */
async function compare(db, files) {
  const applied = await appliedMigrations(db);
  const pending = [];
  const changed = [];
  for (const f of files) {
    const sum = applied?.get(f.filename);
    if (sum == null) pending.push(f);
    else if (sum !== f.checksum) changed.push(f.filename);
  }
  return { pending, changed, applied };
}

/**
 * For CronJob workers: is the database at least as new as this image?
 * In production a worker that finds pending migrations should exit and let
 * the next run (after the PreSync migration Job) do the work. Outside
 * production it only warns, so local development isn't blocked.
 *
 * @returns {Promise<boolean>} true when the worker may run
 */
async function schemaReady(db, workerName, { env = process.env, log = console } = {}) {
  const dir   = resolveMigrationsDir(env);
  const files = listMigrationFiles(dir);
  if (!files.length) return true; // no bundled migrations (e.g. tests) — nothing to check

  let pending;
  try {
    ({ pending } = await compare(db, files));
  } catch (err) {
    log.warn(`[${workerName}] schema check failed (${err.message}) — running anyway`);
    return true;
  }
  if (!pending.length) return true;

  const names = pending.map(p => p.filename).join(', ');
  if (env.NODE_ENV === 'production' && env.SKIP_SCHEMA_CHECK !== 'true') {
    log.warn(`[${workerName}] database is behind this image — waiting for migrations: ${names}. Skipping this run.`);
    return false;
  }
  log.warn(`[${workerName}] pending migrations (not enforced outside production): ${names}`);
  return true;
}

module.exports = {
  TABLE, LOCK_KEY,
  resolveMigrationsDir, listMigrationFiles, checksumOf, splitStatements,
  ensureTable, appliedMigrations, compare, schemaReady,
};
