/**
 * Weekly streak + snapshots, availability pause ("Not open"), latest synced
 * blog post, theme settings. Needs TEST_DATABASE_URL (see outbox.test.js);
 * a throw-away database is built from db/schema.sql + migrations.
 */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const DB_URL = process.env.TEST_DATABASE_URL;

(DB_URL ? describe : describe.skip)('Streak, availability pause, blog latest, themes (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  const name = `streak_test_${process.pid}`;
  let admin, url, db, server, base, token;
  const q = (sql, p) => db.query(sql, p).then(r => r.rows);
  const api = (p, { method = 'GET', body, auth = true } = {}) => fetch(`${base}${p}`, {
    method, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  before(async () => {
    admin = new Client({ connectionString: DB_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
    const u = new URL(DB_URL); u.pathname = `/${name}`; url = u.toString();
    const loader = new Client({ connectionString: url }); await loader.connect();
    await loader.query(fs.readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));
    await loader.end();
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/migrate.js')], {
      env: { ...process.env, DATABASE_URL: url, MIGRATIONS_DIR: path.resolve(__dirname, '../../db/migrations') }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /041_streak_pause_blog_theme\.sql/);
    db = new Client({ connectionString: url }); await db.connect();

    Object.assign(process.env, { DATABASE_URL: url, JWT_SECRET: 'streak-test', NODE_ENV: 'test', MEDIUM_FEED_URL: 'https://medium.example.test/feed' });
    require('./support/freshSrc')();
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/profile', require('../src/routes/profile'));
    app.use('/api/user-settings', require('../src/routes/userSettings'));
    app.use('/api/dashboard', require('../src/routes/dashboard'));
    app.use('/api/blog', require('../src/routes/blog'));
    server = http.createServer(app).listen(0);
    base  = `http://127.0.0.1:${server.address().port}/api`;
    token = require('jsonwebtoken').sign({ id: 1, role: 'admin' }, 'streak-test');
  });

  after(async () => {
    server?.close();
    await require('../src/db/client').end().catch(() => {});
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
  });

  beforeEach(async () => {
    await q(`TRUNCATE applications, weekly_snapshots, availability_changes, blog_posts RESTART IDENTITY CASCADE`);
    if (!(await q('SELECT 1 FROM profile')).length) await q(`INSERT INTO profile (name, headline, bio, email) VALUES ('John', 'DevOps', 'bio', 'j@example.test')`);
    await q(`UPDATE profile SET availability_status = 'active', default_theme = 'dark'`);
    if (!(await q('SELECT 1 FROM user_settings')).length) await q('INSERT INTO user_settings DEFAULT VALUES');
    await q(`UPDATE user_settings SET weekly_application_goal = 3, admin_theme = 'dark'`);
    require('../src/services/availability').resetCache();
  });

  // n applications on Tuesday of the Paris week `weeksAgo` weeks back (0 = this week)
  const apply = (weeksAgo, n) => q(`
    INSERT INTO applications (company_name, job_title, status, created_at)
    SELECT 'Co' || g, 'Role', 'APPLIED',
           ((date_trunc('week', NOW() AT TIME ZONE 'Europe/Paris') - make_interval(weeks => $1) + INTERVAL '1 day 10 hours') AT TIME ZONE 'Europe/Paris')
    FROM generate_series(1, $2) g`, [weeksAgo, n]);
  const weekOf = weeksAgo => q(`SELECT to_char(date_trunc('week', NOW() AT TIME ZONE 'Europe/Paris') - make_interval(weeks => $1), 'YYYY-MM-DD') w`, [weeksAgo]).then(r => r[0].w);
  const streak = () => require('../src/services/dashboardService').computeStreak({ goal: 3 });

  // ── streak ───────────────────────────────────────────────────
  it('counts completed weeks that met the goal; last week met → 1 (the reported bug)', async () => {
    await apply(1, 4);           // last week 4/3 ✓
    await apply(2, 1);           // two weeks ago 1/3 ✗
    assert.deepStrictEqual(await streak(), { streak: 1, includes_current_week: false });
  });

  it('adds the week in progress once its goal is reached; stops at the first missed week', async () => {
    await apply(0, 3); await apply(1, 5); await apply(2, 3); await apply(4, 9);   // week 3 missed
    assert.deepStrictEqual(await streak(), { streak: 3, includes_current_week: true });
  });

  it('judges each past week by the goal recorded for it', async () => {
    await apply(1, 4); await apply(2, 4);
    await q(`INSERT INTO weekly_snapshots (week_start, applications_count, goal, goal_met) VALUES ($1, 4, 10, false)`, [await weekOf(2)]);
    assert.strictEqual((await streak()).streak, 1, 'two weeks ago had a goal of 10');
  });

  it('paused weeks (Not open) neither count nor break the streak', async () => {
    await apply(1, 3); await apply(3, 3);   // week 2 empty, but paused
    const w2 = await weekOf(2);
    await q(`INSERT INTO availability_changes (status, changed_at) VALUES
               ('active',   ($1::date - 30)::timestamp AT TIME ZONE 'Europe/Paris'),
               ('not_open', ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Paris'),
               ('active',   ($1::date + 5)::timestamp AT TIME ZONE 'Europe/Paris')`, [w2]);
    assert.strictEqual((await streak()).streak, 2);
  });

  it('weekly snapshot records the week that just ended (Paris), once, even with many pods', async () => {
    await apply(1, 4); await apply(0, 2);
    const { captureWeeklySnapshot } = require('../src/services/automationService');
    await Promise.all([captureWeeklySnapshot(), captureWeeklySnapshot(), captureWeeklySnapshot()]);
    const rows = await q(`SELECT to_char(week_start, 'YYYY-MM-DD') w, applications_count, goal, goal_met FROM weekly_snapshots`);
    assert.deepStrictEqual(rows, [{ w: await weekOf(1), applications_count: 4, goal: 3, goal_met: true }]);
  });

  it('dashboard API: streak + availability in /stats', async () => {
    await apply(1, 3);
    const s = await (await api('/dashboard/stats')).json();
    assert.strictEqual(s.goal.streak_weeks, 1);
    assert.deepStrictEqual(s.availability, { status: 'active', paused: false, since: null });
  });

  // ── availability pause ───────────────────────────────────────
  it('Not open is recorded, pauses rules / Outbox / weekly health checks; Open to right does not pause', async () => {
    const put = s => api('/profile/availability', { method: 'PUT', body: { status: s } });
    assert.strictEqual((await put('bogus')).status, 400);
    assert.strictEqual((await (await put('passive')).json()).paused, false);
    const r = await (await put('not_open')).json();
    assert.strictEqual(r.paused, true);
    assert(r.since, 'since is set');
    assert.deepStrictEqual((await q('SELECT status FROM availability_changes ORDER BY id')).map(x => x.status), ['passive', 'not_open']);
    await put('not_open');   // no duplicate row for the same status
    assert.strictEqual((await q('SELECT count(*)::int n FROM availability_changes'))[0].n, 2);

    const { runAllRules } = require('../src/services/automationService');
    assert.deepStrictEqual(await runAllRules(), { paused: true, total: 0 });

    const sent = [];
    const outbox = require('../src/services/outboxService').createOutbox({ sendMail: async m => { sent.push(m); return {}; } });
    assert.strictEqual((await outbox.tick()).paused, true);

    const hs = await require('../src/services/dashboardService').computeHealthScore();
    assert.strictEqual(hs.paused, true);
    for (const k of ['applied_this_week', 'pipeline_moved', 'weekly_goal_met']) {
      const c = hs.components.find(x => x.key === k);
      assert(c.ok && c.pts === c.max && /Paused/.test(c.detail), k);
    }
  });

  it('after a resume, the 7-day follow-up rule waits 7 days from the resume', async () => {
    await q(`INSERT INTO applications (company_name, job_title, status, applied_at) VALUES ('Old', 'Role', 'APPLIED', NOW() - INTERVAL '40 days')`);
    await q(`INSERT INTO availability_changes (status, changed_at) VALUES ('not_open', NOW() - INTERVAL '30 days'), ('active', NOW() - INTERVAL '2 days')`);
    const { runAllRules } = require('../src/services/automationService');
    await runAllRules();
    assert.strictEqual((await q(`SELECT count(*)::int n FROM application_reminders WHERE reminder_type = 'follow_up'`))[0].n, 0);
    await q(`UPDATE availability_changes SET changed_at = NOW() - INTERVAL '8 days' WHERE status = 'active'`);
    await runAllRules();
    assert.strictEqual((await q(`SELECT count(*)::int n FROM application_reminders WHERE reminder_type = 'follow_up'`))[0].n, 1);
  });

  // ── blog ─────────────────────────────────────────────────────
  it('a re-sync keeps when each post was first synced; the public list exposes it', async () => {
    const Parser = require('rss-parser');
    const orig = Parser.prototype.parseURL;
    let items = [{ guid: 'a', link: 'https://medium.com/a', title: 'Old post', isoDate: '2026-07-01T00:00:00Z' }];
    Parser.prototype.parseURL = async () => ({ items });
    try {
      const { syncBlogFromMedium } = require('../src/services/blogIngestService');
      await syncBlogFromMedium();
      await q(`UPDATE blog_posts SET first_ingested_at = NOW() - INTERVAL '10 days'`);
      items = [...items, { guid: 'b', link: 'https://medium.com/b', title: 'New post', isoDate: '2026-11-20T00:00:00Z' }];
      await syncBlogFromMedium();
      const rows = await q(`SELECT title, first_ingested_at > NOW() - INTERVAL '1 minute' AS just_now FROM blog_posts ORDER BY title`);
      assert.deepStrictEqual(rows, [{ title: 'New post', just_now: true }, { title: 'Old post', just_now: false }]);
      const pub = await (await api('/blog', { auth: false })).json();
      assert(pub.every(p => 'first_ingested_at' in p));
    } finally { Parser.prototype.parseURL = orig; }
  });

  // ── themes ───────────────────────────────────────────────────
  it('site default theme: public read, admin-only write, validated; admin theme saved per account', async () => {
    assert.deepStrictEqual(await (await api('/profile/site-settings', { auth: false })).json(), { default_theme: 'dark' });
    assert.strictEqual((await api('/profile/default-theme', { method: 'PUT', body: { theme: 'light' }, auth: false })).status, 401);
    assert.strictEqual((await api('/profile/default-theme', { method: 'PUT', body: { theme: 'blue' } })).status, 400);
    assert.strictEqual((await (await api('/profile/default-theme', { method: 'PUT', body: { theme: 'light' } })).json()).default_theme, 'light');
    assert.deepStrictEqual(await (await api('/profile/site-settings', { auth: false })).json(), { default_theme: 'light' });
    assert.strictEqual((await (await api('/profile', { auth: false })).json()).default_theme, 'light');
    assert.strictEqual((await (await api('/user-settings', { method: 'PATCH', body: { admin_theme: 'light' } })).json()).admin_theme, 'light');
    assert.strictEqual((await api('/user-settings', { method: 'PATCH', body: { admin_theme: 'neon' } })).status, 400);
  });
});
