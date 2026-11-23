'use strict';
/**
 * CV requests — the CV is emailed instead of downloaded.
 *
 *   request()   public: validate → limits → email the PDF → record → notify you
 *   list(), stats(), update(), remove()   admin dashboard
 *   retention() daily: clear optional details after 90 days, anonymise after 12 months
 *
 * Limits (stored in Postgres, so they hold across API pods):
 *   - 3 requests per hour from one visitor (salted IP hash; the IP itself is never stored)
 *   - the same email + language is sent once per 24 h ("already sent")
 *   - at most CV_DAILY_CAP (30) emails per day overall
 * Dependencies are injectable for tests (createCvRequests({ sendMail, notifyOwner, geoip, getCvPdf, now })).
 */
const crypto = require('crypto');
const pool   = require('../db/client');

const EMAIL_RE       = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const PER_IP_HOUR    = 3;
const DAILY_CAP      = parseInt(process.env.CV_DAILY_CAP || '30', 10);
const DETAILS_DAYS   = 90;
const ANONYMISE_DAYS = 365;
const ROLES          = ['recruiter', 'hiring_manager', 'other'];
const SOURCES        = ['hero', 'navbar', 'mobile-menu', 'blog', 'other'];
const DISPOSABLE     = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', '10minutemail.com',
  'temp-mail.org', 'tempmail.com', 'tempmail.dev', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'mailnesia.com', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'mohmal.com', 'tempail.com']);

const fail = (status, error, extra = {}) => Object.assign(new Error(error), { status, ...extra });
const clip = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const esc  = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flag = cc => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '');

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.CV_IP_SALT || process.env.JWT_SECRET || 'cv-requests';
  return crypto.createHmac('sha256', salt).update(String(ip)).digest('hex').slice(0, 32);
}

// ── default I/O ──────────────────────────────────────────────────
function transport() {
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.NOTIFY_SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host: process.env.NOTIFY_SMTP_HOST || 'smtppro.zoho.eu', port, secure: port === 465,
    auth: { user: process.env.NOTIFY_EMAIL_USER, pass: process.env.NOTIFY_EMAIL_PASS },
  });
}
async function defaultSendMail(mail) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) throw new Error('Email is not configured');
  return transport().sendMail(mail);
}
async function defaultNotifyOwner({ subject, html, text, replyTo }) {
  const to = process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER;
  if (!to) return;
  await defaultSendMail({ from: `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`, to, replyTo, subject, html, text });
}

// ── emails ───────────────────────────────────────────────────────
function visitorEmail({ lang, displayName, name }) {
  const fr = lang === 'fr';
  const hi = name ? (fr ? `Bonjour ${name},` : `Hi ${name},`) : (fr ? 'Bonjour,' : 'Hello,');
  const body = fr
    ? ['Merci de votre intérêt. Vous trouverez mon CV en pièce jointe (version française).',
       "N'hésitez pas à répondre directement à cet e-mail si vous souhaitez échanger.", '', 'Bien cordialement,', displayName]
    : ['Thank you for your interest. My CV is attached (English version).',
       'Feel free to reply to this email if you would like to talk.', '', 'Best regards,', displayName];
  const text = [hi, '', ...body].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:560px">
    <p>${esc(hi)}</p>${body.filter(Boolean).map(l => `<p style="margin:0 0 10px">${esc(l)}</p>`).join('')}
    <p style="font-size:12px;color:#6b7280;margin-top:24px">${fr
      ? 'Vous recevez cet e-mail parce que vous avez demandé mon CV sur johnisah.com. Pour faire supprimer vos données, répondez simplement à cet e-mail.'
      : 'You received this because you requested my CV on johnisah.com. To have your details deleted, just reply to this email.'}</p></div>`;
  return { subject: `CV — ${displayName}`, text, html };
}

function ownerEmail(r, match) {
  const who = [r.name, r.company && `(${r.company})`].filter(Boolean).join(' ') || r.email;
  const where = [r.city, r.region, r.country].filter(Boolean).join(', ') || 'Unknown location';
  const roleLabel = { recruiter: 'Recruiter', hiring_manager: 'Hiring manager', other: 'Other' }[r.requester_role] || '—';
  const rows = [
    ['Email', r.email], ['Name', r.name || '—'], ['Company', r.company || '—'], ['Role', roleLabel],
    ['Language', r.language === 'fr' ? 'French' : 'English'], ['Location', `${flag(r.country_code)} ${where}`.trim()],
    ['Device', [r.device, r.browser, r.os].filter(Boolean).join(' · ') || '—'], ['From', r.source || '—'],
  ];
  const admin = (process.env.ADMIN_URL || 'https://admin.johnisah.com').replace(/\/$/, '');
  const matchLine = match ? `In your pipeline: ${match.company_name} — ${match.job_title} (${match.status.replace(/_/g, ' ').toLowerCase()})` : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
    <div style="background:#7c3aed;padding:18px 24px;border-radius:12px 12px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">📄 ${esc(who)} received your CV</h2></div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px">
      ${matchLine ? `<p style="background:#ede9fe;color:#5b21b6;padding:8px 12px;border-radius:8px;margin:0 0 14px">⭐ ${esc(matchLine)}</p>` : ''}
      <table style="font-size:14px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#6b7280;padding:3px 14px 3px 0">${k}</td><td style="color:#111827">${esc(v)}</td></tr>`).join('')}</table>
      <p style="margin:18px 0 0"><a href="mailto:${esc(r.email)}" style="background:#7c3aed;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Reply</a>
      &nbsp;<a href="${esc(`${admin}/cv-requests`)}" style="color:#7c3aed">Open CV Requests</a></p></div></div>`;
  const text = `${who} received your CV (${r.language.toUpperCase()}).\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${matchLine ? `\n${matchLine}` : ''}\n${admin}/cv-requests`;
  return { subject: `📄 CV requested by ${who} — ${r.language === 'fr' ? 'French' : 'English'}`, html, text, replyTo: r.email };
}

// ── factory ──────────────────────────────────────────────────────
function createCvRequests({
  db = pool,
  now = () => new Date(),
  sendMail = defaultSendMail,
  notifyOwner = defaultNotifyOwner,
  geoip = (ip) => require('./geoip').geoip(ip),
  getCvPdf = (lang) => require('./cvFile').getCvPdf(lang),
} = {}) {

  async function pipelineMatch(domain) {
    if (!domain) return null;
    const { isAtsDomain } = require('./emailTracking/applicationMatchingService');
    if (isAtsDomain(domain) || /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|gmx|orange|free|laposte|wanadoo|sfr)\./.test(domain)) return null;
    const { rows } = await db.query(`
      SELECT a.id, a.company_name, a.job_title, a.status FROM applications a
      WHERE a.status <> 'ARCHIVED' AND (
        EXISTS (SELECT 1 FROM application_contacts c WHERE c.application_id = a.id AND lower(split_part(c.email, '@', 2)) = $1)
        OR EXISTS (SELECT 1 FROM email_responses e WHERE e.application_id = a.id AND lower(split_part(e.sender_email, '@', 2)) = $1))
      ORDER BY a.updated_at DESC LIMIT 1`, [domain]);
    return rows[0] || null;
  }

  /**
   * @param body  { email, language, name?, company?, role?, consent, source?, website? (honeypot) }
   * @param ctx   { ip, userAgent, referrer, countryCode }  (from the request)
   */
  async function request(body = {}, ctx = {}) {
    if (body.website) throw fail(400, 'Invalid request');                                  // honeypot (bots fill every field)
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(email)) throw fail(400, 'Please enter a valid email address.');
    const domain = email.split('@')[1];
    if (DISPOSABLE.has(domain)) throw fail(400, 'Please use a permanent email address.');
    const language = body.language === 'fr' ? 'fr' : body.language === 'en' ? 'en' : null;
    if (!language) throw fail(400, 'Choose English or French.');
    if (body.consent !== true) throw fail(400, 'Please accept that your email is used to send the CV.');
    const role = ROLES.includes(body.role) ? body.role : null;
    const source = SOURCES.includes(body.source) ? body.source : 'other';
    const t = now();
    const ipHash = hashIp(ctx.ip);

    // limits
    const { rows: [lim] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE ip_hash = $1 AND created_at > $3::timestamptz - INTERVAL '1 hour')::int AS per_ip,
        COUNT(*) FILTER (WHERE lower(email) = $2 AND language = $4 AND status = 'sent'
                           AND created_at > $3::timestamptz - INTERVAL '24 hours')::int AS same,
        COUNT(*) FILTER (WHERE status = 'sent' AND created_at > $3::timestamptz - INTERVAL '24 hours')::int AS today
      FROM cv_requests WHERE created_at > $3::timestamptz - INTERVAL '24 hours'`, [ipHash, email, t, language]);
    if (lim.same > 0) return { status: 'already_sent', email, language };
    if (ipHash && lim.per_ip >= PER_IP_HOUR) throw fail(429, 'Too many requests — please try again in an hour.');
    if (lim.today >= DAILY_CAP) throw fail(429, 'The CV can’t be sent right now — please try again tomorrow or use the contact form.');

    const geo = await geoip(ctx.ip).catch(() => ({}));
    const pv = require('./parseVisitor');
    const ua = ctx.userAgent || '';
    const rec = {
      email, email_domain: domain, name: clip(body.name, 120), company: clip(body.company, 160), requester_role: role,
      language, source, consent_at: t, ip_hash: ipHash,
      country: geo.country && geo.country !== 'Local' ? geo.country : null,
      country_code: (ctx.countryCode || '').toUpperCase().slice(0, 2) || null,
      region: geo.region || null, city: geo.city && geo.city !== 'Local' ? geo.city : null,
      device: pv.parseDevice(ua) || null, browser: pv.parseBrowser(ua) || null, os: pv.parseOs(ua) || null,
      referrer: ctx.referrer ? pv.labelReferer(ctx.referrer) : null,
    };
    const match = await pipelineMatch(domain).catch(() => null);

    // send the CV
    const { rows: [profile] } = await db.query('SELECT name, cv_display_name FROM profile LIMIT 1');
    const displayName = profile?.cv_display_name || profile?.name || 'John Itopa ISAH';
    let status = 'sent', error = null, messageId = null;
    try {
      const pdf = await getCvPdf(language);
      const m = visitorEmail({ lang: language, displayName, name: rec.name });
      const info = await sendMail({
        from: `"${displayName.replace(/"/g, '')}" <${process.env.NOTIFY_EMAIL_USER}>`,
        to: email, subject: m.subject, text: m.text, html: m.html,
        attachments: [{ filename: `${displayName.replace(/[^\w.-]+/g, '_')}_CV_${language.toUpperCase()}.pdf`, content: pdf.buffer, contentType: pdf.mime }],
      });
      messageId = info?.messageId || null;
    } catch (err) {
      status = 'failed'; error = String(err.message || err).slice(0, 300);
      console.error('[CvRequest] send failed:', error);
    }

    const { rows: [row] } = await db.query(`
      INSERT INTO cv_requests (email, email_domain, name, company, requester_role, language, source, status, error, message_id,
        consent_at, ip_hash, country, country_code, region, city, device, browser, os, referrer, matched_application_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [rec.email, rec.email_domain, rec.name, rec.company, rec.requester_role, rec.language, rec.source, status, error, messageId,
       rec.consent_at, rec.ip_hash, rec.country, rec.country_code, rec.region, rec.city, rec.device, rec.browser, rec.os, rec.referrer,
       match?.id || null, t]);

    if (status === 'failed') throw fail(502, 'Sorry — the email could not be sent. Please try again in a few minutes.');
    notifyOwner(ownerEmail(row, match)).catch(err => console.error('[CvRequest] owner notification failed:', err.message));
    return { status: 'sent', email, language };
  }

  // ── admin ──────────────────────────────────────────────────────
  const RANGE = { '7d': 7, '30d': 30, '90d': 90, '365d': 365, all: 3650 };
  async function list({ range = '90d', language, country, limit = 200 } = {}) {
    const days = RANGE[range] || 90;
    const p = [days]; let where = `r.created_at > NOW() - make_interval(days => $1)`;
    if (language === 'en' || language === 'fr') { p.push(language); where += ` AND r.language = $${p.length}`; }
    if (country) { p.push(String(country).slice(0, 80)); where += ` AND r.country = $${p.length}`; }
    p.push(Math.min(500, limit));
    const { rows } = await db.query(`
      SELECT r.id, r.email, r.name, r.company, r.requester_role, r.language, r.source, r.status, r.error,
             r.country, r.country_code, r.region, r.city, r.device, r.browser, r.os, r.referrer,
             r.matched_application_id, a.company_name AS matched_company, r.contacted_at, r.notes, r.anonymised_at, r.created_at
      FROM cv_requests r LEFT JOIN applications a ON a.id = r.matched_application_id
      WHERE ${where}
      ORDER BY r.created_at DESC LIMIT $${p.length}`, p);
    return rows;
  }

  async function stats({ range = '90d' } = {}) {
    const days = RANGE[range] || 90;
    const q = (sql, extra = []) => db.query(sql, [days, ...extra]).then(r => r.rows);
    const W = `status = 'sent' AND created_at > NOW() - make_interval(days => $1)`;
    const group = col => q(`SELECT COALESCE(${col}, 'Unknown') AS label, COUNT(*)::int AS n FROM cv_requests WHERE ${W} GROUP BY 1 ORDER BY n DESC, label LIMIT 12`);
    const [[totals], daily, countries, regions, cities, roles, devices, browsers, sources, referrers, companies, hours] = await Promise.all([
      q(`SELECT COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(DISTINCT lower(email)) FILTER (WHERE status = 'sent')::int AS unique_people,
                COUNT(*) FILTER (WHERE status = 'sent' AND language = 'en')::int AS en,
                COUNT(*) FILTER (WHERE status = 'sent' AND language = 'fr')::int AS fr,
                COUNT(*) FILTER (WHERE status = 'sent' AND matched_application_id IS NOT NULL)::int AS from_pipeline,
                COUNT(*) FILTER (WHERE status = 'sent' AND contacted_at IS NOT NULL)::int AS contacted,
                COUNT(*) FILTER (WHERE status = 'sent' AND created_at > NOW() - INTERVAL '7 days')::int AS last_7d,
                COUNT(*) FILTER (WHERE status = 'sent' AND created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days')::int AS prev_7d
         FROM cv_requests WHERE created_at > NOW() - make_interval(days => $1)`),
      q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
                COUNT(r.id) FILTER (WHERE r.language = 'en')::int AS en,
                COUNT(r.id) FILTER (WHERE r.language = 'fr')::int AS fr
         FROM generate_series(date_trunc('day', NOW() AT TIME ZONE 'Europe/Paris') - make_interval(days => LEAST($1, 365) - 1),
                              date_trunc('day', NOW() AT TIME ZONE 'Europe/Paris'), INTERVAL '1 day') d
         LEFT JOIN cv_requests r ON r.status = 'sent' AND date_trunc('day', r.created_at AT TIME ZONE 'Europe/Paris') = d
         GROUP BY d ORDER BY d`),
      q(`SELECT COALESCE(country, 'Unknown') AS label, MAX(country_code) AS code, COUNT(*)::int AS n FROM cv_requests WHERE ${W} GROUP BY 1 ORDER BY n DESC, label LIMIT 15`),
      q(`SELECT COALESCE(NULLIF(concat_ws(', ', region, country), ''), 'Unknown') AS label, COUNT(*)::int AS n FROM cv_requests WHERE ${W} GROUP BY 1 ORDER BY n DESC, label LIMIT 12`),
      q(`SELECT COALESCE(NULLIF(concat_ws(', ', city, country), ''), 'Unknown') AS label, COUNT(*)::int AS n FROM cv_requests WHERE ${W} GROUP BY 1 ORDER BY n DESC, label LIMIT 12`),
      group('requester_role'), group('device'), group('browser'), group('source'), group('referrer'),
      q(`SELECT COALESCE(company, email_domain, 'Unknown') AS label, COUNT(*)::int AS n FROM cv_requests WHERE ${W} AND (company IS NOT NULL OR email_domain IS NOT NULL) GROUP BY 1 ORDER BY n DESC, label LIMIT 10`),
      q(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Paris')::int AS hour, COUNT(*)::int AS n FROM cv_requests WHERE ${W} GROUP BY 1 ORDER BY 1`),
    ]);
    return { range, totals, daily, countries, regions, cities, roles, devices, browsers, sources, referrers, companies, hours };
  }

  async function update(id, { contacted, notes } = {}) {
    const sets = [], p = [];
    if (contacted !== undefined) { p.push(contacted ? now() : null); sets.push(`contacted_at = $${p.length}`); }
    if (notes !== undefined) { p.push(clip(notes, 2000)); sets.push(`notes = $${p.length}`); }
    if (!sets.length) throw fail(400, 'Nothing to update');
    p.push(id);
    const { rows } = await db.query(`UPDATE cv_requests SET ${sets.join(', ')} WHERE id = $${p.length} RETURNING id, contacted_at, notes`, p);
    if (!rows.length) throw fail(404, 'Not found');
    return rows[0];
  }

  /** Delete on request (GDPR): every request from this email. */
  async function remove(id) {
    const { rows } = await db.query('SELECT email FROM cv_requests WHERE id = $1', [id]);
    if (!rows.length) throw fail(404, 'Not found');
    const { rowCount } = rows[0].email
      ? await db.query('DELETE FROM cv_requests WHERE lower(email) = lower($1)', [rows[0].email])
      : await db.query('DELETE FROM cv_requests WHERE id = $1', [id]);
    return { deleted: rowCount };
  }

  async function retention() {
    const t = now();
    const cleared = await db.query(`
      UPDATE cv_requests SET name = NULL, company = NULL, requester_role = NULL, notes = NULL, details_cleared_at = $1
      WHERE details_cleared_at IS NULL AND created_at < $1::timestamptz - make_interval(days => $2)`, [t, DETAILS_DAYS]);
    const anonymised = await db.query(`
      UPDATE cv_requests SET email = NULL, ip_hash = NULL, message_id = NULL, error = NULL, city = NULL, anonymised_at = $1
      WHERE anonymised_at IS NULL AND created_at < $1::timestamptz - make_interval(days => $2)`, [t, ANONYMISE_DAYS]);
    return { cleared: cleared.rowCount, anonymised: anonymised.rowCount };
  }

  return { request, list, stats, update, remove, retention };
}

module.exports = { createCvRequests, hashIp, visitorEmail, ownerEmail, DISPOSABLE };
