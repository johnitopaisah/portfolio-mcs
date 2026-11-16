#!/usr/bin/env node
'use strict';
/**
 * Applies pending db/migrations/*.sql files, in filename order, exactly once.
 *
 * Runs automatically as an ArgoCD PreSync Job (k8s/api/migrate-job.yaml)
 * before every API rollout; a failure stops the rollout and the previous
 * version keeps serving. Can also be run by hand:
 *
 *   node scripts/migrate.js                 apply pending migrations
 *   node scripts/migrate.js --status        list applied / pending, change nothing
 *   node scripts/migrate.js --dry-run       show what would run, change nothing
 *
 * Options (flag or env):
 *   --baseline-through=<file>  MIGRATE_BASELINE_THROUGH   On a database with no
 *        migration history, record every file up to and including <file> as
 *        already applied (without running it). Ignored once history exists.
 *   --backup-dir=<dir>         MIGRATE_BACKUP_DIR         pg_dump (custom format)
 *        to <dir> before applying anything. Only when something is pending.
 *        If the backup fails, nothing is applied.
 *   --keep=<n>                 MIGRATE_BACKUP_KEEP        backups kept (default 3)
 *   MIGRATE_LOCK_TIMEOUT  (default 60s) — a migration waiting longer than this
 *        for a table lock fails instead of stalling live traffic behind it.
 *
 * Per-file transactions: a file is wrapped in BEGIN/COMMIT (and recorded in
 * the same transaction) unless it manages its own (contains BEGIN;) or opts
 * out with a "-- migrate:no-transaction" line (e.g. CREATE INDEX CONCURRENTLY).
 */

require('dotenv').config();
const fs            = require('fs');
const path          = require('path');
const { spawn }     = require('child_process');
const { Client }    = require('pg');
const m             = require('../src/db/migrations');

const ARGS = Object.fromEntries(process.argv.slice(2)
  .filter(a => a.startsWith('--'))
  .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true']; }));

const opts = {
  status:           ARGS.status === 'true',
  dryRun:           ARGS['dry-run'] === 'true',
  baselineThrough:  ARGS['baseline-through'] || process.env.MIGRATE_BASELINE_THROUGH || null,
  backupDir:        ARGS['backup-dir'] || process.env.MIGRATE_BACKUP_DIR || null,
  keep:             parseInt(ARGS.keep || process.env.MIGRATE_BACKUP_KEEP || '3', 10),
  lockTimeout:      process.env.MIGRATE_LOCK_TIMEOUT || '60s',
  advisoryWaitMs:   parseInt(process.env.MIGRATE_ADVISORY_WAIT_MS || '300000', 10),
  dir:              m.resolveMigrationsDir(),
};

const log = msg => console.log(`[migrate] ${msg}`);

async function acquireLock(db) {
  const deadline = Date.now() + opts.advisoryWaitMs;
  for (;;) {
    const { rows: [r] } = await db.query('SELECT pg_try_advisory_lock($1) AS ok', [m.LOCK_KEY]);
    if (r.ok) return;
    if (Date.now() > deadline) throw new Error('another migration run holds the lock — gave up waiting');
    log('another migration run is in progress — waiting…');
    await new Promise(res => setTimeout(res, 5000));
  }
}

// Existing app tables but no migration history = a database migrated by hand
// before this runner existed. Running 001… against it would be wrong.
async function looksPopulated(db) {
  const { rows: [r] } = await db.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> $1`, [m.TABLE]);
  return r.n > 0;
}

async function baseline(db, files, through) {
  const idx = files.findIndex(f => f.filename === through);
  if (idx === -1) throw new Error(`baseline file "${through}" not found in ${opts.dir}`);
  const slice = files.slice(0, idx + 1);
  await db.query('BEGIN');
  for (const f of slice) {
    await db.query(
      `INSERT INTO ${m.TABLE} (filename, checksum, applied_by) VALUES ($1, $2, 'baseline')
       ON CONFLICT (filename) DO NOTHING`, [f.filename, f.checksum]);
  }
  await db.query('COMMIT');
  log(`baseline: recorded ${slice.length} existing migrations as applied (through ${through})`);
}

function backup(dir, label) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file  = path.join(dir, `pre-migrate-${stamp}-${label.replace(/\.sql$/, '')}.dump`);
  const tmp   = `${file}.partial`;
  log(`backup: pg_dump → ${file}`);
  return new Promise((resolve, reject) => {
    const p = spawn('pg_dump', ['--format=custom', '--compress=6', '--no-owner', `--file=${tmp}`, `--dbname=${process.env.DATABASE_URL}`],
      { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', code => {
      if (code !== 0) { fs.rmSync(tmp, { force: true }); return reject(new Error(`pg_dump exited ${code}`)); }
      fs.renameSync(tmp, file);
      const mb = (fs.statSync(file).size / 1048576).toFixed(1);
      log(`backup: done (${mb} MB)`);
      resolve(file);
    });
  });
}

function pruneBackups(dir, keep) {
  const dumps = fs.readdirSync(dir).filter(f => /^pre-migrate-.*\.dump$/.test(f)).sort();
  for (const f of dumps.slice(0, Math.max(0, dumps.length - keep))) {
    fs.rmSync(path.join(dir, f), { force: true });
    log(`backup: pruned ${f}`);
  }
}

async function apply(db, f) {
  const ownTxn  = /^\s*(BEGIN|START\s+TRANSACTION)\s*;/im.test(f.sql);
  const noTxn   = /^\s*--\s*migrate:no-transaction\b/im.test(f.sql);
  const wrap    = !ownTxn && !noTxn;
  const t0      = Date.now();
  log(`applying ${f.filename}${wrap ? '' : ownTxn ? ' (own transaction)' : ' (no transaction)'}`);
  try {
    if (wrap) await db.query('BEGIN');
    await db.query(f.sql);
    await db.query(
      `INSERT INTO ${m.TABLE} (filename, checksum, duration_ms) VALUES ($1, $2, $3)`,
      [f.filename, f.checksum, Date.now() - t0]);
    if (wrap) await db.query('COMMIT');
  } catch (err) {
    // Also ends a transaction a self-managed file left open on failure.
    await db.query('ROLLBACK').catch(() => {});
    throw new Error(`${f.filename} failed: ${err.message}${err.position ? ` (at character ${err.position})` : ''}`);
  }
  log(`applied  ${f.filename} in ${Date.now() - t0} ms`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const files = m.listMigrationFiles(opts.dir);
  if (!files.length) throw new Error(`no migrations found in ${opts.dir}`);
  log(`${files.length} migration files in ${opts.dir}`);

  const db = new Client({ connectionString: process.env.DATABASE_URL, application_name: 'schema-migrate' });
  await db.connect();
  try {
    if (opts.status) {
      const { pending, changed, applied } = await m.compare(db, files);
      log(applied ? `${applied.size} applied` : 'no migration history yet');
      for (const f of changed) log(`CHANGED after being applied: ${f}`);
      for (const f of pending) log(`pending: ${f.filename}`);
      if (!pending.length && !changed.length) log('database is up to date');
      return;
    }

    await acquireLock(db);
    try {
      await db.query(`SET lock_timeout = '${opts.lockTimeout.replace(/'/g, '')}'`);
      await m.ensureTable(db);

      let applied = await m.appliedMigrations(db);
      if (applied.size === 0 && await looksPopulated(db)) {
        if (!opts.baselineThrough) {
          throw new Error('this database has tables but no migration history. Set MIGRATE_BASELINE_THROUGH ' +
            '(or --baseline-through=<file>) to the last migration already applied by hand.');
        }
        if (opts.dryRun) log(`dry-run: would baseline through ${opts.baselineThrough}`);
        else await baseline(db, files, opts.baselineThrough);
      }

      const { pending, changed } = await m.compare(db, files);
      if (changed.length) {
        throw new Error(`already-applied migrations were edited: ${changed.join(', ')}. ` +
          'Never change an applied migration — add a new one instead.');
      }
      if (!pending.length) { log('database is up to date — nothing to apply'); return; }
      log(`pending: ${pending.map(p => p.filename).join(', ')}`);
      if (opts.dryRun) { log('dry-run: nothing applied'); return; }

      if (opts.backupDir) {
        await backup(opts.backupDir, pending[0].filename);
        pruneBackups(opts.backupDir, opts.keep);
      }
      for (const f of pending) await apply(db, f);
      log(`done — ${pending.length} migration(s) applied`);
    } finally {
      await db.query('SELECT pg_advisory_unlock($1)', [m.LOCK_KEY]).catch(() => {});
    }
  } finally {
    await db.end();
  }
}

main().then(
  () => process.exit(0),
  err => { console.error(`[migrate] FAILED: ${err.message}`); process.exit(1); },
);
