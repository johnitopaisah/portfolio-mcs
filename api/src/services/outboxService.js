'use strict';
/**
 * Outbox — emails to recruiters that are NEVER sent without your approval.
 *
 *   createFollowUpDraft / createManualDraft → status pending_approval (or draft
 *     when no recipient is known yet)
 *   approve (dashboard or one-time email link) → approved, sends at send_after:
 *     5-minute undo window, Mon–Fri 09:00–18:00 Europe/Paris only
 *   tick() (every minute, any API pod) → sends due emails, re-checking first:
 *     still Applied? recruiter replied? recipient valid? follow-up in last 14
 *     days? daily cap? — and cancels/reschedules with the reason recorded
 *
 * Every step is written to outbound_email_events (never updated/deleted).
 * Dependencies (mailer, AI, clock) are injectable for tests.
 */

const crypto = require('crypto');
const pool   = require('../db/client');
const { isAtsDomain, domainOf } = require('./emailTracking/applicationMatchingService');
const { getApplicationContext } = require('./applicationContextService');

const TZ = 'Europe/Paris';
const UNDO_MS            = 5 * 60 * 1000;
const TOKEN_TTL_MS       = 72 * 60 * 60 * 1000;
const EXPIRE_PENDING_MS  = 7 * 24 * 60 * 60 * 1000;
const STUCK_SENDING_MS   = 15 * 60 * 1000;
const MIN_GAP_DAYS       = 14;
const WORK_START = 9, WORK_END = 18;            // Paris local hours
const DAILY_CAP  = () => parseInt(process.env.OUTBOX_DAILY_CAP || '10', 10);
const MAX_ATTEMPTS = 3;
const OPEN = ['draft', 'pending_approval', 'approved', 'sending'];

const apiBase   = () => (process.env.API_PUBLIC_URL || 'https://api.johnisah.com').replace(/\/$/, '');
const adminBase = () => (process.env.ADMIN_URL || 'https://admin.johnisah.com').replace(/\/$/, '');
const fromAddress = () => process.env.OUTBOX_FROM_EMAIL || process.env.NOTIFY_EMAIL_USER;

// ── working hours ────────────────────────────────────────────────
function parisParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: p.weekday };
}
function parisOffsetMs(d) {
  const p = parisParts(d);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(d.getTime() / 60000) * 60000;
}
const isWorkday = wd => !['Sat', 'Sun'].includes(wd);
function inWorkingHours(d) {
  const p = parisParts(d);
  return isWorkday(p.wd) && p.h >= WORK_START && p.h < WORK_END;
}
/** Earliest moment ≥ t inside Mon–Fri 09:00–18:00 Paris. */
function nextSendTime(t) {
  if (inWorkingHours(t)) return t;
  const p = parisParts(t);
  // walk forward day by day (Paris calendar) to the next workday 09:00
  let y = p.y, m = p.m, d = p.d;
  const beforeStartToday = isWorkday(p.wd) && p.h < WORK_START;
  for (let i = beforeStartToday ? 0 : 1; i < 8; i++) {
    const noonUtc = new Date(Date.UTC(y, m - 1, d + i, 12));
    const q = parisParts(noonUtc);
    if (!isWorkday(q.wd)) continue;
    const localNine = Date.UTC(q.y, q.m - 1, q.d, WORK_START, 0);
    return new Date(localNine - parisOffsetMs(noonUtc));
  }
  return t;
}
const parisDate = d => { const p = parisParts(d); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };

// ── recipients ───────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const NO_REPLY_RE = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|mailer-daemon|mailer|bounce|jobs-noreply|careers-noreply|system|alerts?|automated|auto-?reply|postmaster)([._+-]|@)/i;
const NO_REPLY_DOMAINS = /(^|\.)((linkedin|indeed|welcometothejungle|welcomekit|hellowork|glassdoor|jobteaser|teamtailor-mail|jobleads)\.(com|co|fr|io))$/i;

// Your own mailboxes (a forwarded recruiter email shows YOU as the sender).
function ownAddresses(env = process.env) {
  return new Set([env.NOTIFY_EMAIL_USER, env.NOTIFY_EMAIL_TO, env.IMAP_USER, env.GMAIL_TARGET_ADDRESS,
    env.ADMIN_PROFILE_EMAIL, ...(env.OWN_EMAIL_ADDRESSES || '').split(',')]
    .map(a => String(a || '').trim().toLowerCase()).filter(a => a.includes('@')));
}
function isOwnAddress(email, env = process.env) {
  const e = String(email || '').trim().toLowerCase();
  if (ownAddresses(env).has(e)) return true;
  const own = (env.IMAP_USER || env.NOTIFY_EMAIL_USER || '').split('@')[1]?.toLowerCase();
  return !!own && domainOf(e) === own;                   // anything @johnisah.com is you
}

function isSendableAddress(email) {
  const e = String(email || '').trim();
  if (!EMAIL_RE.test(e) || NO_REPLY_RE.test(e) || isOwnAddress(e)) return false;
  const domain = domainOf(e);
  if (!domain || NO_REPLY_DOMAINS.test(domain) || isAtsDomain(domain)) return false;
  return true;
}

/** Best person to email about an application, and the email to reply to (for threading). */
async function resolveRecipient(applicationId, db = pool) {
  const { rows: contacts } = await db.query(
    `SELECT id, name, email FROM application_contacts
     WHERE application_id = $1 AND email IS NOT NULL AND email <> ''
     ORDER BY (role IN ('recruiter','hr')) DESC, created_at ASC`, [applicationId]);
  const { rows: emails } = await db.query(
    `SELECT id, sender_email, sender_name, subject, message_id, thread_id
     FROM email_responses
     WHERE application_id = $1 AND (review_status IS NULL OR review_status = 'APPROVED')
     ORDER BY received_at DESC LIMIT 20`, [applicationId]);

  const contact = contacts.find(c => isSendableAddress(c.email));
  const inbound = emails.find(e => isSendableAddress(e.sender_email));
  const replyTo = contact ? emails.find(e => e.sender_email?.toLowerCase() === contact.email.toLowerCase()) : inbound;

  const to = contact
    ? { to_email: contact.email.trim(), to_name: contact.name || null }
    : inbound ? { to_email: inbound.sender_email.trim(), to_name: inbound.sender_name || null } : { to_email: null, to_name: null };
  // Emails stored before migration 035 have no message_id, but for IMAP rows
  // thread_id holds the original Message-ID header ("<…@…>") — use it.
  const bare = v => String(v || '').trim().replace(/^<|>$/g, '');
  const looksLikeMid = v => /^[^\s<>@]+@[^\s<>@]+$/.test(bare(v));
  const ownMid = replyTo?.message_id && !replyTo.message_id.startsWith('synthetic-') ? bare(replyTo.message_id)
    : looksLikeMid(replyTo?.thread_id) ? bare(replyTo.thread_id) : null;
  const msgId = ownMid ? `<${ownMid}>` : null;
  const root = looksLikeMid(replyTo?.thread_id) && bare(replyTo.thread_id) !== ownMid ? `<${bare(replyTo.thread_id)}>` : null;
  return {
    ...to,
    reply_to_response_id: replyTo?.id || null,
    in_reply_to: msgId,
    references_header: msgId ? [root, msgId].filter(Boolean).join(' ') : null,
    reply_subject: replyTo?.subject || null,
  };
}

// ── composing ────────────────────────────────────────────────────
// First name to greet, or '' when the display name is a team or company
// ("3DS Talent Acquisition", "Recrutement Acme", "HR Team") — then the
// template says "Hiring Team" instead of "Hi 3DS".
const ORG_WORDS = /\b(team|talent|acquisition|recruit\w*|recrutement|careers?|carri[eè]res?|jobs?|hr|rh|people|hiring|ressources|resources|humaines|human|department|service|notifications?|no-?reply|support|info|contact)\b/i;
function greetingName(name, company) {
  const n = String(name || '').replace(/["']/g, '').trim();
  if (!n || /\d|@/.test(n) || ORG_WORDS.test(n)) return '';
  const co = String(company || '').toLowerCase().split(/[\s(),.-]+/).filter(w => w.length > 2);
  if (co.some(w => n.toLowerCase().split(/\s+/).includes(w))) return '';
  const first = n.split(/\s+/)[0];
  return /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]+$/.test(first) ? first[0].toUpperCase() + first.slice(1) : '';
}
function fill(tpl, ctx) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (ctx[k] ?? ''));
}

async function draftContext(applicationId, recipient, db = pool) {
  const { rows } = await db.query(
    `SELECT a.id, a.company_name, a.job_title, a.applied_at, a.status,
            p.name AS full_name, p.cv_display_name, p.cv_phone, p.cv_linkedin
     FROM applications a LEFT JOIN profile p ON TRUE WHERE a.id = $1 LIMIT 1`, [applicationId]);
  if (!rows.length) throw Object.assign(new Error('Application not found'), { status: 404 });
  const a = rows[0];
  const firstName = greetingName(recipient.to_name, a.company_name);
  return {
    app: a,
    vars: {
      company: a.company_name, role: a.job_title,
      recruiter_name: firstName || 'Hiring Team',
      your_name: a.cv_display_name || a.full_name || '',
      applied_date: a.applied_at ? new Date(a.applied_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'recently',
    },
  };
}

async function templateDraft(applicationId, recipient, db = pool) {
  const { app, vars } = await draftContext(applicationId, recipient, db);
  const { rows } = await db.query(
    `SELECT id, subject_template, body_template FROM email_templates
     WHERE category = 'follow_up' ORDER BY is_system DESC, id ASC LIMIT 1`);
  const t = rows[0] || {
    id: null,
    subject_template: 'Following up — {{role}} application',
    body_template: 'Hi {{recruiter_name}},\n\nI wanted to follow up on my application for the {{role}} position at {{company}}, submitted on {{applied_date}}. I remain very interested and would be glad to share anything else that would help.\n\nBest regards,\n{{your_name}}',
  };
  let subject = fill(t.subject_template, vars);
  if (recipient.reply_subject) subject = /^re:/i.test(recipient.reply_subject) ? recipient.reply_subject : `Re: ${recipient.reply_subject}`;
  const body = fill(t.body_template, vars).trim()
    .replace(/^(?:Hi|Hello|Hey)\s+Hiring Team\s*,/im, 'Dear Hiring Team,');   // no named person
  return { app, vars, template_id: t.id, subject, body };
}

const polishTool = {
  name: 'submit_email',
  description: 'Submit the final follow-up email',
  input_schema: {
    type: 'object', required: ['body'],
    properties: {
      body: { type: 'string', description: 'Plain-text email body, greeting to sign-off, under 160 words' },
    },
  },
};

async function defaultPolish({ draft, applicationId }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  const ctx = await getApplicationContext(applicationId).catch(() => ({}));
  const { rows: last } = await pool.query(
    `SELECT subject, body_snippet FROM email_responses WHERE application_id = $1 ORDER BY received_at DESC LIMIT 1`, [applicationId]);
  const res = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    tools: [polishTool],
    tool_choice: { type: 'tool', name: 'submit_email' },
    system: 'You write short, warm, professional job-application follow-up emails. Never invent facts, '
      + 'achievements, names or dates that are not given. No placeholders, no brackets, no markdown. '
      + 'Write in the language of the recruiter\'s last email if one is given, otherwise in English. '
      + 'Keep the candidate\'s sign-off name exactly as given. '
      + 'Greet the recruiter by first name only if recruiter_first_name is given; otherwise use "Dear Hiring Team," '
      + '(or the natural equivalent in the email\'s language).',
    messages: [{ role: 'user', content: JSON.stringify({
      task: 'Rewrite this follow-up so it is specific to the role, concise (under 160 words), and polite. '
        + 'Mention one relevant strength from the CV if one clearly matches the job.',
      draft: draft.body,
      company: draft.vars.company, role: draft.vars.role, recruiter_first_name: draft.vars.recruiter_name === 'Hiring Team' ? null : draft.vars.recruiter_name,
      applied_date: draft.vars.applied_date, sign_off_name: draft.vars.your_name,
      job_description: (ctx.job_description || '').slice(0, 3000),
      cv_excerpt: (ctx.cv_text || '').slice(0, 3000),
      recruiter_last_email: last[0] ? { subject: last[0].subject, excerpt: last[0].body_snippet } : null,
    }) }],
  });
  const body = res.content.find(b => b.type === 'tool_use')?.input?.body;
  return body && body.trim().length > 40 ? body.trim() : null;
}

// ── audit ────────────────────────────────────────────────────────
async function logEvent(db, id, event, actor, detail = {}) {
  await db.query(
    `INSERT INTO outbound_email_events (outbound_email_id, event, actor, detail) VALUES ($1, $2, $3, $4)`,
    [id, event, actor, JSON.stringify(detail)]);
}

// ── factory (dependencies injectable for tests) ──────────────────
function createOutbox({
  db = pool,
  now = () => new Date(),
  polish = defaultPolish,
  sendMail = null,          // async ({ from, to, subject, text, html, headers, messageId, raw }) → { messageId }
  appendToSent = null,      // async (rawBuffer) → void   (copy into the mailbox's Sent folder)
  notifyUser = null,        // async ({ subject, html, text }) → void   (approval request to you)
  isPaused = null,          // async () → boolean   (availability "Not open" holds everything)
} = {}) {
  isPaused     ||= () => require('./availability').isSearchPaused(db);
  sendMail     ||= defaultSendMail;
  appendToSent ||= defaultAppendToSent;
  notifyUser   ||= defaultNotifyUser;

  async function get(id, c = db) {
    const { rows } = await c.query('SELECT * FROM outbound_emails WHERE id = $1', [id]);
    if (!rows.length) throw Object.assign(new Error('Email not found'), { status: 404 });
    return rows[0];
  }

  async function reminderChannel() {
    try {
      const { rows } = await db.query('SELECT preferred_reminder_channel FROM user_settings LIMIT 1');
      return rows[0]?.preferred_reminder_channel === 'in_app' ? 'in_app' : 'email';
    } catch { return 'email'; }
  }

  async function newDraft({ applicationId, source, overrides = {}, usePolish = true }) {
    const recipient = await resolveRecipient(applicationId, db);
    const draft = await templateDraft(applicationId, recipient, db);
    let body = overrides.body || draft.body, aiPolished = false;
    if (!overrides.body && usePolish) {
      try {
        const polished = await polish({ draft, applicationId });
        if (polished) { body = polished; aiPolished = true; }
      } catch (err) { console.warn('[Outbox] AI polish failed — using the template:', err.message); }
    }
    const to_email = overrides.to_email !== undefined ? overrides.to_email : recipient.to_email;
    const status = to_email && isSendableAddress(to_email) ? 'pending_approval' : 'draft';
    const { rows } = await db.query(
      `INSERT INTO outbound_emails
         (application_id, source, status, to_email, to_name, subject, body, in_reply_to, references_header,
          reply_to_response_id, template_id, ai_polished)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [applicationId, source, status, to_email || null, overrides.to_name ?? recipient.to_name,
       overrides.subject || draft.subject, body, recipient.in_reply_to, recipient.references_header,
       recipient.reply_to_response_id, draft.template_id, aiPolished]);
    if (!rows.length) return null;   // an open follow-up already exists
    await logEvent(db, rows[0].id, 'created', source === 'manual' ? 'you' : 'system',
      { source, ai_polished: aiPolished, recipient_found: !!to_email });
    return rows[0];
  }

  /** Daily rule: one follow-up per Applied application with a reachable recruiter. */
  async function createFollowUpDraft(applicationId) {
    const { rows } = await db.query(
      `SELECT 1 FROM outbound_emails WHERE application_id = $1 AND source = 'follow_up_rule'
         AND (status = ANY($2) OR (status = 'sent' AND sent_at > $3))`,
      [applicationId, OPEN, new Date(now().getTime() - MIN_GAP_DAYS * 864e5)]);
    if (rows.length) return null;
    const recipient = await resolveRecipient(applicationId, db);
    if (!recipient.to_email) return null;           // nobody reachable — nothing to approve
    return newDraft({ applicationId, source: 'follow_up_rule' });
  }

  async function createManualDraft(applicationId, overrides = {}) {
    const usePolish = overrides.polish !== false;
    return newDraft({ applicationId, source: 'manual', overrides, usePolish });
  }

  /** One-time approval link (only valid for the current version). */
  async function issueToken(id, c = db) {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await c.query(
      `UPDATE outbound_emails SET approval_token_hash = $1, approval_token_version = version,
         approval_expires_at = $2, updated_at = NOW() WHERE id = $3`,
      [hash, new Date(now().getTime() + TOKEN_TTL_MS), id]);
    return token;
  }

  /** Sends you one email listing the drafts waiting for approval (if your channel is email). */
  async function requestApproval(ids) {
    if (!ids.length) return { emailed: false };
    const channel = await reminderChannel();
    const items = [];
    for (const id of ids) {
      const e = await get(id);
      if (e.status !== 'pending_approval') continue;
      const { rows } = await db.query('SELECT company_name, job_title FROM applications WHERE id = $1', [e.application_id]);
      let link = null;
      if (channel === 'email') link = `${apiBase()}/api/outbox/review/${await issueToken(id)}`;
      await logEvent(db, id, 'approval_requested', 'system', { channel });
      items.push({ e, app: rows[0] || {}, link });
    }
    if (channel !== 'email' || !items.length) return { emailed: false, channel };
    await notifyUser(approvalEmail(items));
    return { emailed: true, channel, count: items.length };
  }

  async function update(id, patch = {}, actor = 'you', event = 'edited') {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query('SELECT * FROM outbound_emails WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw Object.assign(new Error('Email not found'), { status: 404 });
      const e = rows[0];
      if (!['draft', 'pending_approval'].includes(e.status)) {
        throw Object.assign(new Error(`Can't edit an email that is ${e.status.replace('_', ' ')}`), { status: 409 });
      }
      const fields = ['to_email', 'to_name', 'subject', 'body'];
      const changed = {};
      for (const f of fields) {
        if (patch[f] === undefined) continue;
        const v = typeof patch[f] === 'string' ? patch[f].trim() : patch[f];
        if (f === 'subject' && !v) throw Object.assign(new Error('Subject is required'), { status: 400 });
        if (f === 'body' && !v) throw Object.assign(new Error('Message is required'), { status: 400 });
        if (f === 'to_email' && v && !isSendableAddress(v)) {
          throw Object.assign(new Error("That address can't receive replies (no-reply or a job platform) — use the recruiter's own email"), { status: 400 });
        }
        if ((v || null) !== (e[f] || null)) changed[f] = { from: e[f], to: v || null };
      }
      if (!Object.keys(changed).length) { await c.query('ROLLBACK'); return e; }
      const next = { ...e, ...Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])) };
      const status = next.to_email ? 'pending_approval' : 'draft';
      const { rows: out } = await c.query(
        `UPDATE outbound_emails SET to_email = $1, to_name = $2, subject = $3, body = $4, status = $5,
           version = version + 1, updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [next.to_email, next.to_name, next.subject, next.body, status, id]);
      await logEvent(c, id, event, actor, { fields: Object.keys(changed), changes: changed, version: out[0].version });
      await c.query('COMMIT');
      return out[0];
    } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  }

  async function polishExisting(id) {
    const e = await get(id);
    if (!['draft', 'pending_approval'].includes(e.status)) throw Object.assign(new Error('Only unsent drafts can be rewritten'), { status: 409 });
    const recipient = { to_name: e.to_name, reply_subject: null };
    const draft = await templateDraft(e.application_id, recipient, db);
    draft.body = e.body;
    const body = await polish({ draft, applicationId: e.application_id });
    if (!body) throw Object.assign(new Error('AI rewrite is unavailable right now'), { status: 503 });
    const out = await update(id, { body }, 'you', 'ai_polished');   // one history entry, with the diff
    await db.query('UPDATE outbound_emails SET ai_polished = TRUE WHERE id = $1', [id]);
    return { ...out, ai_polished: true };
  }

  async function transition(id, fromStatuses, fn) {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query('SELECT * FROM outbound_emails WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw Object.assign(new Error('Email not found'), { status: 404 });
      if (!fromStatuses.includes(rows[0].status)) {
        throw Object.assign(new Error(`This email is already ${rows[0].status.replace('_', ' ')}`), { status: 409 });
      }
      const out = await fn(c, rows[0]);
      await c.query('COMMIT');
      return out;
    } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
  }

  async function approve(id, { via = 'dashboard', meta = {} } = {}) {
    return transition(id, ['pending_approval'], async (c, e) => {
      if (!e.to_email || !isSendableAddress(e.to_email)) throw Object.assign(new Error('Add a recipient before sending'), { status: 400 });
      const sendAfter = nextSendTime(new Date(now().getTime() + UNDO_MS));
      const { rows } = await c.query(
        `UPDATE outbound_emails SET status = 'approved', approved_at = $1, approved_via = $2, send_after = $3,
           approval_token_version = NULL, updated_at = NOW()
         WHERE id = $4 RETURNING *`, [now(), via, sendAfter, id]);
      await logEvent(c, id, 'approved', 'you', { via, version: e.version, send_after: sendAfter.toISOString(), ...meta });
      return rows[0];
    });
  }

  async function undo(id) {
    return transition(id, ['approved'], async (c) => {
      const { rows } = await c.query(
        `UPDATE outbound_emails SET status = 'pending_approval', approved_at = NULL, approved_via = NULL,
           send_after = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
      await logEvent(c, id, 'undone', 'you', {});
      return rows[0];
    });
  }

  async function skip(id, { via = 'dashboard', meta = {} } = {}) {
    return transition(id, ['draft', 'pending_approval', 'approved'], async (c) => {
      const { rows } = await c.query(
        `UPDATE outbound_emails SET status = 'skipped', approval_token_version = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING *`, [id]);
      await logEvent(c, id, 'skipped', 'you', { via, ...meta });
      return rows[0];
    });
  }

  /** The email behind a one-time link, or why the link can't be used. */
  async function findByToken(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return { error: 'invalid' };
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await db.query('SELECT * FROM outbound_emails WHERE approval_token_hash = $1', [hash]);
    if (!rows.length) return { error: 'invalid' };
    const e = rows[0];
    // Links are one-time and tied to the version they were sent for. The hash
    // is kept after use so an old link explains itself instead of "invalid".
    if (e.status === 'expired' || (e.approval_expires_at && new Date(e.approval_expires_at) < now())) return { error: 'expired', email: e };
    if (e.approval_token_version === null) return { error: 'used', email: e };          // approved / skipped once
    if (e.approval_token_version !== e.version) return { error: 'edited', email: e };
    if (e.status !== 'pending_approval') return { error: 'used', email: e };
    return { email: e };
  }

  // ── sending ────────────────────────────────────────────────────
  async function cancel(c, e, reason) {
    await c.query(`UPDATE outbound_emails SET status = 'cancelled', cancel_reason = $1, updated_at = NOW() WHERE id = $2`, [reason, e.id]);
    await logEvent(c, e.id, 'cancelled', 'system', { reason });
    return { id: e.id, outcome: 'cancelled', reason };
  }
  async function reschedule(c, e, when, why) {
    // Not a send attempt — undo the claim's increment so the retry limit only counts real failures.
    await c.query(`UPDATE outbound_emails SET status = 'approved', send_after = $1, attempts = GREATEST(attempts - 1, 0), updated_at = NOW() WHERE id = $2`, [when, e.id]);
    await logEvent(c, e.id, 'rescheduled', 'system', { send_after: when.toISOString(), reason: why });
    return { id: e.id, outcome: 'rescheduled', reason: why };
  }

  async function checks(e) {
    const { rows: [app] } = await db.query('SELECT status FROM applications WHERE id = $1', [e.application_id]);
    if (!app) return { cancel: 'the application was deleted' };
    if (e.source === 'follow_up_rule' && app.status !== 'APPLIED') return { cancel: `the application moved to ${app.status}` };
    if (e.source === 'follow_up_rule') {
      const { rows } = await db.query(
        `SELECT 1 FROM email_responses WHERE application_id = $1 AND received_at > $2 LIMIT 1`, [e.application_id, e.created_at]);
      if (rows.length) return { cancel: 'the recruiter replied after this draft was written' };
      const { rows: recent } = await db.query(
        `SELECT 1 FROM outbound_emails WHERE application_id = $1 AND id <> $2 AND status = 'sent' AND sent_at > $3 LIMIT 1`,
        [e.application_id, e.id, new Date(now().getTime() - MIN_GAP_DAYS * 864e5)]);
      if (recent.length) return { cancel: `a follow-up was already sent in the last ${MIN_GAP_DAYS} days` };
    }
    if (!e.to_email || !isSendableAddress(e.to_email)) return { cancel: 'the recipient address is missing or cannot receive replies' };
    if (!inWorkingHours(now())) return { reschedule: nextSendTime(now()), why: 'outside working hours' };
    const { rows: [{ n }] } = await db.query(
      `SELECT count(*)::int AS n FROM outbound_emails WHERE status = 'sent' AND (sent_at AT TIME ZONE $1)::date = $2::date`,
      [TZ, parisDate(now())]);
    if (n >= DAILY_CAP()) {
      const p = parisParts(now());
      const tomorrow = nextSendTime(new Date(Date.UTC(p.y, p.m - 1, p.d + 1, 0, 30)));   // early tomorrow → next workday 09:00
      return { reschedule: tomorrow, why: `daily limit of ${DAILY_CAP()} emails reached` };
    }
    return {};
  }

  async function sendOne(id) {
    // Claim: approved → sending (exactly one pod/process wins)
    // updated_at uses the same clock as the stuck-sending check in tick().
    const t = now();
    const { rows } = await db.query(
      `UPDATE outbound_emails SET status = 'sending', attempts = attempts + 1, updated_at = $2
       WHERE id = $1 AND status = 'approved' AND send_after <= $2 RETURNING *`, [id, t]);
    if (!rows.length) return null;
    const e = rows[0];

    const verdict = await checks(e);
    if (verdict.cancel) return cancel(db, e, verdict.cancel);
    if (verdict.reschedule) return reschedule(db, e, verdict.reschedule, verdict.why);

    const { rows: [p] } = await db.query('SELECT name, cv_display_name FROM profile LIMIT 1');
    const fromName = p?.cv_display_name || p?.name || '';
    const messageId = `<outbox-${e.id}-${crypto.randomBytes(6).toString('hex')}@${(fromAddress() || 'localhost').split('@')[1] || 'localhost'}>`;
    const mail = {
      from: fromName ? `"${fromName.replace(/"/g, '')}" <${fromAddress()}>` : fromAddress(),
      to: e.to_name ? `"${e.to_name.replace(/"/g, '')}" <${e.to_email}>` : e.to_email,
      subject: e.subject,
      text: e.body,
      messageId,
      headers: {
        ...(e.in_reply_to ? { 'In-Reply-To': e.in_reply_to } : {}),
        ...(e.references_header ? { References: e.references_header } : {}),
      },
    };
    try {
      const info = await sendMail(mail);
      const sentAt = now();
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          `UPDATE outbound_emails SET status = 'sent', sent_at = $1, message_id = $2, last_error = NULL, updated_at = NOW() WHERE id = $3`,
          [sentAt, info?.messageId || messageId, e.id]);
        await c.query(
          `INSERT INTO application_communications
             (application_id, template_id, comm_type, direction, subject, body, sent_to, sent_from, sent_at, channel, note)
           VALUES ($1, $2, 'email', 'outbound', $3, $4, $5, $6, $7, 'email', $8)`,
          [e.application_id, e.template_id, e.subject, e.body, e.to_email, fromAddress(), sentAt, `Sent from Outbox #${e.id} after your approval`]);
        await c.query(
          `INSERT INTO application_events (application_id, event_type, description) VALUES ($1, 'EMAIL_SENT', $2)`,
          [e.application_id, `Follow-up sent to ${e.to_email}: ${e.subject}`]);
        await c.query(
          `UPDATE application_reminders SET is_done = TRUE WHERE application_id = $1 AND reminder_type = 'follow_up' AND is_done = FALSE`,
          [e.application_id]);
        await logEvent(c, e.id, 'sent', 'system', { message_id: info?.messageId || messageId, to: e.to_email, version: e.version });
        await c.query('COMMIT');
      } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; } finally { c.release(); }
      if (info?.raw) appendToSent(info.raw).catch(err => console.warn('[Outbox] Could not copy to Sent folder:', err.message));
      return { id: e.id, outcome: 'sent' };
    } catch (err) {
      const final = e.attempts >= MAX_ATTEMPTS;
      await db.query(
        `UPDATE outbound_emails SET status = $1, last_error = $2, send_after = $3, updated_at = NOW() WHERE id = $4`,
        [final ? 'failed' : 'approved', String(err.message).slice(0, 500), new Date(now().getTime() + 10 * 60 * 1000), e.id]);
      await logEvent(db, e.id, final ? 'failed' : 'send_error', 'system', { error: String(err.message).slice(0, 500), attempt: e.attempts });
      return { id: e.id, outcome: final ? 'failed' : 'retry', error: err.message };
    }
  }

  /** Called every minute by every API pod; safe to run concurrently. */
  async function tick() {
    const results = [];
    const t = now();
    // Job search paused (Not open): hold everything — nothing expires and
    // approved emails wait; they go out (in working hours) after you resume.
    if (await isPaused()) return { paused: true, expired: 0, stuck: 0, results };
    // pending approvals left for 7 days expire
    const { rows: expired } = await db.query(
      `UPDATE outbound_emails SET status = 'expired', updated_at = NOW()
       WHERE status IN ('draft', 'pending_approval') AND created_at < $1 RETURNING id`,
      [new Date(t.getTime() - EXPIRE_PENDING_MS)]);
    for (const r of expired) await logEvent(db, r.id, 'expired', 'system', { after_days: 7 });
    // a pod that died mid-send leaves 'sending' behind — never resend blindly
    const { rows: stuck } = await db.query(
      `UPDATE outbound_emails SET status = 'failed', last_error = 'Interrupted while sending — check your Sent folder before retrying', updated_at = NOW()
       WHERE status = 'sending' AND updated_at < $1 RETURNING id`, [new Date(t.getTime() - STUCK_SENDING_MS)]);
    for (const r of stuck) await logEvent(db, r.id, 'failed', 'system', { reason: 'interrupted while sending' });

    // Open emails whose recipient is no longer acceptable (the filter learned
    // a new ATS / automated sender, or it is your own address): cancel them.
    const { rows: open } = await db.query(
      `SELECT id, to_email FROM outbound_emails WHERE status IN ('draft','pending_approval','approved') AND to_email IS NOT NULL`);
    for (const r of open.filter(o => !isSendableAddress(o.to_email))) {
      const reason = isOwnAddress(r.to_email) ? 'Recipient is your own address' : 'Recipient is an automated or job-platform address';
      const { rowCount } = await db.query(
        `UPDATE outbound_emails SET status = 'cancelled', cancel_reason = $1, updated_at = NOW()
         WHERE id = $2 AND status IN ('draft','pending_approval','approved')`, [reason, r.id]);
      if (rowCount) await logEvent(db, r.id, 'cancelled', 'system', { reason, to: r.to_email });
    }

    const { rows: due } = await db.query(
      `SELECT id FROM outbound_emails WHERE status = 'approved' AND send_after <= $1 ORDER BY send_after LIMIT 5`, [t]);
    for (const { id } of due) {
      const r = await sendOne(id);
      if (r) results.push(r);
    }
    return { expired: expired.length, stuck: stuck.length, results };
  }

  async function list({ status } = {}) {
    const params = [];
    let where = '';
    if (status === 'open') where = `WHERE o.status IN ('draft','pending_approval','approved','sending')`;
    else if (status) { params.push(status); where = 'WHERE o.status = $1'; }
    const { rows } = await db.query(
      `SELECT o.*, a.company_name, a.job_title, a.status AS application_status
       FROM outbound_emails o JOIN applications a ON a.id = o.application_id
       ${where}
       ORDER BY CASE o.status WHEN 'pending_approval' THEN 0 WHEN 'draft' THEN 1 WHEN 'approved' THEN 2 WHEN 'sending' THEN 3 ELSE 4 END,
                o.updated_at DESC
       LIMIT 200`, params);
    return rows.map(({ approval_token_hash, ...r }) => r);
  }

  async function detail(id) {
    const { approval_token_hash, ...e } = await get(id);
    const { rows: events } = await db.query(
      'SELECT event, actor, detail, created_at FROM outbound_email_events WHERE outbound_email_id = $1 ORDER BY created_at, id', [id]);
    const { rows: [app] } = await db.query('SELECT company_name, job_title, status FROM applications WHERE id = $1', [e.application_id]);
    return { ...e, company_name: app?.company_name, job_title: app?.job_title, application_status: app?.status, events };
  }

  return {
    createFollowUpDraft, createManualDraft, requestApproval, update, polishExisting,
    approve, undo, skip, findByToken, tick, sendOne, list, detail,
  };
}

// ── default I/O (real SMTP / IMAP / your inbox) ──────────────────
function smtpTransport() {
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.NOTIFY_SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host: process.env.NOTIFY_SMTP_HOST || 'smtppro.zoho.eu', port, secure: port === 465,
    auth: { user: process.env.NOTIFY_EMAIL_USER, pass: process.env.NOTIFY_EMAIL_PASS },
  });
}

async function defaultSendMail(mail) {
  const MailComposer = require('nodemailer/lib/mail-composer');
  const raw = await new MailComposer(mail).compile().build();
  const info = await smtpTransport().sendMail({ envelope: { from: fromAddress(), to: [mail.to.replace(/^.*<|>$/g, '')] }, raw });
  return { messageId: mail.messageId, raw, response: info.response };
}

async function defaultAppendToSent(raw) {
  if (!process.env.IMAP_HOST) return;
  const { createClient } = require('./emailTracking/imapService');
  const client = createClient();
  await client.connect();
  try {
    const boxes = await client.list();
    const sent = boxes.find(b => b.specialUse === '\\Sent')?.path || 'Sent';
    await client.append(sent, raw, ['\\Seen']);
  } finally { await client.logout().catch(() => {}); }
}

async function defaultNotifyUser({ subject, html, text }) {
  await smtpTransport().sendMail({
    from: `"Portfolio Outbox" <${process.env.NOTIFY_EMAIL_USER}>`,
    to: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject, html, text,
  });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function approvalEmail(items) {
  const n = items.length;
  const subject = n === 1
    ? `Approve follow-up to ${items[0].app.company_name || 'a recruiter'}?`
    : `${n} follow-up emails waiting for your approval`;
  const cards = items.map(({ e, app, link }) => `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:18px;margin:0 0 16px">
      <p style="margin:0 0 4px;color:#a78bfa;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${esc(app.company_name)} — ${esc(app.job_title)}</p>
      <p style="margin:0 0 2px;color:#a1a1aa;font-size:13px"><b style="color:#e4e4e7">To:</b> ${esc(e.to_name ? `${e.to_name} <${e.to_email}>` : e.to_email)}</p>
      <p style="margin:0 0 12px;color:#a1a1aa;font-size:13px"><b style="color:#e4e4e7">Subject:</b> ${esc(e.subject)}</p>
      <div style="white-space:pre-wrap;color:#e4e4e7;font-size:14px;line-height:1.55;background:#09090b;border-radius:8px;padding:14px">${esc(e.body)}</div>
      <p style="margin:14px 0 0">
        <a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px;font-weight:600">Review &amp; send</a>
        <a href="${esc(`${adminBase()}/outbox?id=${e.id}`)}" style="display:inline-block;margin-left:8px;color:#c4b5fd;text-decoration:none;padding:9px 6px;font-size:14px">Edit in dashboard</a>
      </p>
    </div>`).join('');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;background:#09090b;padding:24px;border-radius:14px">
    <h2 style="color:#fff;margin:0 0 6px;font-size:19px">${esc(subject)}</h2>
    <p style="color:#a1a1aa;margin:0 0 20px;font-size:14px">Nothing is sent until you approve. Each link works once, for 72 hours, and stops working if the email is edited.</p>
    ${cards}
    <p style="color:#52525b;font-size:12px;margin:8px 0 0">Approved emails go out within working hours (Mon–Fri 09:00–18:00 Paris), with 5 minutes to undo.</p>
  </div>`;
  const text = items.map(({ e, app, link }) =>
    `${app.company_name} — ${app.job_title}\nTo: ${e.to_email}\nSubject: ${e.subject}\n\n${e.body}\n\nReview & send: ${link}\n`).join('\n────────\n');
  return { subject, html, text };
}

module.exports = {
  greetingName, isOwnAddress,
  createOutbox, nextSendTime, inWorkingHours, isSendableAddress, resolveRecipient, approvalEmail, esc,
};
