/**
 * Privacy (Nov 2026 review): visits store no IP / coordinates / cookie id,
 * location comes from Cloudflare headers, referee contact details are never
 * public, and every retention limit published on /privacy is enforced.
 * Needs TEST_DATABASE_URL (see outbox.test.js).
 */
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const DB_URL = process.env.TEST_DATABASE_URL;

(DB_URL ? describe : describe.skip)('Privacy: minimisation and retention (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  const name = `privacy_test_${process.pid}`;
  let admin, url, db, server, base;
  const q = (sql, p) => db.query(sql, p).then(r => r.rows);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  before(async () => {
    admin = new Client({ connectionString: DB_URL }); await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
    const u = new URL(DB_URL); u.pathname = `/${name}`; url = u.toString();
    const loader = new Client({ connectionString: url }); await loader.connect();
    await loader.query(fs.readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));
    // a pre-existing visit with an IP and coordinates, as production had
    await loader.query(`INSERT INTO visitor_logs (ip_address, latitude, longitude, country, session_id) VALUES ('203.0.113.9', 48.85, 2.35, 'France', 'old-cookie')`);
    await loader.query(`INSERT INTO referees (name, title, organization, relationship, email, phone, available_on_request, visible)
                        VALUES ('Ref One', 'CTO', 'Acme', 'Manager', 'ref@acme.example', '+33 6 00 00 00 00', FALSE, TRUE)`);
    await loader.end();
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/migrate.js')], {
      env: { ...process.env, DATABASE_URL: url, MIGRATIONS_DIR: path.resolve(__dirname, '../../db/migrations') }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /043_privacy_minimisation\.sql/);
    db = new Client({ connectionString: url }); await db.connect();
    Object.assign(process.env, { DATABASE_URL: url, JWT_SECRET: 'privacy-test', NODE_ENV: 'test' });
    require('./support/freshSrc')();
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/visitors', require('../src/routes/visitors'));
    app.use('/api/referees', require('../src/routes/referees'));
    app.use('/api/blog', require('../src/routes/blog'));
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    server?.close();
    await require('../src/db/client').end().catch(() => {});
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
  });

  it('migration 043 removed IPs and coordinates from existing visits and made referees private', async () => {
    const [v] = await q(`SELECT ip_address, latitude, longitude, country FROM visitor_logs WHERE session_id = 'old-cookie'`);
    assert.deepStrictEqual(v, { ip_address: null, latitude: null, longitude: null, country: 'France' });
    assert.strictEqual((await q('SELECT available_on_request FROM referees'))[0].available_on_request, true);
  });

  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const visit = (ip, extra = {}) => fetch(`${base}/visitors`, { method: 'POST', headers: {
    'user-agent': ua, 'cf-connecting-ip': ip, 'cf-ipcountry': 'LU', 'cf-region': 'Luxembourg', 'cf-ipcity': 'Esch-sur-Alzette',
    'x-referer': 'https://www.linkedin.com/feed/?trk=private-param&email=me@x.com', ...extra } });

  it('a visit stores no IP, no coordinates, no cookie id — location from Cloudflare, site name only', async () => {
    await q('DELETE FROM visitor_logs');
    await visit('198.51.100.7'); await visit('198.51.100.7'); await visit('198.51.100.8');
    await wait(300);
    const rows = await q('SELECT ip_address, latitude, session_id, visitor_hash, country, country_code, region, city, referer_raw, referer_label FROM visitor_logs ORDER BY id');
    assert.strictEqual(rows.length, 3);
    for (const r of rows) {
      assert.strictEqual(r.ip_address, null); assert.strictEqual(r.latitude, null); assert.strictEqual(r.session_id, null);
      assert.deepStrictEqual([r.country, r.country_code, r.region, r.city], ['Luxembourg', 'LU', 'Luxembourg', 'Esch-sur-Alzette']);
      assert.strictEqual(r.referer_raw, 'https://www.linkedin.com');
      assert(!JSON.stringify(r).includes('198.51.100'), 'IP never stored');
    }
    assert.strictEqual(new Set(rows.map(r => r.visitor_hash)).size, 2, 'same visitor today = same code');
  });

  it('blog click is linked to the visit it came from without a cookie', async () => {
    const [post] = await q(`INSERT INTO blog_posts (medium_guid, title, medium_url, visible_on_site) VALUES ('g1', 'Post', 'https://medium.com/p', TRUE) RETURNING id`);
    await fetch(`${base}/blog/${post.id}/go?from=home`, { redirect: 'manual', headers: { 'user-agent': ua, 'cf-connecting-ip': '198.51.100.7', 'cf-ipcountry': 'LU' } });
    await wait(300);
    const [c] = await q('SELECT traffic_source, country, visitor_hash FROM blog_clicks');
    assert.strictEqual(c.traffic_source, 'LinkedIn');
    assert.strictEqual(c.country, 'Luxembourg');
  });

  it('blog cover images are served from this site, never hot-linked; only Medium images are fetched', async () => {
    const [ok]  = await q(`INSERT INTO blog_posts (medium_guid, title, medium_url, visible_on_site, cover_image_url, cover_image, cover_image_mime)
                           VALUES ('g2', 'With cover', 'https://medium.com/p2', TRUE, 'https://cdn-images-1.medium.com/x.png', '\\x89504e47', 'image/png') RETURNING id`);
    const [bad] = await q(`INSERT INTO blog_posts (medium_guid, title, medium_url, visible_on_site, cover_image_url)
                           VALUES ('g3', 'Evil cover', 'https://medium.com/p3', TRUE, 'http://169.254.169.254/latest/meta-data') RETURNING id`);
    await require('../src/services/contentCache').invalidate('blog:public');
    const list = await (await fetch(`${base}/blog`)).json();
    assert.strictEqual(list.find(p => p.id === ok.id).cover_image_url, `/api/blog/${ok.id}/cover`);
    assert(!JSON.stringify(list).includes('medium.com/x.png'), 'no Medium CDN URL reaches the browser');
    const img = await fetch(`${base}/blog/${ok.id}/cover`);
    assert.strictEqual(img.status, 200); assert.strictEqual(img.headers.get('content-type'), 'image/png');
    assert.strictEqual((await fetch(`${base}/blog/${bad.id}/cover`)).status, 404, 'non-Medium URL is never fetched');
  });

  it('referee email and phone are never in the public API, whatever is stored', async () => {
    await q('UPDATE referees SET available_on_request = FALSE');                    // even if forced in the DB
    await require('../src/services/contentCache').invalidate('referees:public');
    const res = await (await fetch(`${base}/referees`)).json();
    const r = res.find(x => x.name === 'Ref One');
    assert.strictEqual(r.email, null); assert.strictEqual(r.phone, null);
    assert(!JSON.stringify(res).includes('ref@acme.example'));
  });

  it('retention enforces every limit published on /privacy', async () => {
    const [app] = await q(`INSERT INTO applications (company_name, job_title, status, updated_at) VALUES ('OldCo', 'Dev', 'REJECTED', NOW() - INTERVAL '13 months') RETURNING id`);
    const [live] = await q(`INSERT INTO applications (company_name, job_title, status) VALUES ('LiveCo', 'Dev', 'APPLIED') RETURNING id`);
    await q(`UPDATE applications SET updated_at = NOW() - INTERVAL '13 months' WHERE id = $1`, [app.id]);
    await db.query(`
      INSERT INTO visitor_logs (country, referer_label, device_type, visited_at) SELECT 'France', 'Google', 'desktop', NOW() - INTERVAL '14 months' FROM generate_series(1, 7);
      INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES ('Old', 'o@x.io', 's', 'm', NOW() - INTERVAL '13 months'), ('New', 'n@x.io', 's', 'm', NOW());
      INSERT INTO auth_attempts (username, result, ip_address, attempted_at) VALUES ('admin', 'failure', '192.0.2.1', NOW() - INTERVAL '100 days'), ('admin', 'success', '192.0.2.2', NOW());`);
    await q(`INSERT INTO email_responses (source_account, gmail_message_id, application_id, sender_email, sender_name, subject, body_snippet, received_at)
             VALUES ('imap', 'a', $1, 'hr@oldco.example', 'HR', 'Your application', 'Dear John', NOW() - INTERVAL '14 months'),
                    ('imap', 'b', $2, 'hr@liveco.example', 'HR', 'Hello', 'Hi', NOW() - INTERVAL '14 months'),
                    ('imap', 'c', NULL, 'spam@x.example', 'X', 'Unlinked', 'x', NOW() - INTERVAL '13 months')`, [app.id, live.id]);
    await q(`INSERT INTO application_contacts (application_id, name, email) VALUES ($1, 'Old HR', 'hr@oldco.example'), ($2, 'Live HR', 'hr@liveco.example')`, [app.id, live.id]);
    const [ref] = await q('SELECT id FROM referees LIMIT 1');
    await q(`INSERT INTO referee_contact_requests (referee_id, requester_name, requester_email, requester_purpose, status, created_at, declined_at)
             VALUES ($1, 'Old Req', 'old@req.example', 'recruiting', 'declined', NOW() - INTERVAL '14 months', NOW() - INTERVAL '13 months'),
                    ($1, 'Open Req', 'open@req.example', 'recruiting', 'consent_requested', NOW() - INTERVAL '14 months', NULL)`, [ref.id]);
    const before = (await q(`SELECT COUNT(*)::int n FROM visitor_logs WHERE NOT is_bot`))[0].n;

    const out = await require('../src/services/privacyRetention').runPrivacyRetention();
    assert.strictEqual(out.visits_folded, 7);
    assert.deepStrictEqual(await q(`SELECT country, referer, visits FROM visitor_daily`), [{ country: 'France', referer: 'Google', visits: 7 }]);
    const after = (await q(`SELECT (SELECT COUNT(*) FROM visitor_logs WHERE NOT is_bot) + (SELECT COALESCE(SUM(visits),0) FROM visitor_daily) AS n`))[0].n;
    assert.strictEqual(Number(after), before, 'all-time visit count unchanged');
    assert.deepStrictEqual((await q('SELECT name FROM contact_messages')).map(r => r.name), ['New']);
    assert.deepStrictEqual((await q('SELECT result FROM auth_attempts')).map(r => r.result), ['success']);
    assert.deepStrictEqual((await q('SELECT requester_name FROM referee_contact_requests')).map(r => r.requester_name), ['Open Req'], 'open requests kept');
    const emails = await q('SELECT gmail_message_id, sender_email, body_snippet FROM email_responses ORDER BY gmail_message_id');
    assert.deepStrictEqual(emails, [
      { gmail_message_id: 'a', sender_email: null, body_snippet: null },                         // closed > 12 months: anonymised
      { gmail_message_id: 'b', sender_email: 'hr@liveco.example', body_snippet: 'Hi' },          // live application: kept
    ]);                                                                                           // unlinked old: deleted
    assert.deepStrictEqual((await q('SELECT name FROM application_contacts')).map(r => r.name), ['Live HR']);
    assert.deepStrictEqual(Object.values(await require('../src/services/privacyRetention').runPrivacyRetention()).filter(Boolean), [], 'idempotent');
  });
});
