/**
 * CV requests: the CV is emailed (never downloaded publicly), you are told
 * who got it, limits hold, privacy retention works, dashboard stats add up.
 * Needs TEST_DATABASE_URL (see outbox.test.js). Mail, PDF and geo-IP are fakes.
 */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const DB_URL = process.env.TEST_DATABASE_URL;

(DB_URL ? describe : describe.skip)('CV requests (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  const name = `cvreq_test_${process.pid}`;
  let admin, url, db, server, base, token;
  const q = (sql, p) => db.query(sql, p).then(r => r.rows);

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
    assert.match(r.stdout, /042_cv_requests\.sql/);
    db = new Client({ connectionString: url }); await db.connect();
    Object.assign(process.env, { DATABASE_URL: url, JWT_SECRET: 'cvreq-test', NODE_ENV: 'test', NOTIFY_EMAIL_USER: 'connect@example.test' });
    require('./support/freshSrc')();
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/profile', require('../src/routes/profile'));
    app.use('/api/cv-requests', require('../src/routes/cvRequests'));
    server = http.createServer(app).listen(0);
    base  = `http://127.0.0.1:${server.address().port}/api`;
    token = require('jsonwebtoken').sign({ id: 1, role: 'admin' }, 'cvreq-test');
  });

  after(async () => {
    server?.close();
    await require('../src/db/client').end().catch(() => {});
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
  });

  beforeEach(async () => {
    await q('TRUNCATE cv_requests, applications, application_contacts RESTART IDENTITY CASCADE');
    if (!(await q('SELECT 1 FROM profile')).length) await q(`INSERT INTO profile (name, headline, bio, email) VALUES ('John Isah', 'DevOps', 'bio', 'j@example.test')`);
    await q(`UPDATE profile SET cv_display_name = 'John Itopa ISAH'`);
  });

  function harness({ failSend = false, now } = {}) {
    const st = { sent: [], notified: [], pdfLang: [] };
    const cv = require('../src/services/cvRequestService').createCvRequests({
      ...(now ? { now: () => now } : {}),
      getCvPdf: async lang => { st.pdfLang.push(lang); return { buffer: Buffer.from(`%PDF-${lang}`), mime: 'application/pdf' }; },
      geoip: async () => ({ country: 'Luxembourg', region: 'Luxembourg', city: 'Luxembourg' }),
      sendMail: async m => { if (failSend) throw new Error('SMTP down'); st.sent.push(m); return { messageId: '<m1@x>' }; },
      notifyOwner: async m => { st.notified.push(m); },
    });
    return { cv, st };
  }
  const ctx = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36', countryCode: 'LU', referrer: 'https://www.linkedin.com/' };
  const body = extra => ({ email: 'Jane.Doe@Acme.lu', language: 'fr', consent: true, source: 'hero', ...extra });

  it('emails the CV in the chosen language, records the request, notifies you', async () => {
    const { cv, st } = harness();
    const r = await cv.request(body({ name: 'Jane', company: 'Acme', role: 'recruiter' }), ctx);
    assert.deepStrictEqual(r, { status: 'sent', email: 'jane.doe@acme.lu', language: 'fr' });
    assert.deepStrictEqual(st.pdfLang, ['fr']);
    assert.strictEqual(st.sent[0].to, 'jane.doe@acme.lu');
    assert.match(st.sent[0].attachments[0].filename, /John_Itopa_ISAH_CV_FR\.pdf/);
    assert.match(st.sent[0].text, /^Bonjour Jane,/);
    await new Promise(r => setTimeout(r, 20));
    assert.match(st.notified[0].subject, /Jane \(Acme\).*French/);
    assert.strictEqual(st.notified[0].replyTo, 'jane.doe@acme.lu');
    const [row] = await q('SELECT email, name, company, requester_role, language, country, country_code, device, browser, referrer, source, ip_hash FROM cv_requests');
    assert.strictEqual(row.country, 'Luxembourg'); assert.strictEqual(row.country_code, 'LU');
    assert.strictEqual(row.device, 'desktop'); assert.strictEqual(row.source, 'hero');
    assert(row.ip_hash && !row.ip_hash.includes('203.0.113.7'), 'IP is only stored hashed');
  });

  it('only the email is required; validation, honeypot, disposable domains, consent', async () => {
    const { cv, st } = harness();
    assert.strictEqual((await cv.request({ email: 'a@b.co', language: 'en', consent: true }, ctx)).status, 'sent');
    for (const [b, re] of [
      [{ email: 'nope', language: 'en', consent: true }, /valid email/],
      [{ email: 'x@mailinator.com', language: 'en', consent: true }, /permanent/],
      [{ email: 'x@acme.com', language: 'de', consent: true }, /English or French/],
      [{ email: 'x@acme.com', language: 'en' }, /accept/],
      [{ email: 'x@acme.com', language: 'en', consent: true, website: 'http://spam' }, /Invalid/],
    ]) await assert.rejects(cv.request(b, { ...ctx, ip: '198.51.100.9' }), re);
    assert.strictEqual(st.sent.length, 1);
  });

  it('same email + language within 24h is not re-sent; 3 per hour per visitor; daily cap', async () => {
    const { cv, st } = harness();
    await cv.request(body(), ctx);
    assert.strictEqual((await cv.request(body(), ctx)).status, 'already_sent');
    assert.strictEqual((await cv.request(body({ language: 'en' }), ctx)).status, 'sent', 'other language is fine');
    await cv.request(body({ email: 'b@acme.lu' }), ctx);
    await assert.rejects(cv.request(body({ email: 'c@acme.lu' }), ctx), e => e.status === 429);
    await q(`INSERT INTO cv_requests (email, language, status, consent_at) SELECT 'z' || g || '@acme.lu', 'en', 'sent', NOW() FROM generate_series(1, 30) g`);
    await assert.rejects(cv.request(body({ email: 'late@acme.lu' }), { ...ctx, ip: '192.0.2.1' }), /tomorrow/);
    assert.strictEqual(st.sent.length, 3);
  });

  it('a failed send is recorded and reported, and you are not notified', async () => {
    const { cv, st } = harness({ failSend: true });
    await assert.rejects(cv.request(body(), ctx), e => e.status === 502);
    assert.deepStrictEqual((await q('SELECT status, error FROM cv_requests'))[0], { status: 'failed', error: 'SMTP down' });
    assert.strictEqual(st.notified.length, 0);
  });

  it('flags people from companies in your pipeline', async () => {
    const [app] = await q(`INSERT INTO applications (company_name, job_title, status) VALUES ('Acme', 'DevOps', 'APPLIED') RETURNING id`);
    await q(`INSERT INTO application_contacts (application_id, name, email) VALUES ($1, 'Rita', 'rita@acme.lu')`, [app.id]);
    const { cv, st } = harness();
    await cv.request(body(), ctx);
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual((await q('SELECT matched_application_id FROM cv_requests'))[0].matched_application_id, app.id);
    assert.match(st.notified[0].html, /In your pipeline: Acme/);
  });

  it('privacy: optional details cleared after 90 days, email after 12 months; delete on request', async () => {
    const { cv } = harness();
    await q(`INSERT INTO cv_requests (email, name, company, requester_role, language, status, consent_at, country, city, created_at) VALUES
      ('old@acme.lu', 'Old', 'Acme', 'recruiter', 'en', 'sent', NOW(), 'France', 'Paris', NOW() - INTERVAL '400 days'),
      ('mid@acme.lu', 'Mid', 'Acme', 'other',     'fr', 'sent', NOW(), 'France', 'Lyon',  NOW() - INTERVAL '100 days'),
      ('new@acme.lu', 'New', 'Acme', 'other',     'en', 'sent', NOW(), 'France', 'Nice',  NOW())`);
    assert.deepStrictEqual(await cv.retention(), { cleared: 2, anonymised: 1 });
    const rows = await q('SELECT email, name, company, country, city FROM cv_requests ORDER BY id');
    assert.deepStrictEqual(rows, [
      { email: null, name: null, company: null, country: 'France', city: null },
      { email: 'mid@acme.lu', name: null, company: null, country: 'France', city: 'Lyon' },
      { email: 'new@acme.lu', name: 'New', company: 'Acme', country: 'France', city: 'Nice' },
    ]);
    await q(`INSERT INTO cv_requests (email, language, status, consent_at) VALUES ('new@acme.lu', 'fr', 'sent', NOW())`);
    assert.deepStrictEqual(await cv.remove((await q(`SELECT id FROM cv_requests WHERE email = 'new@acme.lu' LIMIT 1`))[0].id), { deleted: 2 });
  });

  it('dashboard stats add up', async () => {
    const { cv } = harness();
    await cv.request(body({ role: 'recruiter' }), ctx);
    await cv.request(body({ email: 'b@beta.fr', language: 'en' }), { ...ctx, ip: '192.0.2.9', countryCode: 'FR' });
    await q(`INSERT INTO cv_requests (email, language, status, consent_at, error) VALUES ('f@x.io', 'en', 'failed', NOW(), 'x')`);
    const s = await cv.stats({ range: '30d' });
    assert.deepStrictEqual({ sent: s.totals.sent, failed: s.totals.failed, people: s.totals.unique_people, en: s.totals.en, fr: s.totals.fr },
      { sent: 2, failed: 1, people: 2, en: 1, fr: 1 });
    assert.strictEqual(s.daily.length, 30);
    assert.strictEqual(s.daily.at(-1).en + s.daily.at(-1).fr, 2);
    assert.deepStrictEqual(s.roles.map(r => [r.label, r.n]).sort(), [['Unknown', 1], ['recruiter', 1]]);
  });

  it('HTTP: the public download is closed; admin download + dashboard need login', async () => {
    assert.strictEqual((await fetch(`${base}/profile/resume?lang=en`)).status, 401);
    assert.strictEqual((await fetch(`${base}/cv-requests/stats`)).status, 401);
    const bad = await fetch(`${base}/cv-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x', language: 'en', consent: true }) });
    assert.strictEqual(bad.status, 400);
    assert.match((await bad.json()).error, /valid email/);
    const s = await fetch(`${base}/cv-requests/stats?range=7d`, { headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(s.status, 200);
    assert.strictEqual((await s.json()).daily.length, 7);
  });
});
