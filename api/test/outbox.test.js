/**
 * Outbox (approve-before-send recruiter emails), digest schedule, notification
 * preferences, application context (CV / job description) and interview prep.
 *
 * Unit tests always run. Database tests need TEST_DATABASE_URL (a user that
 * may CREATE DATABASE): a throw-away database is built from db/schema.sql and
 * pending migrations are applied with the real runner. Mail and AI are fakes —
 * nothing is ever sent.
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { spawnSync } = require('child_process');

const outboxSvc = require('../src/services/outboxService');

// ── Unit ────────────────────────────────────────────────────────
describe('Outbox send window (Mon–Fri 09:00–18:00 Europe/Paris)', () => {
  const paris = d => d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const cases = [
    ['2026-11-19T09:00:00Z', 'Thu 10:00'],   // inside → unchanged
    ['2026-11-19T18:30:00Z', 'Fri 09:00'],   // evening → next morning
    ['2026-11-20T17:05:00Z', 'Mon 09:00'],   // Friday after 18:00 → Monday
    ['2026-11-21T10:00:00Z', 'Mon 09:00'],   // Saturday
    ['2026-11-23T06:00:00Z', 'Mon 09:00'],   // Monday before 09:00
    ['2027-03-27T12:00:00Z', 'Mon 09:00'],   // weekend across the DST change
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => assert.strictEqual(paris(outboxSvc.nextSendTime(new Date(input))), expected));
  }
});

describe('Outbox recipient filter', () => {
  const ok = ['recruitment@murena.com', 'talent.acquisition@siemens.com', 'Jane.Doe@acme.fr'];
  const no = ['no-reply@ashbyhq.com', 'jobs-noreply@linkedin.com', 'noreply@company.com', 'notifications@hellowork.com',
    'x@candidates.welcomekit.co', 'someone@greenhouse.io', 'do-not-reply@acme.com', 'bad@', '', null,
    // seen in production drafts (Nov 2026)
    'system@successfactors.eu', 'ing@myworkday.com', 'alerts@acme.com'];
  for (const a of ok) it(`sends to ${a}`, () => assert(outboxSvc.isSendableAddress(a)));
  for (const a of no) it(`refuses ${a}`, () => assert(!outboxSvc.isSendableAddress(a)));
  it('refuses your own addresses (a forwarded email shows you as the sender)', () => {
    const keep = { ...process.env };
    Object.assign(process.env, { NOTIFY_EMAIL_USER: 'connect@johnisah.test', NOTIFY_EMAIL_TO: 'me.personal@gmail.test' });
    try {
      assert(!outboxSvc.isSendableAddress('Me.Personal@gmail.test'));
      assert(!outboxSvc.isSendableAddress('anything@johnisah.test'));
      assert(outboxSvc.isSendableAddress('recruiter@acme.com'));
      assert(outboxSvc.isSendableAddress('systems.team@acme.com'), 'only whole words like system@ are automated');
    } finally { process.env = keep; }
  });
});

describe('Greeting name', () => {
  const cases = [['3DS Talent Acquisition', '3DS (Dassault Systèmes)', ''], ['Jane Doe', 'Acme', 'Jane'], ['Recrutement Acme', 'Acme', ''],
    ['HR Team', 'X', ''], ['Siemens', 'Siemens', ''], ['élodie martin', 'Y', 'Élodie'], ['jobs@x.com', 'X', ''], [null, 'X', '']];
  for (const [name, company, want] of cases) {
    it(`${JSON.stringify(name)} → ${JSON.stringify(want)}`, () => assert.strictEqual(outboxSvc.greetingName(name, company), want));
  }
});

describe('Approval email', () => {
  it('escapes everything it shows', () => {
    const { html } = outboxSvc.approvalEmail([{ e: { id: 1, to_email: 'a@b.com', subject: '<script>x</script>', body: '<img src=x onerror=alert(1)>' },
      app: { company_name: 'A&B', job_title: 'Dev' }, link: 'https://api.example/x' }]);
    assert(!html.includes('<script>') && !html.includes('<img'));
    assert(html.includes('&lt;script&gt;') && html.includes('A&amp;B'));
  });
});

// ── Database ────────────────────────────────────────────────────
const DB_URL = process.env.TEST_DATABASE_URL;

(DB_URL ? describe : describe.skip)('Outbox, digests, preferences, context, interview prep (Postgres)', function () {
  this.timeout(60000);
  const { Client } = require('pg');
  const name = `outbox_test_${process.pid}`;
  let admin, url, db, server, base, token, aiStub, aiCalls = [];

  const q = (sql, p) => db.query(sql, p).then(r => r.rows);
  const api = (p, { method = 'GET', body, auth = true, form = false } = {}) => fetch(`${base}${p}`, {
    method, redirect: 'manual',
    headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'content-type': 'application/json' } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
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
    assert.match(r.stdout, /039_outbox_context_notification_prefs\.sql/);
    db = new Client({ connectionString: url }); await db.connect();

    // Stub Anthropic API: answers by tool name.
    aiStub = http.createServer((req, res) => {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        const j = JSON.parse(b); aiCalls.push(j);
        const tool = j.tool_choice?.name;
        const french = /in French/.test(j.system || '');
        const input = tool === 'submit_email' ? { body: french
              ? 'Bonjour,\n\nJe reviens vers vous au sujet du poste de DevOps Engineer chez Acme — mon expérience Kubernetes correspond à vos besoins.\n\nBien cordialement,\nJohn'
              : 'Hi Jane,\n\nFollowing up on the DevOps Engineer role at Acme — I would love to discuss how my Kubernetes work fits.\n\nBest regards,\nJohn' }
          : tool === 'submit_translation' ? (JSON.parse(j.messages[0].content).target_language === 'French'
              ? { body: 'Madame, Monsieur,\n\nJe reviens vers vous au sujet de ma candidature. Merci pour votre temps.\n\nBien cordialement,\nJohn', subject: 'Suivi de ma candidature' }
              : { body: 'Dear Hiring Team,\n\nI am following up on my application. Thank you for your time.\n\nBest regards,\nJohn', subject: 'Following up on my application' })
          : tool === 'submit_prep_checklist' ? { prep_checklist: ['Review Acme platform', 'review acme platform', 'Prepare a K8s incident story'] }
          : { technical_questions: [{ question: 'K8s?', difficulty: 'Hard', hint: 'Talk about HPA' }], behavioral_questions: [],
              situational_questions: [], company_questions: ['Team size?'], prep_checklist: ['Research Acme', 'Revise Terraform'] };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'stub', stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 't', name: tool, input }] }));
      });
    }).listen(0);

    Object.assign(process.env, {
      DATABASE_URL: url, JWT_SECRET: 'outbox-test', NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'stub', ANTHROPIC_BASE_URL: `http://127.0.0.1:${aiStub.address().port}`,
      API_PUBLIC_URL: 'https://api.example.test', ADMIN_URL: 'https://admin.example.test',
      NOTIFY_EMAIL_USER: 'connect@example.test',
    });
    require('./support/freshSrc')();

    const express = require('express');
    const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
    app.use('/api/outbox', require('../src/routes/outbox'));
    app.use('/api/applications', require('../src/routes/applicationContext'));
    app.use('/api/interview-prep', require('../src/routes/interviewPrep'));
    app.use('/api/user-settings', require('../src/routes/userSettings'));
    server = http.createServer(app).listen(0);
    base  = `http://127.0.0.1:${server.address().port}/api`;
    token = require('jsonwebtoken').sign({ id: 1, role: 'admin' }, 'outbox-test');
  });

  after(async () => {
    server?.close(); aiStub?.close();
    await require('../src/db/client').end().catch(() => {});
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
  });

  beforeEach(async () => {
    aiCalls = [];
    await q(`TRUNCATE applications, application_contacts, email_responses, outbound_emails, outbound_email_events,
             application_communications, application_events, application_reminders, application_documents,
             interview_questions, notification_log RESTART IDENTITY CASCADE`);
    await q(`UPDATE user_settings SET preferred_reminder_channel = 'email', digest_schedule = 'daily'`);
    if (!(await q('SELECT 1 FROM profile')).length) await q(`INSERT INTO profile (name, headline, bio, email, cv_display_name) VALUES ('John Isah','DevOps','bio','j@example.test','John Itopa Isah')`);
  });

  // fixtures
  const mkApp = async (status = 'APPLIED', daysAgo = 10) => (await q(
    `INSERT INTO applications (company_name, job_title, status, applied_at) VALUES ('Acme', 'DevOps Engineer', $1, NOW() - make_interval(days => $2)) RETURNING id`,
    [status, daysAgo]))[0].id;
  const inbound = (appId, sender, { daysAgo = 8, mid = `m${Math.random()}@acme.com` } = {}) => q(
    `INSERT INTO email_responses (source_account, gmail_message_id, message_id, application_id, sender_email, sender_name, subject, received_at, thread_id)
     VALUES ('imap', $1, $2, $3, $4, 'Jane Doe', 'Your application — DevOps Engineer', NOW() - $5::float8 * interval '1 day', $6) RETURNING id`,
    [`mid:${mid}`, mid, appId, sender, daysAgo, `<root-${mid}>`]);

  // Clock + mail fakes
  const workday = new Date('2026-11-19T10:00:00Z');   // Thursday 11:00 Paris
  function harness({ at = workday, failSend = 0, translate } = {}) {
    const state = { now: at, sent: [], appended: [], notified: [], failSend };
    const outbox = require('../src/services/outboxService').createOutbox({
      now: () => state.now,
      ...(translate ? { translate } : {}),
      sendMail: async mail => { if (state.failSend-- > 0) throw new Error('SMTP 451 try later'); state.sent.push(mail); return { messageId: mail.messageId, raw: Buffer.from('raw') }; },
      appendToSent: async raw => state.appended.push(raw),
      notifyUser: async m => state.notified.push(m),
    });
    return { outbox, state };
  }
  const events = async id => (await q('SELECT event FROM outbound_email_events WHERE outbound_email_id = $1 ORDER BY id', [id])).map(e => e.event);

  it('no follow-up draft when nobody reachable; one draft (AI-polished, threaded reply) when the recruiter emailed', async () => {
    const { outbox } = harness();
    const app = await mkApp();
    await inbound(app, 'no-reply@ashbyhq.com');
    assert.strictEqual(await outbox.createFollowUpDraft(app), null, 'ATS no-reply is not a recipient');
    await inbound(app, 'jane.doe@acme.com', { mid: 'orig-1@acme.com' });
    const d = await outbox.createFollowUpDraft(app);
    assert.strictEqual(d.status, 'pending_approval');
    assert.strictEqual(d.to_email, 'jane.doe@acme.com');
    assert.strictEqual(d.in_reply_to, '<orig-1@acme.com>');
    assert.match(d.subject, /^Re: Your application/);
    assert(d.ai_polished && /Kubernetes/.test(d.body));
    assert.strictEqual(await outbox.createFollowUpDraft(app), null, 'only one open follow-up per application');
  });

  it('threads replies to emails stored before message ids were kept (thread_id holds the Message-ID)', async () => {
    const { outbox } = harness();
    const app = await mkApp();
    await q(`INSERT INTO email_responses (source_account, gmail_message_id, application_id, sender_email, sender_name, subject, received_at, thread_id)
             VALUES ('imap', 'imap_1', $1, 'ta@acme.com', 'Acme Talent Acquisition', 'Your application', NOW() - interval '8 days', '<legacy-1@mail.acme.com>')`, [app]);
    const d = await outbox.createFollowUpDraft(app);
    assert.strictEqual(d.in_reply_to, '<legacy-1@mail.acme.com>');
    assert.strictEqual(d.references_header, '<legacy-1@mail.acme.com>');
    assert.match(d.body, /^Hi Jane|Hiring Team|Hello/m, 'never greets the company as a person');
    assert(!/Hi Acme/.test(d.body));
  });

  it('open drafts to a now-blocked recipient (ATS / your own address) are cancelled by the ticker', async () => {
    const { outbox } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await q(`UPDATE outbound_emails SET to_email = 'ing@myworkday.com' WHERE id = $1`, [d.id]);   // drafted before the filter knew it
    await outbox.tick();
    const [row] = await q('SELECT status, cancel_reason FROM outbound_emails WHERE id = $1', [d.id]);
    assert.deepStrictEqual(row, { status: 'cancelled', cancel_reason: 'Recipient is an automated or job-platform address' });
  });

  it('contacts with an email win over inbound senders', async () => {
    const { outbox } = harness();
    const app = await mkApp();
    await inbound(app, 'someone@acme.com');
    await q(`INSERT INTO application_contacts (application_id, name, email, role) VALUES ($1, 'Rita Recruiter', 'rita@acme.com', 'recruiter')`, [app]);
    const d = await outbox.createManualDraft(app, { polish: false });
    assert.strictEqual(d.to_email, 'rita@acme.com');
    assert.strictEqual(d.to_name, 'Rita Recruiter');
  });

  it('approval email only when your channel is email; one-time link bound to the version', async () => {
    const { outbox, state } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await q(`UPDATE user_settings SET preferred_reminder_channel = 'in_app'`);
    assert.strictEqual((await outbox.requestApproval([d.id])).emailed, false);
    assert.strictEqual(state.notified.length, 0);
    await q(`UPDATE user_settings SET preferred_reminder_channel = 'email'`);
    const r = await outbox.requestApproval([d.id]);
    assert(r.emailed);
    const link = state.notified[0].html.match(/https:\/\/api\.example\.test\/api\/outbox\/review\/([\w-]+)/);
    assert(link, 'link in the email');
    assert.strictEqual((await outbox.findByToken(link[1])).email.id, d.id);
    await outbox.update(d.id, { body: 'Edited body, longer than forty characters for sure.' });
    assert.strictEqual((await outbox.findByToken(link[1])).error, 'edited', 'editing invalidates the link');
    assert.strictEqual((await outbox.findByToken('x'.repeat(43))).error, 'invalid');
  });

  it('approve → waits for undo window + working hours → sends once with threading, records everything', async () => {
    const { outbox, state } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com', { mid: 'orig-2@acme.com' });
    await q(`INSERT INTO application_reminders (application_id, reminder_type, title, remind_at) VALUES ($1, 'follow_up', 'Follow up', NOW())`, [app]);
    const d = await outbox.createFollowUpDraft(app);
    const a = await outbox.approve(d.id);
    assert.strictEqual(a.status, 'approved');
    assert.strictEqual(new Date(a.send_after).getTime(), workday.getTime() + 5 * 60 * 1000);
    assert.deepStrictEqual((await outbox.tick()).results, [], 'nothing before the undo window ends');
    state.now = new Date(workday.getTime() + 6 * 60 * 1000);
    const [r1, r2] = await Promise.all([outbox.tick(), outbox.tick()]);   // two pods at once
    assert.deepStrictEqual([...r1.results, ...r2.results].map(x => x.outcome), ['sent']);
    assert.strictEqual(state.sent.length, 1);
    assert.strictEqual(state.sent[0].headers['In-Reply-To'], '<orig-2@acme.com>');
    assert.match(state.sent[0].from, /John Itopa Isah/);
    assert.strictEqual(state.appended.length, 1, 'copied to Sent folder');
    const [row] = await q('SELECT status, message_id FROM outbound_emails WHERE id = $1', [d.id]);
    assert.strictEqual(row.status, 'sent');
    assert.strictEqual((await q(`SELECT count(*)::int n FROM application_communications WHERE application_id = $1 AND direction = 'outbound'`, [app]))[0].n, 1);
    assert.strictEqual((await q(`SELECT count(*)::int n FROM application_reminders WHERE application_id = $1 AND NOT is_done`, [app]))[0].n, 0);
    assert.deepStrictEqual(await events(d.id), ['created', 'approved', 'sent']);
  });

  it('undo within the window puts it back for approval; skip never sends', async () => {
    const { outbox, state } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await outbox.approve(d.id);
    assert.strictEqual((await outbox.undo(d.id)).status, 'pending_approval');
    await outbox.skip(d.id);
    state.now = new Date(workday.getTime() + 60 * 60 * 1000);
    await outbox.tick();
    assert.strictEqual(state.sent.length, 0);
    assert.deepStrictEqual(await events(d.id), ['created', 'approved', 'undone', 'skipped']);
  });

  it('cancels when the recruiter replied or the application moved on; reschedules outside hours', async () => {
    const { outbox, state } = harness();
    const a1 = await mkApp(); await inbound(a1, 'jane@acme.com');
    const a2 = await mkApp(); await inbound(a2, 'bob@beta.com');
    const a3 = await mkApp(); await inbound(a3, 'eve@gamma.com');
    const [d1, d2, d3] = [await outbox.createFollowUpDraft(a1), await outbox.createFollowUpDraft(a2), await outbox.createFollowUpDraft(a3)];
    for (const d of [d1, d2, d3]) await outbox.approve(d.id);
    await inbound(a1, 'jane@acme.com', { daysAgo: -0.001 });                    // reply after the draft
    await q(`UPDATE applications SET status = 'INTERVIEW_SCHEDULED' WHERE id = $1`, [a2]);
    state.now = new Date('2026-11-19T19:30:00Z');                               // 20:30 Paris
    await q(`UPDATE outbound_emails SET send_after = $1`, [new Date('2026-11-19T19:00:00Z')]);
    const out = (await outbox.tick()).results.sort((x, y) => x.id - y.id);
    assert.deepStrictEqual(out.map(r => r.outcome), ['cancelled', 'cancelled', 'rescheduled']);
    assert.match(out[0].reason, /replied/);
    assert.match(out[1].reason, /INTERVIEW_SCHEDULED/);
    const [r3] = await q('SELECT status, send_after, attempts FROM outbound_emails WHERE id = $1', [d3.id]);
    assert.strictEqual(r3.status, 'approved');
    assert.strictEqual(r3.attempts, 0, 'a reschedule is not a failed attempt');
    assert.strictEqual(new Date(r3.send_after).toISOString(), '2026-11-20T08:00:00.000Z');  // Fri 09:00 Paris
    assert.strictEqual(state.sent.length, 0);
  });

  it('retries a failed send, then gives up after 3 attempts', async () => {
    const { outbox, state } = harness({ failSend: 5 });
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await outbox.approve(d.id);
    const outcomes = [];
    for (let i = 1; i <= 3; i++) {
      state.now = new Date(workday.getTime() + i * 15 * 60 * 1000);
      outcomes.push(...(await outbox.tick()).results.map(r => r.outcome));
    }
    assert.deepStrictEqual(outcomes, ['retry', 'retry', 'failed']);
    const [row] = await q('SELECT status, last_error FROM outbound_emails WHERE id = $1', [d.id]);
    assert.strictEqual(row.status, 'failed');
    assert.match(row.last_error, /SMTP 451/);
  });

  it('refuses edits to no-reply addresses and to emails already approved', async () => {
    const { outbox } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await assert.rejects(outbox.update(d.id, { to_email: 'no-reply@acme.com' }), /can't receive replies/);
    await outbox.approve(d.id);
    await assert.rejects(outbox.update(d.id, { subject: 'x' }), /approved/);
  });

  it('public review page: escapes content, approves once, rejects reuse / unknown links, no login needed', async () => {
    // The route uses the real clock, so the link must be issued with it too
    // (a fixed date here makes the 72-hour link "expire" as the calendar moves).
    const { outbox, state } = harness({ at: new Date() });
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createManualDraft(app, { subject: '<script>alert(1)</script>', body: 'Hello <b>there</b>, this is a long enough body.', polish: false });
    await outbox.requestApproval([d.id]);
    const tok = state.notified[0].html.match(/review\/([\w-]+)/)[1];
    const pageRes = await api(`/outbox/review/${tok}`, { auth: false });
    const html = await pageRes.text();
    assert.strictEqual(pageRes.status, 200);
    assert(!html.includes('<script>alert(1)') && html.includes('&lt;script&gt;alert(1)'));
    assert.match(html, /method="post"/);
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d.id]))[0].status, 'pending_approval', 'opening never sends');
    const ok = await api(`/outbox/review/${tok}/approve`, { method: 'POST', auth: false });
    assert.strictEqual(ok.status, 200);
    assert.match(await ok.text(), /Approved/);
    const [row] = await q('SELECT status, approved_via FROM outbound_emails WHERE id = $1', [d.id]);
    assert.deepStrictEqual(row, { status: 'approved', approved_via: 'email' });
    const again = await api(`/outbox/review/${tok}/approve`, { method: 'POST', auth: false });
    assert.strictEqual(again.status, 410, 'single use');
    assert.match(await again.text(), /Already handled/);
    await outbox.undo(d.id);
    assert.strictEqual((await outbox.findByToken(tok)).error, 'used', 'still spent after Undo');
    assert.strictEqual((await api('/outbox/review/not-a-real-token', { auth: false })).status, 404);
    const ev = await q(`SELECT detail FROM outbound_email_events WHERE outbound_email_id = $1 AND event = 'approved'`, [d.id]);
    assert(ev[0].detail.ip, 'approval records where it came from');
  });

  it('dashboard API requires login and drives the whole flow', async () => {
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    assert.strictEqual((await api('/outbox', { auth: false })).status, 401);
    const created = await (await api('/outbox', { method: 'POST', body: { application_id: app } })).json();
    assert.strictEqual(created.status, 'pending_approval');
    const edited = await (await api(`/outbox/${created.id}`, { method: 'PATCH', body: { subject: 'Following up' } })).json();
    assert.strictEqual(edited.version, 2);
    assert.strictEqual((await (await api(`/outbox/${created.id}/approve`, { method: 'POST' })).json()).status, 'approved');
    assert.strictEqual((await (await api(`/outbox/${created.id}/undo`, { method: 'POST' })).json()).status, 'pending_approval');
    const list = await (await api('/outbox?status=open')).json();
    assert.strictEqual(list.length, 1);
    assert(!('approval_token_hash' in list[0]), 'token hash never leaves the server');
    const det = await (await api(`/outbox/${created.id}`)).json();
    assert.deepStrictEqual(det.events.map(e => e.event), ['created', 'edited', 'approved', 'undone']);
  });

  // ── language ─────────────────────────────────────────────────
  it("writes in the recruiter's language and says why; French template and date without the AI", async () => {
    const { outbox } = harness();
    const fr = await mkApp();
    await q(`INSERT INTO email_responses (source_account, gmail_message_id, application_id, sender_email, sender_name, subject, body_snippet, received_at)
             VALUES ('imap', 'fr-1', $1, 'rh@extia.fr', 'Acme Recrutement', 'Extia - Merci pour votre candidature !', 'Nous avons bien reçu votre candidature et nous reviendrons vers vous.', NOW() - interval '8 days')`, [fr]);
    const d = await outbox.createFollowUpDraft(fr);
    assert.strictEqual(d.language, 'fr');
    assert.strictEqual(d.language_reason, 'Acme wrote in French');
    assert.match(d.body, /Bien cordialement/);
    const polishCall = aiCalls.find(c => c.tool_choice?.name === 'submit_email');
    assert.match(polishCall.system, /in French/, 'the AI is told the language instead of guessing it');

    const en = await mkApp(); await inbound(en, 'jane@acme.com');
    const e = await outbox.createFollowUpDraft(en);
    assert.strictEqual(e.language, 'en'); assert.strictEqual(e.language_reason, 'default');

    // No AI: the French template, a French date, "Madame, Monsieur," for nobody in particular
    const plain = await outbox.createManualDraft(fr, { polish: false, language: 'fr' });
    assert.match(plain.body, /^Madame, Monsieur,/);
    assert.match(plain.body, /envoyée le \d{1,2} [a-zéû]+ 20\d\d/);
    assert.strictEqual(plain.language_reason, 'chosen by you');
  });

  it('EN | FR switch translates the current text, keeps the thread subject, and never loses your edits', async () => {
    const { outbox } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com', { mid: 'orig-9@acme.com' });
    const d = await outbox.createFollowUpDraft(app);
    const subject = d.subject;
    const t = await outbox.setLanguage(d.id, 'fr');
    assert.strictEqual(t.language, 'fr');
    assert.match(t.body, /Bien cordialement/);
    assert.strictEqual(t.subject, subject, '"Re: …" stays so the email lands in the recruiter’s thread');
    const ev = (await q(`SELECT detail FROM outbound_email_events WHERE outbound_email_id = $1 AND event = 'translated'`, [d.id]))[0].detail;
    assert.deepStrictEqual([ev.from, ev.language, ev.how], ['en', 'fr', 'translated']);
    assert.strictEqual((await outbox.setLanguage(d.id, 'fr')).version, t.version, 'same language: nothing happens');
    await assert.rejects(outbox.setLanguage(d.id, 'de'), /en or fr/);

    // AI unavailable: an untouched draft is rebuilt from the template…
    const { outbox: noAi } = harness({ translate: async () => null });
    const app2 = await mkApp(); await inbound(app2, 'bob@beta.com');
    const d2 = await noAi.createFollowUpDraft(app2);
    const r2 = await noAi.setLanguage(d2.id, 'fr');
    assert.match(r2.body, /Je me permets de revenir vers vous/);
    assert.match((await noAi.setLanguage(d2.id, 'en')).body, /follow up on my application/, 'switching back and forth is not an edit');
    await noAi.setLanguage(d2.id, 'fr');
    // …but an edited one is left alone
    await noAi.update(d2.id, { body: 'Mon texte à moi, modifié à la main.' });
    await assert.rejects(noAi.setLanguage(d2.id, 'en'), e => e.status === 503);
    assert.strictEqual((await q('SELECT body, language FROM outbound_emails WHERE id = $1', [d2.id]))[0].body, 'Mon texte à moi, modifié à la main.');

    // API
    const viaApi = await (await api(`/outbox/${d.id}/language`, { method: 'POST', body: { language: 'en' } })).json();
    assert.strictEqual(viaApi.language, 'en');
    assert.match(viaApi.body, /Best regards/);
  });

  // ── closing an application ───────────────────────────────────
  it('closing an application cancels its unsent emails at once (any path), and Undo puts everything back', async () => {
    const { outbox } = harness();
    const close = require('../src/services/applicationClose').createApplicationClose();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    const m = await outbox.createManualDraft(app, { polish: false });
    await outbox.approve(m.id);
    const [{ id: rem }] = await q(`INSERT INTO application_reminders (application_id, reminder_type, title, remind_at) VALUES ($1, 'follow_up', 'Follow up', NOW()) RETURNING id`, [app]);

    const r = await close.close(app, 'REJECTED', { via: 'outbox' });
    assert.strictEqual(r.cancelled_emails, 2);
    const rows = await q('SELECT id, status, cancel_reason FROM outbound_emails WHERE application_id = $1 ORDER BY id', [app]);
    assert.deepStrictEqual(rows.map(x => x.status), ['cancelled', 'cancelled']);
    assert.match(rows[0].cancel_reason, /closed \(rejected\)/);
    assert.deepStrictEqual(await events(d.id), ['created', 'cancelled']);
    assert.strictEqual((await q('SELECT is_done FROM application_reminders WHERE id = $1', [rem]))[0].is_done, true);
    await assert.rejects(close.close(app, 'REJECTED'), e => e.status === 409);

    const u = await close.reopen(app, r.undo);
    assert.strictEqual(u.application.status, 'APPLIED');
    assert.strictEqual(u.restored_emails, 2);
    assert.deepStrictEqual((await q('SELECT status FROM outbound_emails WHERE application_id = $1 ORDER BY id', [app])).map(x => x.status),
      ['pending_approval', 'approved']);
    assert.strictEqual((await q('SELECT is_done FROM application_reminders WHERE id = $1', [rem]))[0].is_done, false);
    assert.deepStrictEqual(await events(d.id), ['created', 'cancelled', 'restored']);

    // Undo is refused once the status changed again
    const r2 = await close.close(app, 'WITHDRAWN');
    await q(`UPDATE applications SET status = 'GHOSTED' WHERE id = $1`, [app]);
    await assert.rejects(close.reopen(app, r2.undo), e => e.status === 409);

    // A status change from anywhere else (dashboard dropdown, email worker) cancels too
    const app2 = await mkApp(); await inbound(app2, 'bob@beta.com');
    const d2 = await outbox.createFollowUpDraft(app2);
    await q(`UPDATE applications SET status = 'REJECTED' WHERE id = $1`, [app2]);
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d2.id]))[0].status, 'cancelled');
    // …but moving forward (interview) does not — the send-time check handles that
    const app3 = await mkApp(); await inbound(app3, 'eve@gamma.com');
    const d3 = await outbox.createFollowUpDraft(app3);
    await q(`UPDATE applications SET status = 'INTERVIEW_INVITE' WHERE id = $1`, [app3]);
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d3.id]))[0].status, 'pending_approval');
  });

  // ── possible rejections ──────────────────────────────────────
  const rejection = (sender, { suggested = null, daysAgo = 1, subject = 'Votre candidature' } = {}) => q(
    `INSERT INTO email_responses (source_account, gmail_message_id, sender_email, subject, received_at, ai_classification, suggested_application_id)
     VALUES ('imap', $1, $2, $3, NOW() - $4::float8 * interval '1 day', 'REJECTION', $5) RETURNING id`,
    [`rej-${Math.random()}`, sender, subject, daysAgo, suggested]).then(r => r[0].id);

  it('an unconfirmed rejection blocks drafting, puts an approved follow-up back for approval, and is listed', async () => {
    const { outbox, state } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    await outbox.approve(d.id);
    await rejection('careers@acme.com');                                   // same company domain, not attached
    state.now = new Date('2026-11-19T10:10:00Z');
    await q(`UPDATE outbound_emails SET send_after = $1 WHERE id = $2`, [new Date('2026-11-19T10:06:00Z'), d.id]);
    const out = (await outbox.tick()).results;
    assert.deepStrictEqual(out.map(r => r.outcome), ['held']);
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d.id]))[0].status, 'pending_approval');
    assert.strictEqual(state.sent.length, 0);

    const other = await mkApp(); await inbound(other, 'bob@beta.com');
    const rej = await rejection('noreply@beta.com', { suggested: other });
    assert.strictEqual(await outbox.createFollowUpDraft(other), null, 'no follow-up while a rejection may be about it');
    const listed = await (await api('/outbox/possible-rejections')).json();
    assert.deepStrictEqual(listed.map(r => r.application_id).sort(), [app, other].sort());
    assert((await (await api(`/outbox/${d.id}`)).json()).possible_rejection, 'shown on the email too');

    // A job-platform sender says nothing about which company
    const third = await mkApp(); await inbound(third, 'eve@gamma.com');
    await q(`INSERT INTO application_contacts (application_id, name, email) VALUES ($1, 'Eve', 'eve@myworkdayjobs.com')`, [third]);
    await rejection('ats@myworkdayjobs.com');
    assert.strictEqual(await outbox.possibleRejectionFor(third), null);

    // "Not this application" → it stops flagging that application
    await api(`/outbox/possible-rejections/${rej}/dismiss`, { method: 'POST', body: { application_id: other } });
    assert.strictEqual(await outbox.possibleRejectionFor(other), null);
    assert(await outbox.createFollowUpDraft(other));
  });

  it('"Yes, rejected" attaches the email, closes the application and cancels its emails; Undo reverses all of it', async () => {
    const { outbox } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    const rej = await rejection('noreply@acme-careers.com', { suggested: app });
    const out = await (await api(`/outbox/possible-rejections/${rej}/confirm`, { method: 'POST', body: { application_id: app } })).json();
    assert.strictEqual(out.application.status, 'REJECTED');
    assert.strictEqual(out.cancelled_emails, 1);
    const [er] = await q('SELECT application_id, suggested_application_id, match_method FROM email_responses WHERE id = $1', [rej]);
    assert.deepStrictEqual([er.application_id, er.suggested_application_id, er.match_method], [app, null, 'confirmed_by_you']);
    assert.strictEqual((await (await api('/outbox/possible-rejections')).json()).length, 0);
    const ev = await q(`SELECT description FROM application_events WHERE application_id = $1 AND event_type = 'STATUS_CHANGED' ORDER BY id DESC LIMIT 1`, [app]);
    assert.match(ev[0].description, /APPLIED to REJECTED — marked rejected confirmed from a rejection email; 1 unsent email cancelled/);

    await require('../src/services/applicationClose').createApplicationClose().reopen(app, out.undo);
    const [back] = await q('SELECT application_id, suggested_application_id FROM email_responses WHERE id = $1', [rej]);
    assert.deepStrictEqual([back.application_id, back.suggested_application_id], [null, app], 'the suggestion is back');
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d.id]))[0].status, 'pending_approval');
  });

  it('the email worker applies a clear rejection when only one application at that company is open', async () => {
    const matching = require('../src/services/emailTracking/applicationMatchingService');
    const { linkEmail } = require('../src/services/emailTracking/emailLinkingService');
    const real = matching.findMatch;
    const rejectionCls = { classification: 'REJECTION', confidence: 0.95, summary: 'no', suggested_status: 'APPLIED', extracted_company: 'Acme', extracted_role: 'Platform Engineer' };
    const run = async (application, extra = {}) => {
      matching.findMatch = async () => ({ status: 'suggested', application, method: 'company_role', ...extra });
      const [{ id }] = await q(`INSERT INTO email_responses (source_account, gmail_message_id, sender_email, subject, received_at)
                                VALUES ('imap', $1, 'talent@acme.com', 'Your application', NOW()) RETURNING id`, [`w-${Math.random()}`]);
      try { return { ...(await linkEmail(db, { sourceKey: 'imap', emailResponseId: id, email: { sender_email: 'talent@acme.com' }, classification: rejectionCls })), id }; }
      finally { matching.findMatch = real; }
    };
    const solo = await mkApp();
    const appRow = (await q('SELECT * FROM applications WHERE id = $1', [solo]))[0];
    const r1 = await run(appRow);
    assert.strictEqual(r1.outcome, 'matched');
    assert.strictEqual((await q('SELECT status FROM applications WHERE id = $1', [solo]))[0].status, 'REJECTED', 'REJECTED even though the AI suggested APPLIED');

    const a = await mkApp(); await mkApp();                                // two open Acme applications → ambiguous
    const r2 = await run((await q('SELECT * FROM applications WHERE id = $1', [a]))[0]);
    assert.strictEqual(r2.outcome, 'suggested');
    assert.strictEqual((await q('SELECT status FROM applications WHERE id = $1', [a]))[0].status, 'APPLIED');

    await q(`UPDATE applications SET status = 'REJECTED' WHERE company_name = 'Acme' AND id <> $1`, [a]);   // now only one open…
    const r3 = await run((await q('SELECT * FROM applications WHERE id = $1', [a]))[0], { method: 'name_trgm', weak: true });
    assert.strictEqual(r3.outcome, 'suggested', '…but a vague name resemblance is never applied automatically');
  });

  it('expires drafts left for 7 days', async () => {
    const { outbox, state } = harness();
    const app = await mkApp(); await inbound(app, 'jane@acme.com');
    const d = await outbox.createFollowUpDraft(app);
    state.now = new Date(Date.now() + 8 * 864e5);
    await outbox.tick();
    assert.strictEqual((await q('SELECT status FROM outbound_emails WHERE id = $1', [d.id]))[0].status, 'expired');
  });

  // ── notification preferences + digests ───────────────────────
  it('preferences save and are validated', async () => {
    const r = await (await api('/user-settings', { method: 'PATCH', body: { preferred_reminder_channel: 'in_app', digest_schedule: 'weekly' } })).json();
    assert.strictEqual(r.preferred_reminder_channel, 'in_app');
    assert.strictEqual(r.digest_schedule, 'weekly');
    assert.strictEqual((await api('/user-settings', { method: 'PATCH', body: { digest_schedule: 'hourly' } })).status, 400);
  });

  it('digest plan follows the schedule; only one pod can claim a digest', async () => {
    const { digestPlan, claimDigest } = require('../src/services/digestSchedule');
    const mon = new Date('2026-11-23T07:00:00Z'), thu = new Date('2026-11-19T07:00:00Z');
    assert.deepStrictEqual(await digestPlan({ now: thu }), { send: true, schedule: 'daily', hours: 24, period: 'daily' });
    await q(`UPDATE user_settings SET digest_schedule = 'weekly'`);
    assert.strictEqual((await digestPlan({ now: thu })).send, false);
    assert.deepStrictEqual(await digestPlan({ now: mon }), { send: true, schedule: 'weekly', hours: 168, period: 'weekly' });
    await q(`UPDATE user_settings SET digest_schedule = 'off'`);
    assert.strictEqual((await digestPlan({ now: mon })).send, false);
    const wins = await Promise.all(Array.from({ length: 6 }, () => claimDigest('visitor_digest', { now: thu })));
    assert.strictEqual(wins.filter(Boolean).length, 1);
    assert.strictEqual(await claimDigest('visitor_digest', { now: mon }), true, 'a new day can be claimed');
  });

  // ── application context ──────────────────────────────────────
  const tinyPdf = Buffer.from('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MDAgMjAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA5MCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDEwMCBUZCAoSm9obiBJc2FoIC0gRGV2T3BzIEVuZ2luZWVyIC0gS3ViZXJuZXRlcyBUZXJyYWZvcm0gQXJnb0NEKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp0cmFpbGVyCjw8IC9Sb290IDEgMCBSID4+Cg==', 'base64');
  const upload = (app, buf, name = 'cv.pdf') => {
    const fd = new FormData(); fd.append('cv', new Blob([buf]), name);
    return api(`/applications/${app}/context/cv-upload`, { method: 'POST', body: fd, form: true });
  };

  it('uploads a PDF CV: text extracted, stored as a CV document, counts as submitted', async () => {
    const app = await mkApp();
    const r = await upload(app, tinyPdf);
    assert.strictEqual(r.status, 201, await r.clone().text());
    const ctx = await r.json();
    assert.match(ctx.cv_text, /Kubernetes Terraform ArgoCD/);
    assert.match(ctx.cv_label, /Uploaded — cv\.pdf/);
    const [a] = await q('SELECT submitted_doc_id, context_cv_source FROM applications WHERE id = $1', [app]);
    assert(a.submitted_doc_id && a.context_cv_source === `upload:${a.submitted_doc_id}`);
    assert.strictEqual((await upload(app, Buffer.from('not a pdf at all'))).status, 415);
    assert.strictEqual((await upload(app, Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(6 * 1024 * 1024)]))).status, 413);
  });

  it('picks a CV from the library, saves the job description, and the AI receives both', async () => {
    const other = await mkApp();
    const [doc] = await q(`INSERT INTO application_documents (application_id, document_type, content_json) VALUES ($1, 'CV', $2) RETURNING id`,
      [other, JSON.stringify({ summary: 'Platform engineer', skills: ['Kubernetes', 'Go'] })]);
    const app = await mkApp('INTERVIEW_SCHEDULED');
    const opts = await (await api('/applications/context/cv-options')).json();
    assert(opts.documents.some(o => o.source === `document:${doc.id}`));
    const ctx = await (await api(`/applications/${app}/context`, { method: 'PUT', body: { cv_source: `document:${doc.id}`, job_description: 'We run 40 EKS clusters.' } })).json();
    assert.match(ctx.cv_text, /Platform engineer/);
    assert.strictEqual(ctx.job_description, 'We run 40 EKS clusters.');
    assert.strictEqual((await q('SELECT submitted_doc_id FROM applications WHERE id = $1', [app]))[0].submitted_doc_id, doc.id);
    assert.strictEqual((await api(`/applications/${app}/context`, { method: 'PUT', body: { cv_source: 'document:999999' } })).status, 404);

    const gen = await (await api(`/interview-prep/${app}/generate`, { method: 'POST' })).json();
    const prompt = aiCalls.at(-1).messages[0].content;
    assert.match(prompt, /We run 40 EKS clusters/);
    assert.match(prompt, /Platform engineer/);
    assert.strictEqual(gen.questions.find(x => x.question === 'K8s?').hint, 'Talk about HPA', 'hint is returned');
    assert.deepStrictEqual(gen.checklist.map(i => i.text), ['Research Acme', 'Revise Terraform']);
  });

  it('saved questions load with the same shape after a reload; AI checklist is added to yours, not replacing it', async () => {
    const app = await mkApp('INTERVIEW_SCHEDULED');
    await q(`UPDATE applications SET interview_prep = $1 WHERE id = $2`, [JSON.stringify({ checklist: [{ text: 'My own item', done: true }] }), app]);
    await api(`/interview-prep/${app}/generate`, { method: 'POST' });
    const loaded = await (await api(`/interview-prep/${app}/questions`)).json();
    assert(Array.isArray(loaded.questions) && loaded.questions.length === 2, 'GET returns { questions } like generate');
    assert.strictEqual(loaded.questions.find(x => x.question === 'K8s?').hint, 'Talk about HPA');
    const c = await (await api(`/interview-prep/${app}/checklist`, { method: 'POST' })).json();
    assert.deepStrictEqual(c.checklist.map(i => `${i.text}|${i.done}|${i.source || 'you'}`), [
      'My own item|true|you', 'Research Acme|false|ai', 'Revise Terraform|false|ai',
      'Review Acme platform|false|ai', 'Prepare a K8s incident story|false|ai',   // duplicate (case) skipped
    ]);
  });
});
