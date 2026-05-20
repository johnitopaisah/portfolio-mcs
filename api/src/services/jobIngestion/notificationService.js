'use strict';
/**
 * Job Notification Service
 * Single-user, personal job alert system.
 *
 * Design: daily digest at 08:15 Europe/Paris (15 min after visitor digest).
 * No per-job spam — one email per day with the top ranked new jobs.
 *
 * Channels: Email (Zoho SMTP — same transporter already used across the API)
 *           Telegram (optional, set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 */

const pool       = require('../../db/client');
const nodemailer = require('nodemailer');
const config     = require('./config');

// ── Singleton SMTP transport ──────────────────────────────────
// Created once, reused for all emails — avoids reopening a TCP connection
// per email (the old bug: transporter was created inside the send function).
let _transport = null;

function getTransport() {
  if (_transport) return _transport;
  const port = parseInt(process.env.NOTIFY_SMTP_PORT || '465', 10);
  _transport = nodemailer.createTransport({
    host:   process.env.NOTIFY_SMTP_HOST || 'smtppro.zoho.eu',
    port,
    secure: port === 465,
    auth:   {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_PASS,
    },
    // Keep the connection alive across multiple sends in one worker run
    pool:            true,
    maxConnections:  1,
    rateDelta:       2000,
    rateLimit:       3,
  });
  return _transport;
}

// ── Scheduler (same pattern as visitorDigest.js) ─────────────
function msUntilNext(hour, minute, timeZone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(p => [p.type, p.value])
  );
  const targetStr = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const localMidnight = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  const tzOffset = now.getTime() - localMidnight.getTime()
    - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000;
  let targetUtc = new Date(targetStr).getTime() - tzOffset;
  if (targetUtc <= now.getTime()) targetUtc += 24 * 60 * 60 * 1000;
  return targetUtc - now.getTime();
}

function scheduleDaily(fn, hour, minute, timeZone) {
  const delay = msUntilNext(hour, minute, timeZone);
  const hhmm  = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  console.log(`[JobDigest] Next digest scheduled in ${Math.round(delay / 60000)} min (${hhmm} ${timeZone})`);
  setTimeout(async () => {
    await fn();
    scheduleDaily(fn, hour, minute, timeZone); // reschedule for tomorrow
  }, delay);
}

function startDailyJobDigest() {
  // 08:15 Europe/Paris — 15 min after visitor digest, gives time to read both
  scheduleDaily(sendDailyJobDigest, 8, 15, 'Europe/Paris');
}

// ── Notification dedup ────────────────────────────────────────
// Prevents the same digest being sent twice in one day (e.g. if the admin
// manually triggers it while the scheduler has already fired).
async function wasNotificationSent(channel, alertKey, withinHours = 20) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM notification_log
       WHERE channel = $1 AND alert_key = $2
         AND sent_at > NOW() - INTERVAL '1 hour' * $3
       LIMIT 1`,
      [channel, alertKey, withinHours]
    );
    return result.rows.length > 0;
  } catch {
    return false; // table might not exist yet — fail open
  }
}

async function recordNotificationSent(channel, alertKey) {
  try {
    await pool.query(
      `INSERT INTO notification_log (channel, alert_key)
       VALUES ($1, $2)
       ON CONFLICT (channel, alert_key) DO UPDATE SET sent_at = NOW()`,
      [channel, alertKey]
    );
  } catch (err) {
    console.warn('[NotifLog] Could not record notification:', err.message);
  }
}

// ── DB queries ────────────────────────────────────────────────
const MIN_SCORE = config.notifications?.minRelevanceScore ?? 65;

async function getNewJobsSince(hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const result = await pool.query(
    `SELECT id, title, company_name, location, job_type,
            relevance_score, ai_decision, ai_reasoning,
            tech_stack, seniority_level, visa_sponsored,
            apply_url, posted_at, source_api
     FROM jobs
     WHERE is_active = TRUE
       AND ai_decision IN ('KEEP', 'REVIEW')
       AND relevance_score >= $1
       AND created_at >= $2
       -- Exclude jobs the user already actioned
       AND NOT EXISTS (
         SELECT 1 FROM job_feedback jf WHERE jf.job_id = jobs.id
       )
     ORDER BY relevance_score DESC, posted_at DESC
     LIMIT 20`,
    [MIN_SCORE, since]
  );
  return result.rows;
}

async function getAlertStats(hoursBack = 24) {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ai_decision = 'KEEP')   AS sent_keep,
       COUNT(*) FILTER (WHERE ai_decision = 'REVIEW') AS sent_review,
       0                                               AS failed
     FROM jobs
     WHERE created_at > NOW() - INTERVAL '1 hour' * $1`,
    [hoursBack]
  );
  return result.rows;
}

// ── Email builder ─────────────────────────────────────────────
function scoreBar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
}

function buildJobRow(job) {
  const badge    = job.ai_decision === 'KEEP' ? '🟢 KEEP' : '🟡 REVIEW';
  const visa     = job.visa_sponsored === true  ? ' · 🛂 Visa'
    : job.visa_sponsored === false ? ' · ❌ No visa' : '';
  const techs    = (job.tech_stack || []).slice(0, 6).join(' · ');
  const location = job.location || 'Remote';
  const postedAt = new Date(job.posted_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  });

  return `
  <tr>
    <td style="padding:16px 0;border-top:1px solid #27272a;vertical-align:top">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:${job.ai_decision === 'KEEP' ? 'rgba(34,197,94,.15)' : 'rgba(234,179,8,.15)'};color:${job.ai_decision === 'KEEP' ? '#22c55e' : '#eab308'};font-weight:600">${badge}</span>
        <span style="font-size:11px;color:#52525b">${postedAt}${visa}</span>
      </div>
      <div style="font-size:16px;font-weight:700;color:#f4f4f5;margin-bottom:2px">
        <a href="${job.apply_url}" style="color:#a78bfa;text-decoration:none">${job.title}</a>
      </div>
      <div style="font-size:13px;color:#a1a1aa;margin-bottom:6px">
        ${job.company_name} · ${location} · ${job.seniority_level || 'Mid'}
      </div>
      <div style="font-family:monospace;font-size:11px;color:#6366f1;margin-bottom:6px">
        ${scoreBar(job.relevance_score)}
      </div>
      ${techs ? `<div style="font-size:11px;color:#71717a">${techs}</div>` : ''}
      ${job.ai_reasoning ? `<div style="font-size:11px;color:#52525b;margin-top:4px;font-style:italic">${job.ai_reasoning}</div>` : ''}
      <a href="${job.apply_url}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:600;color:#a78bfa;text-decoration:none">Apply →</a>
    </td>
  </tr>`;
}

function buildHtml(jobs, dateStr, stats) {
  const jobRows    = jobs.map(buildJobRow).join('');
  const keepCount  = jobs.filter(j => j.ai_decision === 'KEEP').length;
  const reviewCount = jobs.filter(j => j.ai_decision === 'REVIEW').length;

  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#09090b;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 32px">
    <h2 style="color:#fff;margin:0;font-size:20px">💼 Daily Job Digest</h2>
    <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px">${dateStr} · claude-haiku-4-5-20251001 scored · johnisah.com jobs</p>
  </div>

  <div style="padding:24px 32px">
    <!-- Summary strip -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="text-align:center;padding:14px;background:#18181b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#a78bfa;font-size:26px;font-weight:700">${jobs.length}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">New jobs</div>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:14px;background:#18181b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#22c55e;font-size:26px;font-weight:700">${keepCount}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Strong match</div>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:14px;background:#18181b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#eab308;font-size:26px;font-weight:700">${reviewCount}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Worth review</div>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:14px;background:#18181b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#06b6d4;font-size:26px;font-weight:700">${stats.total_processed || 0}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Processed</div>
        </td>
      </tr>
    </table>

    ${jobs.length === 0
      ? `<p style="color:#52525b;text-align:center;padding:32px 0">No new relevant jobs in the last 24 hours.</p>`
      : `<p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px">Top matches — ranked by AI score</p>
         <table style="width:100%;border-collapse:collapse">${jobRows}</table>`
    }
  </div>

  <div style="background:#09090b;padding:14px 32px;border-top:1px solid #27272a;text-align:center">
    <p style="color:#3f3f46;font-size:12px;margin:0">Portfolio Job Digest · johnisah.com · powered by Claude claude-haiku-4-5-20251001</p>
  </div>
</div>`;
}

// ── Send digest ───────────────────────────────────────────────
async function sendDailyJobDigest() {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[JobDigest] Email env vars not set — skipping');
    return { sent: false };
  }

  // Dedup: skip if we already sent this digest today (within 20 hours)
  const todayKey = `job_digest:${new Date().toISOString().slice(0, 10)}`;
  if (await wasNotificationSent('email', todayKey, 20)) {
    console.log('[JobDigest] Already sent today — skipping duplicate');
    return { sent: false, reason: 'already_sent' };
  }

  try {
    const jobs = await getNewJobsSince(24);

    // Get total processed count for stats strip
    const statsRes = await pool.query(
      `SELECT COUNT(*) AS total_processed FROM jobs
       WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    const stats = { total_processed: parseInt(statsRes.rows[0].total_processed, 10) };

    const dateStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Europe/Paris',
    });

    const subject = jobs.length > 0
      ? `[Jobs] ${jobs.length} new matches today — top score ${jobs[0]?.relevance_score}/100`
      : `[Jobs] No new matches today — ${dateStr}`;

    await getTransport().sendMail({
      from:    `"Portfolio Jobs" <${process.env.NOTIFY_EMAIL_USER}>`,
      to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
      subject,
      html:    buildHtml(jobs, dateStr, stats),
      text:    [
        `Daily Job Digest — ${dateStr}`,
        ``,
        `${jobs.length} new relevant jobs (min score ${MIN_SCORE}):`,
        ``,
        ...jobs.map(j =>
          `[${j.relevance_score}/100] ${j.title} @ ${j.company_name} (${j.location})\n  ${j.apply_url}`
        ),
        ``,
        `Total processed today: ${stats.total_processed}`,
      ].join('\n'),
    });

    // Record email sent before attempting Telegram (so a Telegram failure
    // doesn't cause a duplicate email on the next trigger)
    await recordNotificationSent('email', todayKey);

    // Optionally send to Telegram
    if (jobs.length > 0) {
      const telegramKey = `job_digest_tg:${new Date().toISOString().slice(0, 10)}`;
      const tgAlreadySent = await wasNotificationSent('telegram', telegramKey, 20);
      if (!tgAlreadySent) {
        await sendTelegramDigest(jobs).catch(e =>
          console.warn('[JobDigest] Telegram failed:', e.message)
        );
        await recordNotificationSent('telegram', telegramKey);
      }
    }

    console.log(`[JobDigest] Sent — ${jobs.length} jobs, top score ${jobs[0]?.relevance_score ?? 'N/A'}`);
    return { sent: true, jobs: jobs.length };
  } catch (err) {
    console.error('[JobDigest] Failed:', err.message);
    return { sent: false, error: err.message };
  }
}

// ── Telegram digest ───────────────────────────────────────────
async function sendTelegramDigest(jobs) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const top5 = jobs.slice(0, 5);
  const lines = top5.map((j, i) =>
    `${i + 1}. <b><a href="${j.apply_url}">${j.title}</a></b>\n` +
    `   ${j.company_name} · ${j.location}\n` +
    `   Score: ${j.relevance_score}/100 · ${j.seniority_level || 'Mid'}`
  );

  const msg = [
    `💼 <b>Job Digest — ${top5.length} top matches</b>`,
    ``,
    ...lines,
    ``,
    `<i>Full digest sent to email</i>`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
    signal:  AbortSignal.timeout(8000),
  });
}

// ── Per-run digest (called from jobWorker after every successful run) ────────
// Sends a digest of jobs ingested in the last `hoursBack` hours.
// Dedup window is 2 hours (prevents double-send on CronJob retries without
// blocking the next scheduled run 8 hours later).
async function sendWorkerRunDigest(hoursBack = 8) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[JobDigest] Email env vars not set — skipping');
    return { sent: false };
  }

  // Key scoped to the current hour — allows one send per run, blocks retries
  const runHour = new Date().toISOString().slice(0, 13); // "2026-05-18T10"
  const runKey  = `job_run_digest:${runHour}`;
  if (await wasNotificationSent('email', runKey, 2)) {
    console.log('[JobDigest] Already sent this run hour — skipping duplicate');
    return { sent: false, reason: 'already_sent' };
  }

  try {
    const jobs = await getNewJobsSince(hoursBack);

    if (jobs.length === 0) {
      console.log('[JobDigest] No new relevant jobs this run — skipping');
      return { sent: false, reason: 'no_new_jobs' };
    }

    const statsRes = await pool.query(
      `SELECT COUNT(*) AS total_processed FROM jobs
       WHERE created_at > NOW() - INTERVAL '1 hour' * $1`,
      [hoursBack]
    );
    const stats = { total_processed: parseInt(statsRes.rows[0].total_processed, 10) };

    const now     = new Date();
    const dateStr = now.toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    }) + ' (Paris)';

    const subject = `[Jobs] ${jobs.length} new match${jobs.length !== 1 ? 'es' : ''} · top score ${jobs[0]?.relevance_score}/100 · ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}`;

    await getTransport().sendMail({
      from:    `"Portfolio Jobs" <${process.env.NOTIFY_EMAIL_USER}>`,
      to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
      subject,
      html:    buildHtml(jobs, dateStr, stats),
      text:    [
        `Job Digest — ${dateStr}`,
        `${jobs.length} new relevant jobs (min score ${MIN_SCORE}, last ${hoursBack}h):`,
        ``,
        ...jobs.map(j =>
          `[${j.relevance_score}/100] ${j.title} @ ${j.company_name} (${j.location})\n  ${j.apply_url}`
        ),
        ``,
        `Total processed this run: ${stats.total_processed}`,
      ].join('\n'),
    });

    await recordNotificationSent('email', runKey);

    // Telegram (optional)
    const tgKey = `job_run_digest_tg:${runHour}`;
    if (!await wasNotificationSent('telegram', tgKey, 2)) {
      await sendTelegramDigest(jobs).catch(e =>
        console.warn('[JobDigest] Telegram failed:', e.message)
      );
      await recordNotificationSent('telegram', tgKey);
    }

    console.log(`[JobDigest] Run digest sent — ${jobs.length} jobs, top score ${jobs[0]?.relevance_score ?? 'N/A'}`);
    return { sent: true, jobs: jobs.length };
  } catch (err) {
    console.error('[JobDigest] Run digest failed:', err.message);
    return { sent: false, error: err.message };
  }
}

// ── Manual trigger (called from admin API route) ──────────────
async function sendNewJobAlerts() {
  return sendDailyJobDigest();
}

// ── Generic notification (used by followUpWorker and other workers) ──
// Thin wrapper over the existing singleton transport — no duplicate SMTP setup.
async function sendNotification({ subject, html }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[notify] Email env vars not set — skipping notification');
    return;
  }
  await getTransport().sendMail({
    from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  });
  console.log(`[notify] Notification sent — subject: ${subject}`);
}

module.exports = {
  startDailyJobDigest,
  sendDailyJobDigest,
  sendWorkerRunDigest,
  sendNewJobAlerts,
  getAlertStats,
  sendNotification,
};
