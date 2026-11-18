/**
 * Dashboard Search Health + reminders (Nov 2026 fixes):
 *   • reminders close when an application reaches a final status (038 trigger)
 *   • "Submitted docs" counts any attached document, ignores email-detected apps
 *   • weekly goal scored in proportion to progress
 *   • real reminder counts + clear-overdue endpoint
 *
 * Unit tests always run. Database tests need TEST_DATABASE_URL (a user that
 * may CREATE DATABASE); they build a throw-away database from db/schema.sql
 * and apply pending migrations with the real runner.
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const { FINAL_STATUSES } = require('../src/constants/applicationStatuses');

const MIGRATION_038 = path.resolve(__dirname, '../../db/migrations/038_close_reminders_on_final_status.sql');

// ── Unit ────────────────────────────────────────────────────────
describe('Weekly goal points (proportional)', () => {
  const { weeklyGoalPoints } = loadDashboardService();
  it('scores progress, not all-or-nothing', () => {
    assert.strictEqual(weeklyGoalPoints(29, 30, 15), 14);   // one short: not full marks
    assert.strictEqual(weeklyGoalPoints(15, 30, 15), 7);
    assert.strictEqual(weeklyGoalPoints(30, 30, 15), 15);
    assert.strictEqual(weeklyGoalPoints(0, 30, 15), 0);
  });
  it('caps at the maximum and tolerates bad input', () => {
    assert.strictEqual(weeklyGoalPoints(45, 30, 15), 15);
    assert.strictEqual(weeklyGoalPoints(-3, 30, 15), 0);
    assert.strictEqual(weeklyGoalPoints(3, 0, 15), 15);
  });
});

describe('Final statuses', () => {
  it('migration 038 closes reminders for exactly FINAL_STATUSES', () => {
    const sql = fs.readFileSync(MIGRATION_038, 'utf8');
    const lists = [...sql.matchAll(/status IN \(([^)]*)\)/g)].map(m => m[1].match(/'([A-Z_]+)'/g).map(s => s.slice(1, -1)).sort());
    assert.strictEqual(lists.length, 2, 'trigger + one-off update');
    for (const l of lists) assert.deepStrictEqual(l, [...FINAL_STATUSES].sort());
  });
});

function loadDashboardService() {
  delete require.cache[require.resolve('../src/services/dashboardService')];
  delete require.cache[require.resolve('../src/db/client')];
  return require('../src/services/dashboardService');
}

// ── Database ────────────────────────────────────────────────────
const DB_URL = process.env.TEST_DATABASE_URL;

(DB_URL ? describe : describe.skip)('Search Health + reminders (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  const name = `health_test_${process.pid}`;
  let admin, url, db, svc, server, base, token;

  const q = (sql, p) => db.query(sql, p).then(r => r.rows);
  const component = (h, key) => h.components.find(c => c.key === key);

  before(async () => {
    admin = new Client({ connectionString: DB_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
    const u = new URL(DB_URL); u.pathname = `/${name}`; url = u.toString();

    // Fresh database exactly as db/Dockerfile builds it, then pending
    // migrations (038) through the real runner.
    // Own connection: pg_dump output empties search_path for its session.
    const loader = new Client({ connectionString: url }); await loader.connect();
    await loader.query(fs.readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));
    await loader.end();
    db = new Client({ connectionString: url }); await db.connect();
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/migrate.js')], {
      env: { ...process.env, DATABASE_URL: url, MIGRATIONS_DIR: path.resolve(__dirname, '../../db/migrations') },
      encoding: 'utf8',
    });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /applied {2}038_close_reminders_on_final_status\.sql/);

    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET   = 'health-test';
    process.env.NODE_ENV     = 'test';
    svc = loadDashboardService();

    const express = require('express');
    delete require.cache[require.resolve('../src/routes/applications')];
    const app = express(); app.use(express.json());
    app.use('/api/applications', require('../src/routes/applications'));
    server = http.createServer(app).listen(0);
    base   = `http://127.0.0.1:${server.address().port}/api/applications`;
    token  = require('jsonwebtoken').sign({ id: 1, role: 'admin' }, 'health-test');
  });

  after(async () => {
    server?.close();
    await require('../src/db/client').end().catch(() => {});
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    await q('TRUNCATE applications, application_reminders, application_documents, application_events, automation_log RESTART IDENTITY CASCADE');
    await q(`UPDATE user_settings SET weekly_application_goal = 30`);
    if (!(await q('SELECT 1 FROM user_settings')).length) await q(`INSERT INTO user_settings (weekly_application_goal) VALUES (30)`);
  });

  const app = (status, extra = {}) => q(
    `INSERT INTO applications (company_name, job_title, status, entry_method, applied_at, created_at)
     VALUES ($1, 'DevOps', $2, $3, NOW() - INTERVAL '10 days', COALESCE($4, NOW())) RETURNING id`,
    [extra.company || 'Acme', status, extra.entry || 'paste', extra.created || null]).then(r => r[0].id);
  const reminder = (appId, daysAgo, type = 'follow_up') => q(
    `INSERT INTO application_reminders (application_id, reminder_type, title, remind_at)
     VALUES ($1, $2, 'Follow up', NOW() - make_interval(days => $3))`, [appId, type, daysAgo]);
  const openReminders = appId => q('SELECT count(*)::int n FROM application_reminders WHERE application_id = $1 AND is_done = FALSE', [appId]).then(r => r[0].n);

  it('closing an application closes its reminders (any final status, any code path)', async () => {
    for (const status of ['REJECTED', 'WITHDRAWN', 'ARCHIVED', 'GHOSTED']) {
      const id = await app('APPLIED');
      await reminder(id, 3); await reminder(id, 1, 'review');
      await q('UPDATE applications SET status = $1 WHERE id = $2', [status, id]);
      assert.strictEqual(await openReminders(id), 0, status);
    }
  });

  it('moving between open statuses keeps reminders', async () => {
    const id = await app('APPLIED');
    await reminder(id, 3);
    await q(`UPDATE applications SET status = 'INTERVIEW_SCHEDULED' WHERE id = $1`, [id]);
    assert.strictEqual(await openReminders(id), 1);
  });

  it('a reminder added later to a closed application is not touched by the trigger', async () => {
    const id = await app('REJECTED');
    await reminder(id, 1);
    await q(`UPDATE applications SET job_title = 'renamed' WHERE id = $1`, [id]);   // no status change
    assert.strictEqual(await openReminders(id), 1);
  });

  it('migration 038 cleaned reminders already open on finished applications (re-run is a no-op)', async () => {
    const done = await app('REJECTED'); const open = await app('APPLIED');
    // simulate the pre-038 state: insert, then re-run the one-off update part
    await reminder(done, 5); await reminder(open, 5);
    await q(fs.readFileSync(MIGRATION_038, 'utf8'));
    assert.strictEqual(await openReminders(done), 0);
    assert.strictEqual(await openReminders(open), 1);
  });

  it('documents check counts any attached document and ignores email-detected applications', async () => {
    const withDoc = await app('APPLIED');
    await app('APPLIED');                                   // pasted, no document → counts against
    await app('APPLIED', { entry: 'email_detected' });       // applied elsewhere → not counted
    await app('DRAFT');                                     // not submitted → not counted
    await q(`INSERT INTO application_documents (application_id, document_type) VALUES ($1, 'CV')`, [withDoc]);
    const h = await svc.computeHealthScore();
    const docs = component(h, 'docs_attached');
    assert.strictEqual(docs.detail, '1/2 with a document');
    assert.strictEqual(docs.pts, 5);
  });

  it('weekly goal is proportional in the real score', async () => {
    for (let i = 0; i < 29; i++) await app('APPLIED', { entry: 'email_detected' });
    const g = component(await svc.computeHealthScore(), 'weekly_goal_met');
    assert.strictEqual(g.pts, 14);
    assert.strictEqual(g.ok, false);
    assert.strictEqual(g.detail, '29/30 this week');
  });

  it('dashboard returns real reminder counts, not the 5-row list length', async () => {
    const id = await app('APPLIED');
    for (let i = 0; i < 7; i++) await reminder(id, 40 + i);   // 7 very old
    for (let i = 0; i < 3; i++) await reminder(id, 2);        // 3 recent overdue
    const stats = await svc.getDashboardStats();
    assert.strictEqual(stats.due_reminders.length, 5);
    assert.deepStrictEqual(stats.reminder_counts, { due: 10, overdue: 10, overdue_30d: 7 });
    assert.strictEqual(component(stats.health_score, 'reminders_cleared').detail, '10 overdue');
  });

  // The hourly automation used to re-create a reminder (due immediately) a
  // few days after each one was marked done — the source of the pile-up.
  // automation_log is emptied between runs so only the new queries can stop it.
  const automation = () => { delete require.cache[require.resolve('../src/services/automationService')]; return require('../src/services/automationService'); };
  const count = (id, type) => q('SELECT count(*)::int n FROM application_reminders WHERE application_id=$1 AND reminder_type=$2', [id, type]).then(r => r[0].n);

  it('follow-up rule creates one follow-up per application, never again after it is done', async () => {
    const id = await app('APPLIED');                                  // applied 10 days ago
    await automation().runAllRules();
    assert.strictEqual(await count(id, 'follow_up'), 1);
    await q('UPDATE application_reminders SET is_done = TRUE WHERE application_id = $1', [id]);
    await q('TRUNCATE automation_log');
    await automation().runAllRules();
    assert.strictEqual(await count(id, 'follow_up'), 1, 'not re-created');
    const h = await svc.computeHealthScore();
    assert.strictEqual(component(h, 'no_stale_followups').ok, true, 'a done follow-up counts as followed up');
  });

  it('stale-review rule asks once, and again only after the application has changed', async () => {
    const id = await app('EMAIL_RECEIVED');
    await q('UPDATE applications SET updated_at = NOW() - INTERVAL \'20 days\' WHERE id = $1', [id]);
    await automation().runAllRules();
    assert.strictEqual(await count(id, 'review'), 1);
    await q('UPDATE application_reminders SET is_done = TRUE WHERE application_id = $1', [id]);
    await q('TRUNCATE automation_log');
    await automation().runAllRules();
    assert.strictEqual(await count(id, 'review'), 1, 'not re-asked while nothing changed');
    // the application changed after that review, then went stale again
    await q('UPDATE application_reminders SET created_at = NOW() - INTERVAL \'30 days\' WHERE application_id = $1', [id]);
    await q('TRUNCATE automation_log');
    await automation().runAllRules();
    assert.strictEqual(await count(id, 'review'), 2, 'new review after a newer update');
  });

  it('clear-overdue marks only reminders older than N days, and validates input', async () => {
    const id = await app('APPLIED');
    for (let i = 0; i < 4; i++) await reminder(id, 45);
    await reminder(id, 3);
    const call = body => fetch(`${base}/reminders/clear-overdue`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    assert.strictEqual((await call({ older_than_days: 0 })).status, 400);
    assert.strictEqual((await call({ older_than_days: 'x' })).status, 400);
    const unauth = await fetch(`${base}/reminders/clear-overdue`, { method: 'POST' });
    assert.strictEqual(unauth.status, 401);

    const r = await call({ older_than_days: 30 });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { cleared: 4, older_than_days: 30 });
    assert.strictEqual(await openReminders(id), 1, 'recent reminder kept');
    const again = await (await call({})).json();
    assert.strictEqual(again.cleared, 0, 'default 30 days, idempotent');
  });
});
