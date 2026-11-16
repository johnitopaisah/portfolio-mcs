/**
 * Schema migration runner (scripts/migrate.js) + worker schema gate.
 *
 * Needs a Postgres where the test user may CREATE DATABASE; every test gets
 * its own throw-away database. Skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:55432/portfolio_test npm test
 *
 * Backup tests also need pg_dump on PATH (present in the API image); they
 * are skipped otherwise.
 */

const assert    = require('assert');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');
const { spawn, spawnSync } = require('child_process');

const migrations = require('../src/db/migrations');

const DB_URL   = process.env.TEST_DATABASE_URL;
const RUNNER   = path.resolve(__dirname, '../scripts/migrate.js');
const HAS_DUMP = spawnSync('pg_dump', ['--version']).status === 0;

// ── Unit ────────────────────────────────────────────────────────
describe('Migration files', () => {
  it('lists .sql files in filename order with stable checksums', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, '002_b.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'SELECT 1;\r\n');
    fs.writeFileSync(path.join(dir, 'README.md'), 'not a migration');
    const files = migrations.listMigrationFiles(dir);
    assert.deepStrictEqual(files.map(f => f.filename), ['001_a.sql', '002_b.sql']);
    assert.strictEqual(files[0].checksum, migrations.checksumOf('SELECT 1;\n'), 'CRLF and LF checksum the same');
  });

  it('splits statements without breaking quotes, identifiers, dollar bodies or comments', () => {
    const sql = [
      "-- header; comment",
      "CREATE INDEX CONCURRENTLY a ON t (x);",
      "DO $$ BEGIN RAISE NOTICE 'a;b'; END $$;",
      "DO $fn$ BEGIN PERFORM 1; /* ; */ END $fn$;",
      "INSERT INTO \"we;ird\" VALUES ('it''s;', E'esc\\';x');",
      "/* block ; /* nested ; */ */ SELECT 1",
      ";;  -- trailing",
    ].join('\n');
    const parts = migrations.splitStatements(sql);
    assert.strictEqual(parts.length, 5, JSON.stringify(parts, null, 1));
    assert.match(parts[0], /^-- header; comment\nCREATE INDEX CONCURRENTLY a ON t \(x\)$/);
    assert.match(parts[1], /RAISE NOTICE 'a;b'; END \$\$$/);
    assert.match(parts[2], /PERFORM 1; \/\* ; \*\/ END \$fn\$$/);
    assert.match(parts[3], /'it''s;', E'esc\\';x'\)$/);
    assert.match(parts[4], /SELECT 1$/);
  });

  it('every repository migration is runnable by the driver (no psql meta-commands)', () => {
    const files = migrations.listMigrationFiles(path.resolve(__dirname, '../../db/migrations'));
    assert(files.length > 30);
    for (const f of files) assert(!/^\\/m.test(f.sql), `${f.filename} uses a psql meta-command`);
  });
});

// ── Runner against real Postgres ────────────────────────────────
(DB_URL ? describe : describe.skip)('Migration runner (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  let admin, dbName, dbUrl, dir, n = 0;

  const urlFor = name => { const u = new URL(DB_URL); u.pathname = `/${name}`; return u.toString(); };
  const write  = (file, sql) => fs.writeFileSync(path.join(dir, file), sql);
  const q = async (sql, params) => {
    const c = new Client({ connectionString: dbUrl }); await c.connect();
    try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
  };
  const applied = async () => (await q('SELECT filename, applied_by FROM schema_migrations ORDER BY filename'))
    .map(r => `${r.filename}:${r.applied_by}`);

  function run(args = [], env = {}) {
    return new Promise(resolve => {
      const p = spawn(process.execPath, [RUNNER, ...args], {
        env: { ...process.env, DATABASE_URL: dbUrl, MIGRATIONS_DIR: dir, MIGRATE_ADVISORY_WAIT_MS: '30000', ...env },
      });
      let out = '';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
      p.on('close', code => resolve({ code, out }));
    });
  }

  before(async () => { admin = new Client({ connectionString: DB_URL }); await admin.connect(); });
  after(async () => { await admin.end(); });
  beforeEach(async () => {
    dbName = `mig_test_${process.pid}_${++n}`;
    await admin.query(`CREATE DATABASE ${dbName}`);
    dbUrl = urlFor(dbName);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  });
  afterEach(async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  });

  it('applies every file in order on an empty database, then does nothing', async () => {
    write('001_a.sql', 'CREATE TABLE a (id int);');
    write('002_b.sql', 'BEGIN;\nCREATE TABLE b (id int);\nCOMMIT;');   // manages its own transaction
    write('003_c.sql', '-- migrate:no-transaction\nCREATE INDEX a_idx ON a (id);');
    const r1 = await run();
    assert.strictEqual(r1.code, 0, r1.out);
    assert.deepStrictEqual(await applied(), ['001_a.sql:migrate', '002_b.sql:migrate', '003_c.sql:migrate']);

    const r2 = await run();
    assert.strictEqual(r2.code, 0);
    assert.match(r2.out, /up to date/);
  });

  it('runs a no-transaction file statement by statement (CREATE INDEX CONCURRENTLY works)', async () => {
    write('001_t.sql', 'CREATE TABLE t (id int, note text);');
    write('002_idx.sql', [
      '-- migrate:no-transaction',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS t_id_idx ON t (id);',
      "DO $$ BEGIN RAISE NOTICE 'semicolon; inside'; END $$;",
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS t_pk_idx ON t (id);',
      'ALTER TABLE t ADD CONSTRAINT t_pkey PRIMARY KEY USING INDEX t_pk_idx;',
    ].join('\n'));
    const r = await run();
    assert.strictEqual(r.code, 0, r.out);
    const idx = await q(`SELECT indexname FROM pg_indexes WHERE tablename = 't' ORDER BY 1`);
    assert.deepStrictEqual(idx.map(i => i.indexname), ['t_id_idx', 't_pkey']);
    assert.deepStrictEqual(await applied(), ['001_t.sql:migrate', '002_idx.sql:migrate']);
  });

  it('refuses a populated database with no history unless a baseline is given', async () => {
    await q('CREATE TABLE existing (id int)');
    write('001_a.sql', 'CREATE TABLE a (id int);');
    const r = await run();
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /no migration history/);
    assert.deepStrictEqual(await q(`SELECT to_regclass('a') AS t`), [{ t: null }], 'nothing applied');
  });

  it('baseline records old files without running them and applies the rest', async () => {
    await q('CREATE TABLE existing (id int)');
    write('001_old.sql', 'CREATE TABLE existing (id int);');          // would fail if re-run
    write('002_old.sql', 'SELECT 1/0;');                               // would fail if re-run
    write('003_new.sql', 'CREATE TABLE fresh (id int);');
    const r = await run([], { MIGRATE_BASELINE_THROUGH: '002_old.sql' });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(await applied(), ['001_old.sql:baseline', '002_old.sql:baseline', '003_new.sql:migrate']);

    // The baseline setting is inert once history exists.
    write('004_next.sql', 'CREATE TABLE next (id int);');
    const r2 = await run([], { MIGRATE_BASELINE_THROUGH: '002_old.sql' });
    assert.strictEqual(r2.code, 0, r2.out);
    assert((await applied()).includes('004_next.sql:migrate'));
  });

  it('rejects an unknown baseline file', async () => {
    await q('CREATE TABLE existing (id int)');
    write('001_a.sql', 'SELECT 1;');
    const r = await run([], { MIGRATE_BASELINE_THROUGH: '999_nope.sql' });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /not found/);
  });

  it('refuses to continue when an applied migration was edited', async () => {
    write('001_a.sql', 'CREATE TABLE a (id int);');
    assert.strictEqual((await run()).code, 0);
    write('001_a.sql', 'CREATE TABLE a (id bigint);');
    write('002_b.sql', 'CREATE TABLE b (id int);');
    const r = await run();
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /edited: 001_a.sql/);
    assert.deepStrictEqual(await q(`SELECT to_regclass('b') AS t`), [{ t: null }]);
  });

  it('rolls back a failing file, records nothing for it, and stops', async () => {
    write('001_ok.sql', 'CREATE TABLE ok (id int);');
    write('002_bad.sql', 'CREATE TABLE half (id int);\nSELECT * FROM does_not_exist;');
    write('003_after.sql', 'CREATE TABLE after (id int);');
    const r = await run();
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /002_bad.sql failed/);
    assert.deepStrictEqual(await applied(), ['001_ok.sql:migrate']);
    assert.deepStrictEqual(await q(`SELECT to_regclass('half') AS h, to_regclass('after') AS a`), [{ h: null, a: null }]);

    write('002_bad.sql', 'CREATE TABLE half (id int);');   // fixed before it was ever applied
    const r2 = await run();
    assert.strictEqual(r2.code, 0, r2.out);
    assert.deepStrictEqual(await applied(), ['001_ok.sql:migrate', '002_bad.sql:migrate', '003_after.sql:migrate']);
  });

  it('rolls back a failing self-managed transaction', async () => {
    write('001_tx.sql', 'BEGIN;\nCREATE TABLE t1 (id int);\nSELECT 1/0;\nCOMMIT;');
    const r = await run();
    assert.strictEqual(r.code, 1);
    assert.deepStrictEqual(await q(`SELECT to_regclass('t1') AS t`), [{ t: null }]);
    assert.deepStrictEqual(await applied(), []);
  });

  it('two runs at once apply each migration exactly once', async () => {
    write('001_slow.sql', 'SELECT pg_sleep(1.5); CREATE TABLE once (id int);');
    const [a, b] = await Promise.all([run(), run()]);
    assert.strictEqual(a.code, 0, a.out);
    assert.strictEqual(b.code, 0, b.out);
    assert.deepStrictEqual(await applied(), ['001_slow.sql:migrate']);
    assert.match(a.out + b.out, /in progress — waiting/);
  });

  it('--status and --dry-run change nothing', async () => {
    write('001_a.sql', 'CREATE TABLE a (id int);');
    const s = await run(['--status']);
    assert.strictEqual(s.code, 0);
    assert.match(s.out, /pending: 001_a.sql/);
    const d = await run(['--dry-run']);
    assert.strictEqual(d.code, 0);
    assert.deepStrictEqual(await q(`SELECT to_regclass('a') AS t`), [{ t: null }]);
  });

  (HAS_DUMP ? it : it.skip)('backs up before applying (only when something is pending) and keeps the newest N', async () => {
    const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const env = { MIGRATE_BACKUP_DIR: backups, MIGRATE_BACKUP_KEEP: '2' };
    const dumps = () => fs.readdirSync(backups).filter(f => f.endsWith('.dump'));

    write('001_a.sql', 'CREATE TABLE a (id int);');
    assert.strictEqual((await run([], env)).code, 0);
    assert.strictEqual(dumps().length, 1);

    assert.strictEqual((await run([], env)).code, 0, 'nothing pending');
    assert.strictEqual(dumps().length, 1, 'no backup when nothing is pending');

    for (const f of ['002_b.sql', '003_c.sql']) {
      write(f, `CREATE TABLE t_${f.slice(0, 3)} (id int);`);
      await new Promise(r => setTimeout(r, 20));
      assert.strictEqual((await run([], env)).code, 0);
    }
    assert.strictEqual(dumps().length, 2, 'pruned to MIGRATE_BACKUP_KEEP');
    assert(dumps().some(f => f.includes('003_c')));
    assert(!fs.readdirSync(backups).some(f => f.endsWith('.partial')));
  });

  (HAS_DUMP ? it : it.skip)('does not migrate when the backup fails', async () => {
    write('001_a.sql', 'CREATE TABLE a (id int);');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')), 'not-a-dir');
    fs.writeFileSync(file, 'x');
    const r = await run([], { MIGRATE_BACKUP_DIR: file });
    assert.strictEqual(r.code, 1);
    assert.deepStrictEqual(await q(`SELECT to_regclass('a') AS t`), [{ t: null }]);
  });

  describe('worker schema gate', () => {
    const quiet = { warn: () => {} };
    it('blocks production workers while migrations are pending, never blocks once applied', async () => {
      write('001_a.sql', 'CREATE TABLE a (id int);');
      const db = new Client({ connectionString: dbUrl }); await db.connect();
      try {
        const env = { NODE_ENV: 'production', MIGRATIONS_DIR: dir };
        assert.strictEqual(await migrations.schemaReady(db, 'T', { env, log: quiet }), false, 'no history table at all');
        assert.strictEqual(await migrations.schemaReady(db, 'T', { env: { ...env, NODE_ENV: 'development' }, log: quiet }), true);
        assert.strictEqual(await migrations.schemaReady(db, 'T', { env: { ...env, SKIP_SCHEMA_CHECK: 'true' }, log: quiet }), true);
        assert.strictEqual((await run()).code, 0);
        assert.strictEqual(await migrations.schemaReady(db, 'T', { env, log: quiet }), true);
      } finally { await db.end(); }
    });
  });
});
