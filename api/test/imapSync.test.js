/**
 * Professional (Zoho IMAP) mailbox sync — multi-folder, UID watermarks,
 * Message-ID de-duplication, Spam review, failure isolation.
 *
 * Unit tests always run. The sync tests need a Postgres with the schema and
 * migration 035 applied; they are skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:55432/portfolio_test npm test
 */

const assert       = require('assert');
const { Readable } = require('stream');

const classification = require('../src/services/emailTracking/emailClassificationService');
const imapService    = require('../src/services/emailTracking/imapService');
const { syncImapMailbox, classificationFromRow, optionsFrom } =
  require('../src/services/emailTracking/imapSyncService');

const OWN = { IMAP_USER: 'connect@johnisah.com' };

// ── Unit ────────────────────────────────────────────────────────
describe('Recruitment rule filter', () => {
  const yes = [
    'Thanks for applying to Bitstack!',
    'Thank you for your application to Ekimetrics',
    'John Itopa, candidature bien reçue pour Ingénieur DevOps',
    'Re: Votre candidature pour l\'offre Ingénieur Production IT',
    'Suite de votre candidature au poste de Stage - DevOps',
    'Invitation to interview — Platform Engineer',
    'A message from the HR team',
    'Unfortunately we will not move forward',
  ];
  const no = [
    '[Portfolio] 95 visits today — three new countries',     // "hr" inside "three"
    'Contrôle de sécurité de votre compte',                    // "role" inside "contrôle"
    'Your weekly storage report',
    'Validez votre compte',
  ];
  for (const s of yes) it(`keeps "${s}"`, () => assert(classification.passesRuleFilter({ subject: s })));
  for (const s of no)  it(`drops "${s}"`, () => assert(!classification.passesRuleFilter({ subject: s })));
});

describe('Own-domain sender filter', () => {
  it('defaults to the mailbox domain', () => {
    assert.deepStrictEqual(classification.ignoredSenderDomains(OWN), ['johnisah.com']);
    assert(classification.isIgnoredSender('connect@johnisah.com', ['johnisah.com']));
    assert(classification.isIgnoredSender('alerts@mail.johnisah.com', ['johnisah.com']));
    assert(!classification.isIgnoredSender('jobs@notjohnisah.com', ['johnisah.com']));
    assert(!classification.isIgnoredSender('no-reply@ashbyhq.com', ['johnisah.com']));
  });
  it('EMAIL_IGNORE_SENDER_DOMAINS overrides', () => {
    assert.deepStrictEqual(
      classification.ignoredSenderDomains({ ...OWN, EMAIL_IGNORE_SENDER_DOMAINS: 'a.com, B.org' }),
      ['a.com', 'b.org']);
  });
});

describe('Message-ID', () => {
  it('strips angle brackets', () => {
    assert.strictEqual(imapService.messageIdOf({ messageId: ' <abc@x.com> ' }), 'abc@x.com');
  });
  it('is synthetic but stable when missing', () => {
    const env = { from: [{ address: 'a@b.com' }], subject: 'Hi', date: new Date('2026-11-16T08:00:00Z') };
    const a = imapService.messageIdOf(env);
    assert(a.startsWith('synthetic-'));
    assert.strictEqual(a, imapService.messageIdOf({ ...env }));
  });
});

describe('Folder selection', () => {
  it('scans everything except sent/drafts/trash-like folders and flags Spam', async () => {
    const client = { list: async () => [
      { path: 'INBOX',        name: 'INBOX',        flags: new Set(), specialUse: '\\Inbox' },
      { path: 'Sent',         name: 'Sent',         flags: new Set(), specialUse: '\\Sent' },
      { path: 'Drafts',       name: 'Drafts',       flags: new Set(), specialUse: '\\Drafts' },
      { path: 'Trash',        name: 'Trash',        flags: new Set(), specialUse: '\\Trash' },
      { path: 'Spam',         name: 'Spam',         flags: new Set(), specialUse: '\\Junk' },
      { path: 'Archive',      name: 'Archive',      flags: new Set(), specialUse: '\\Archive' },
      { path: 'Newsletter',   name: 'Newsletter',   flags: new Set() },
      { path: 'Notification', name: 'Notification', flags: new Set() },
      { path: 'Snoozed',      name: 'Snoozed',      flags: new Set() },
      { path: 'Templates',    name: 'Templates',    flags: new Set() },
      { path: 'Parent',       name: 'Parent',       flags: new Set(['\\Noselect']) },
    ] };
    const folders = await imapService.listScanFolders(client, {});
    assert.deepStrictEqual(folders.map(f => f.path), ['INBOX', 'Spam', 'Archive', 'Newsletter', 'Notification']);
    assert.deepStrictEqual(folders.filter(f => f.isSpam).map(f => f.path), ['Spam']);

    const fewer = await imapService.listScanFolders(client, { IMAP_EXCLUDE_FOLDERS: 'Newsletter' });
    assert(!fewer.some(f => f.path === 'Newsletter'));
  });
});

describe('Sync options', () => {
  it('uses safe defaults and ignores junk values', () => {
    assert.deepStrictEqual(optionsFrom({}), { lookbackDays: 3, backfillDays: null, maxPerFolder: 300, maxClassifyAttempts: 5 });
    assert.strictEqual(optionsFrom({ IMAP_LOOKBACK_DAYS: 'abc' }).lookbackDays, 3);
    assert.strictEqual(optionsFrom({}, { backfillDays: 45 }).backfillDays, 45);
  });
});

describe('Classification rebuilt from a stored row', () => {
  it('carries what linkEmail needs', () => {
    const c = classificationFromRow({
      ai_classification: 'APPLICATION_CONFIRMATION', confidence_score: '0.950',
      raw_label: 'ack', ai_suggested_status: 'APPLIED', extracted_company: 'CEA', extracted_role: 'DevOps',
    });
    assert.deepStrictEqual(c, {
      classification: 'APPLICATION_CONFIRMATION', confidence: 0.95, summary: 'ack',
      suggested_status: 'APPLIED', extracted_company: 'CEA', extracted_role: 'DevOps',
    });
  });
});

// ── Sync against a fake IMAP server + real Postgres ─────────────
const DB_URL = process.env.TEST_DATABASE_URL;
const T0 = new Date('2026-11-16T06:00:00Z').getTime();
const at = mins => new Date(T0 + mins * 60000);

function rawMessage(m) {
  return [
    `From: ${m.name || 'Sender'} <${m.from}>`,
    'To: connect@johnisah.com',
    `Subject: ${m.subject}`,
    ...(m.mid ? [`Message-ID: <${m.mid}>`] : []),
    `Date: ${(m.date || m.internalDate).toUTCString()}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    m.body || `Body of ${m.subject}`,
  ].join('\r\n');
}

class FakeServer {
  constructor(boxes) { this.boxes = boxes; this.clients = []; this.dropOnDownload = null; }
  add(path, msg) {
    const box = this.boxes[path];
    const uid = box.messages.reduce((n, m) => Math.max(n, m.uid), 0) + 1;
    box.messages.push({ uid, ...msg });
    return uid;
  }
}

class FakeClient {
  constructor(server) { this.server = server; this.usable = true; this.box = null; server.clients.push(this); }
  async connect() {}
  async logout() { this.usable = false; }
  async list() {
    return Object.entries(this.server.boxes).map(([path, b]) => ({
      path, name: path, flags: new Set(b.flags || []), specialUse: b.specialUse,
    }));
  }
  async getMailboxLock(path, opts = {}) {
    if (!this.usable) throw new Error('Connection not available');
    assert.strictEqual(opts.readOnly, true, 'folders must be opened read-only');
    const b = this.server.boxes[path];
    this.box = b;
    this.mailbox = { path, uidValidity: BigInt(b.uidValidity), uidNext: b.messages.reduce((n, m) => Math.max(n, m.uid), 0) + 1 };
    return { release() {} };
  }
  async search(q) {
    const msgs = this.box.messages;
    if (q.uid) {
      const from = Number(q.uid.split(':')[0]);
      const r = msgs.filter(m => m.uid >= from).map(m => m.uid);
      if (!r.length && msgs.length) r.push(Math.max(...msgs.map(m => m.uid))); // IMAP "N:*" semantics
      return r;
    }
    if (q.since) return msgs.filter(m => m.internalDate >= q.since).map(m => m.uid);
    throw new Error('unsupported search');
  }
  async *fetch(range) {
    const want = new Set(String(range).split(',').map(Number));
    for (const m of this.box.messages) {
      if (!want.has(m.uid)) continue;
      yield {
        uid: m.uid, internalDate: m.internalDate, size: 200,
        envelope: {
          messageId: m.mid ? `<${m.mid}>` : undefined,
          from: [{ address: m.from, name: m.name || '' }],
          subject: m.subject, date: m.date || m.internalDate,
        },
      };
    }
  }
  async download(uid) {
    if (this.server.dropOnDownload === `${this.mailbox.path}:${uid}`) {
      this.server.dropOnDownload = null;
      this.usable = false;
      throw new Error('Unexpected close');
    }
    const m = this.box.messages.find(x => x.uid === Number(uid));
    return { content: Readable.from([Buffer.from(rawMessage(m))]) };
  }
}

function zohoLikeServer() {
  return new FakeServer({
    INBOX:        { uidValidity: 1, specialUse: '\\Inbox', messages: [] },
    Sent:         { uidValidity: 1, specialUse: '\\Sent',  messages: [] },
    Trash:        { uidValidity: 1, specialUse: '\\Trash', messages: [] },
    Spam:         { uidValidity: 1, specialUse: '\\Junk',  messages: [] },
    Newsletter:   { uidValidity: 1, messages: [] },
    Notification: { uidValidity: 1, messages: [] },
  });
}

(DB_URL ? describe : describe.skip)('IMAP sync (Postgres)', function () {
  this.timeout(20000);
  const { Pool } = require('pg');
  let db;
  let classified, linked, classifyImpl;

  const classificationStub = {
    ...classification,
    classify: async args => { classified.push(args); return classifyImpl(args); },
  };
  const linkingStub = {
    linkEmail: async (_db, args) => { linked.push(args); return { outcome: 'unlinked' }; },
  };
  const okClassify = args => ({
    classification: /unfortunately/i.test(args.subject) ? 'REJECTION' : 'APPLICATION_CONFIRMATION',
    confidence: 0.9, summary: 'test', suggested_status: 'APPLIED',
    extracted_company: 'Acme', extracted_role: 'DevOps Engineer',
  });

  function run(server, overrides = {}, env = OWN) {
    return syncImapMailbox({
      db, env, overrides,
      imap: { ...imapService, createClient: () => new FakeClient(server) },
      classification: classificationStub, linking: linkingStub, log: () => {},
    });
  }
  const rows = async () => (await db.query(
    `SELECT message_id, imap_folder, imap_uid, subject, review_status, received_at, ai_classification
     FROM email_responses WHERE source_account = 'imap' ORDER BY received_at, id`)).rows;
  const state = async folder => (await db.query(
    `SELECT last_uid::int, uid_validity::int FROM imap_folder_state WHERE source_account='imap' AND folder=$1`, [folder])).rows[0];

  before(async () => {
    db = new Pool({ connectionString: DB_URL });
  });
  after(async () => { await db.end(); });
  beforeEach(async () => {
    await db.query(`DELETE FROM email_responses WHERE source_account = 'imap'`);
    await db.query('TRUNCATE imap_folder_state, imap_message_failures');
    classified = []; linked = []; classifyImpl = okClassify;
  });

  // Fake "now" so the 3-day look-back covers the fixture timestamps.
  let realNow;
  beforeEach(() => { realNow = Date.now; Date.now = () => T0 + 120 * 60000; });
  afterEach(() => { Date.now = realNow; });

  it('reads every folder, skips own notifications and non-job mail, holds Spam for review', async () => {
    const s = zohoLikeServer();
    s.add('INBOX',        { mid: 'own-1',  from: 'connect@johnisah.com', subject: '[Jobs] 4 new matches — top role score', internalDate: at(1) });
    s.add('Notification', { mid: 'lever-1', from: 'no-reply@hire.lever.co', subject: 'Thank you for your application to Ekimetrics', internalDate: at(2) });
    s.add('Newsletter',   { mid: 'news-1', from: 'newsletter@hellowork.com', subject: 'Votre semaine en chiffres', body: 'Lisez nos articles', internalDate: at(3) });
    s.add('Newsletter',   { mid: 'li-1',   from: 'jobs-noreply@linkedin.com', subject: 'John Itopa, your application was sent to Ivy Partners', internalDate: at(4) });
    s.add('Spam',         { mid: 'cea-1',  from: 'no_reply_recrutement@cea.fr', subject: 'Votre candidature pour l\'offre Ingénieur DevOps', internalDate: at(5) });
    s.add('Sent',         { mid: 'sent-1', from: 'connect@johnisah.com', subject: 'My application', internalDate: at(6) });
    s.add('Trash',        { mid: 'trash-1', from: 'x@y.com', subject: 'Interview invitation', internalDate: at(7) });

    const r = await run(s);
    assert.strictEqual(r.status, 'SUCCESS');
    const stored = await rows();
    assert.deepStrictEqual(stored.map(e => e.message_id), ['lever-1', 'li-1', 'cea-1']);
    assert.deepStrictEqual(stored.map(e => e.imap_folder), ['Notification', 'Newsletter', 'Spam']);
    assert.deepStrictEqual(stored.map(e => e.review_status), [null, null, 'PENDING']);
    // Spam is classified (so the review card shows a label) but never linked until kept.
    assert.deepStrictEqual(linked.map(l => l.email.message_id), ['lever-1', 'li-1']);
    assert.strictEqual(r.pending, 1);
    assert(classified.every(c => c.mailbox_folder), 'folder passed to classifier as a hint');
    assert(!r.folders.some(f => f.path === 'Sent' || f.path === 'Trash'));
  });

  it('a second run only looks past the watermark and inserts nothing twice', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'a', from: 'hr@acme.com', subject: 'Interview invitation', internalDate: at(1) });
    await run(s);
    assert.strictEqual((await state('INBOX')).last_uid, 1);

    const r2 = await run(s);
    assert.strictEqual(r2.inserted, 0);
    assert.strictEqual(r2.folders.find(f => f.path === 'INBOX').scanned, 0);

    s.add('INBOX', { mid: 'b', from: 'hr@acme.com', subject: 'Unfortunately…', internalDate: at(9) });
    const r3 = await run(s);
    assert.strictEqual(r3.inserted, 1);
    assert.strictEqual((await state('INBOX')).last_uid, 2);
  });

  it('an email moved to another folder (new UID, old arrival date) is seen once, not lost and not duplicated', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'x', from: 'hr@acme.com', subject: 'Interview invitation', internalDate: at(1) });
    await run(s);
    // Moved later: same Message-ID, new UID in Notification, arrival date unchanged.
    s.add('Notification', { mid: 'x', from: 'hr@acme.com', subject: 'Interview invitation', internalDate: at(1) });
    s.add('Notification', { mid: 'old-moved', from: 'talent@siemens.com', subject: 'Thanks for your application', internalDate: at(-60 * 24) });
    await run(s);
    const stored = await rows();
    assert.deepStrictEqual(stored.map(e => e.message_id).sort(), ['old-moved', 'x']);
  });

  it('a future-dated Date header neither hides later mail nor sets received_at', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'future', from: 'recruiter@gmail.com', subject: 'DevOps opportunity', internalDate: at(1), date: at(8 * 60) });
    await run(s);
    s.add('INBOX', { mid: 'bitstack', from: 'no-reply@ashbyhq.com', subject: 'Thanks for applying to Bitstack!', internalDate: at(30) });
    await run(s);
    const stored = await rows();
    assert.deepStrictEqual(stored.map(e => e.message_id), ['future', 'bitstack']);
    assert.strictEqual(stored[0].received_at.toISOString(), at(1).toISOString(), 'server arrival time, not Date header');
  });

  it('processes oldest first across folders', async () => {
    const s = zohoLikeServer();
    s.add('INBOX',        { mid: 'late',  from: 'hr@a.com', subject: 'Interview invitation', internalDate: at(50) });
    s.add('Notification', { mid: 'early', from: 'hr@b.com', subject: 'Application received', internalDate: at(5) });
    s.add('Newsletter',   { mid: 'mid',   from: 'hr@c.com', subject: 'Application received', internalDate: at(20) });
    await run(s);
    assert.deepStrictEqual(classified.map(c => c.subject), ['Application received', 'Application received', 'Interview invitation']);
    assert.deepStrictEqual(linked.map(l => l.email.message_id), ['early', 'mid', 'late']);
  });

  it('stops on a classification failure and retries that email next run', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'one', from: 'hr@a.com', subject: 'Application received', internalDate: at(1) });
    s.add('INBOX', { mid: 'two', from: 'hr@b.com', subject: 'Interview invitation', internalDate: at(2) });
    s.add('INBOX', { mid: 'three', from: 'hr@c.com', subject: 'Application received', internalDate: at(3) });
    classifyImpl = args => {
      if (args.subject === 'Interview invitation') throw new Error('Your credit balance is too low');
      return okClassify(args);
    };
    const r = await run(s);
    assert.strictEqual(r.status, 'PARTIAL');
    assert(r.halted);
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['one']);
    assert.strictEqual((await state('INBOX')).last_uid, 1, 'watermark stops before the failed email');

    classifyImpl = okClassify;
    const r2 = await run(s);
    assert.strictEqual(r2.status, 'SUCCESS');
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['one', 'two', 'three']);
    assert.strictEqual((await state('INBOX')).last_uid, 3);
  });

  it('a permanently failing email is stored as UNKNOWN after the attempt cap instead of blocking the folder', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'poison', from: 'hr@a.com', subject: 'Interview invitation', internalDate: at(1) });
    classifyImpl = () => { throw new Error('boom'); };
    for (let i = 0; i < 2; i++) await run(s, { maxClassifyAttempts: 3 });
    assert.strictEqual((await rows()).length, 0);
    const r = await run(s, { maxClassifyAttempts: 3 });
    const stored = await rows();
    assert.deepStrictEqual(stored.map(e => [e.message_id, e.ai_classification]), [['poison', 'UNKNOWN']]);
    assert.strictEqual(r.halted, false);
  });

  it('a dropped connection fails that folder only, reconnects, and leaves its watermark alone', async () => {
    const s = zohoLikeServer();
    s.add('INBOX',        { mid: 'i1', from: 'hr@a.com', subject: 'Application received', internalDate: at(1) });
    s.add('Notification', { mid: 'n1', from: 'hr@b.com', subject: 'Application received', internalDate: at(2) });
    s.dropOnDownload = 'INBOX:1';
    const r = await run(s);
    assert.strictEqual(r.status, 'PARTIAL');
    assert.match(r.folders.find(f => f.path === 'INBOX').error, /Unexpected close/);
    assert.strictEqual(s.clients.length, 2, 'reconnected once');
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['n1']);
    assert.strictEqual(await state('INBOX'), undefined);

    const r2 = await run(s);
    assert.strictEqual(r2.status, 'SUCCESS');
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['i1', 'n1']);
  });

  it('a UIDVALIDITY change falls back to the look-back window', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'v1', from: 'hr@a.com', subject: 'Application received', internalDate: at(1) });
    await run(s);
    s.boxes.INBOX = { uidValidity: 7, specialUse: '\\Inbox', messages: [] };
    s.add('INBOX', { mid: 'v1', from: 'hr@a.com', subject: 'Application received', internalDate: at(1) });
    s.add('INBOX', { mid: 'v2', from: 'hr@b.com', subject: 'Application received', internalDate: at(2) });
    const r = await run(s);
    assert.strictEqual(r.folders.find(f => f.path === 'INBOX').mode, 'lookback');
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['v1', 'v2']);
    assert.deepStrictEqual(await state('INBOX'), { last_uid: 2, uid_validity: 7 });
  });

  it('adopts rows written by the old worker (imap_<uid>, no message_id) instead of duplicating them', async () => {
    const s = zohoLikeServer();
    s.add('INBOX', { mid: 'legacy', from: 'hr@a.com', subject: 'Application received', internalDate: at(1) });
    await db.query(
      `INSERT INTO email_responses (source_account, gmail_message_id, sender_email, subject, received_at, ai_classification)
       VALUES ('imap', 'imap_1', 'hr@a.com', 'Application received', $1, 'APPLICATION_CONFIRMATION')`, [at(1)]);
    const r = await run(s);
    assert.strictEqual(r.inserted, 0);
    const stored = await rows();
    assert.deepStrictEqual(stored.map(e => [e.message_id, e.imap_folder]), [['legacy', 'INBOX']]);
  });

  it('backfill ignores watermarks, re-scans N days and still never duplicates', async () => {
    const s = zohoLikeServer();
    s.add('Notification', { mid: 'b1', from: 'hr@a.com', subject: 'Application received', internalDate: at(-10 * 24 * 60) });
    s.add('Notification', { mid: 'b2', from: 'hr@b.com', subject: 'Application received', internalDate: at(1) });
    await run(s); // default 3-day look-back: only b2
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['b2']);
    const r = await run(s, { backfillDays: 45 });
    assert.strictEqual(r.folders.find(f => f.path === 'Notification').mode, 'backfill');
    assert.deepStrictEqual((await rows()).map(e => e.message_id), ['b1', 'b2']);
    const again = await run(s, { backfillDays: 45 });
    assert.strictEqual(again.inserted, 0);
  });
});
