'use strict';
// ============================================================
//  Daily Visitor Digest — scheduled email sent at 08:00 Paris time.
//  Uses a lightweight setTimeout loop (no extra npm package).
//  Called once from index.js on server start.
// ============================================================

const nodemailer = require('nodemailer');
const pool       = require('../db/client');

// ── Schedule helper ───────────────────────────────────────────
// Returns ms until the next HH:MM in the given IANA timezone.
function msUntilNext(hour, minute, timeZone) {
  const now     = new Date();
  const nowMs   = now.getTime();

  // Build a Date for today's target time in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map(p => [p.type, p.value])
  );

  // Construct target as a local Date (will be in UTC internally)
  const targetStr = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;

  // Parse as if it's in the target timezone by finding the UTC offset
  const localMidnight = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  const tzOffset      = now.getTime() - localMidnight.getTime()
    - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000;

  const targetLocal = new Date(targetStr).getTime();
  let targetUtc = targetLocal - tzOffset;

  // If it's already past today's target, schedule for tomorrow
  if (targetUtc <= nowMs) targetUtc += 24 * 60 * 60 * 1000;

  return targetUtc - nowMs;
}

function scheduleDaily(fn, hour, minute, timeZone) {
  const delay = msUntilNext(hour, minute, timeZone);
  const hhmm  = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  console.log(`[digest] Next visitor digest scheduled in ${Math.round(delay/60000)} min (${hhmm} ${timeZone})`);

  setTimeout(async () => {
    await fn();
    // Reschedule for tomorrow (recursive)
    scheduleDaily(fn, hour, minute, timeZone);
  }, delay);
}

// ── Email transport ───────────────────────────────────────────
function createTransport() {
  const port = parseInt(process.env.NOTIFY_SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host:   process.env.NOTIFY_SMTP_HOST || 'smtppro.zoho.eu',
    port,
    secure: port === 465,
    auth:   { user: process.env.NOTIFY_EMAIL_USER, pass: process.env.NOTIFY_EMAIL_PASS },
  });
}

// ── Query helpers ─────────────────────────────────────────────
async function getStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalRes, uniqueRes, countryRes, refererRes, deviceRes, hourRes, botRes, allTimeRes,
  ] = await Promise.all([
    // Total real visits today
    pool.query(
      `SELECT COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot`,
      [since]
    ),
    // Unique sessions today
    pool.query(
      `SELECT COUNT(DISTINCT COALESCE(session_id, ip_address)) AS n FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot`,
      [since]
    ),
    // Top countries
    pool.query(
      `SELECT COALESCE(country, country_code, 'Unknown') AS label, COUNT(*) AS n
       FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot
       GROUP BY label ORDER BY n DESC LIMIT 6`,
      [since]
    ),
    // Top referrers
    pool.query(
      `SELECT COALESCE(referer_label, 'Direct') AS label, COUNT(*) AS n
       FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot
       GROUP BY label ORDER BY n DESC LIMIT 6`,
      [since]
    ),
    // Device breakdown
    pool.query(
      `SELECT COALESCE(device_type, 'desktop') AS label, COUNT(*) AS n
       FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot
       GROUP BY label ORDER BY n DESC`,
      [since]
    ),
    // Peak hour
    pool.query(
      `SELECT date_trunc('hour', visited_at AT TIME ZONE 'Europe/Paris') AS hour, COUNT(*) AS n
       FROM visitor_logs WHERE visited_at >= $1 AND NOT is_bot
       GROUP BY hour ORDER BY n DESC LIMIT 1`,
      [since]
    ),
    // Bots filtered today
    pool.query(
      `SELECT COUNT(*) AS n FROM visitor_logs WHERE visited_at >= $1 AND is_bot`,
      [since]
    ),
    // All-time total
    pool.query(`SELECT COUNT(*) AS n FROM visitor_logs WHERE NOT is_bot`),
  ]);

  return {
    total:    parseInt(totalRes.rows[0]?.n   || 0),
    unique:   parseInt(uniqueRes.rows[0]?.n  || 0),
    bots:     parseInt(botRes.rows[0]?.n     || 0),
    allTime:  parseInt(allTimeRes.rows[0]?.n || 0),
    countries: countryRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
    referrers: refererRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
    devices:   deviceRes.rows.map(r => ({ label: r.label, n: parseInt(r.n) })),
    peakHour:  hourRes.rows[0]
      ? `${new Date(hourRes.rows[0].hour).getHours()}:00–${new Date(hourRes.rows[0].hour).getHours() + 1}:00 (${hourRes.rows[0].n} visits)`
      : 'N/A',
  };
}

// ── Flag map ──────────────────────────────────────────────────
const FLAG = {
  'France':'🇫🇷','Nigeria':'🇳🇬','United Kingdom':'🇬🇧','United States':'🇺🇸',
  'Germany':'🇩🇪','Canada':'🇨🇦','Netherlands':'🇳🇱','Sweden':'🇸🇪',
  'Norway':'🇳🇴','Denmark':'🇩🇰','Switzerland':'🇨🇭','Belgium':'🇧🇪',
  'Ghana':'🇬🇭','South Africa':'🇿🇦','Kenya':'🇰🇪','India':'🇮🇳',
  'Australia':'🇦🇺','Japan':'🇯🇵','Brazil':'🇧🇷','Spain':'🇪🇸',
  'Italy':'🇮🇹','Portugal':'🇵🇹','Poland':'🇵🇱','Ukraine':'🇺🇦',
  'Singapore':'🇸🇬','United Arab Emirates':'🇦🇪','Local':'🏠',
};
function flag(country) { return FLAG[country] || '🌍'; }

// ── Device icon ───────────────────────────────────────────────
function deviceIcon(d) {
  return d === 'mobile' ? '📱' : d === 'tablet' ? '⬛' : '💻';
}

// ── Build HTML email ──────────────────────────────────────────
function buildHtml(stats, dateStr) {
  const noVisits = stats.total === 0;

  const countryRows = stats.countries.map(c =>
    `<tr style="border-top:1px solid #27272a">
      <td style="padding:8px 0;color:#a1a1aa;font-size:13px">${flag(c.label)} ${c.label}</td>
      <td style="padding:8px 0;color:#f4f4f5;font-size:13px;text-align:right;font-weight:600">${c.n}</td>
    </tr>`
  ).join('') || `<tr><td colspan="2" style="color:#52525b;font-size:13px;padding:8px 0">No data</td></tr>`;

  const refererRows = stats.referrers.map(r =>
    `<tr style="border-top:1px solid #27272a">
      <td style="padding:8px 0;color:#a1a1aa;font-size:13px">${r.label}</td>
      <td style="padding:8px 0;color:#f4f4f5;font-size:13px;text-align:right;font-weight:600">${r.n}</td>
    </tr>`
  ).join('') || `<tr><td colspan="2" style="color:#52525b;font-size:13px;padding:8px 0">No data</td></tr>`;

  const deviceRows = stats.devices.map(d =>
    `<tr style="border-top:1px solid #27272a">
      <td style="padding:8px 0;color:#a1a1aa;font-size:13px">${deviceIcon(d.label)} ${d.label}</td>
      <td style="padding:8px 0;color:#f4f4f5;font-size:13px;text-align:right;font-weight:600">${d.n}</td>
    </tr>`
  ).join('') || `<tr><td colspan="2" style="color:#52525b;font-size:13px;padding:8px 0">No data</td></tr>`;

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:20px">📊 Daily Visitor Report</h2>
    <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px">${dateStr} · johnisah.com</p>
  </div>

  <div style="background:#18181b;padding:28px 32px;border:1px solid #27272a;border-top:none">

    ${noVisits ? `<p style="color:#71717a;font-size:14px;text-align:center;padding:24px 0">No visitors recorded in the last 24 hours.</p>` : ''}

    <!-- Summary strip -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr>
        <td style="text-align:center;padding:16px;background:#09090b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#a78bfa;font-size:28px;font-weight:700">${stats.total}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Total visits</div>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:16px;background:#09090b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#06b6d4;font-size:28px;font-weight:700">${stats.unique}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">Unique sessions</div>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:16px;background:#09090b;border-radius:8px;border:1px solid #27272a">
          <div style="color:#22c55e;font-size:28px;font-weight:700">${stats.allTime.toLocaleString()}</div>
          <div style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px">All-time total</div>
        </td>
      </tr>
    </table>

    <!-- Countries -->
    <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px">Top countries</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${countryRows}</table>

    <!-- Referrers -->
    <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px">Traffic sources</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${refererRows}</table>

    <!-- Devices -->
    <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px">Devices</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${deviceRows}</table>

    <!-- Footer stats -->
    <div style="background:#09090b;border:1px solid #27272a;border-radius:8px;padding:16px 20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="color:#71717a;font-size:12px;padding:4px 0">Peak hour (Paris time)</td>
          <td style="color:#a1a1aa;font-size:12px;text-align:right">${stats.peakHour}</td>
        </tr>
        <tr style="border-top:1px solid #27272a">
          <td style="color:#71717a;font-size:12px;padding:4px 0">Bots filtered</td>
          <td style="color:#a1a1aa;font-size:12px;text-align:right">${stats.bots}</td>
        </tr>
      </table>
    </div>
  </div>

  <div style="background:#09090b;padding:14px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center">
    <p style="color:#3f3f46;font-size:12px;margin:0">Portfolio Notifications · johnisah.com</p>
  </div>
</div>`;
}

// ── Send digest ───────────────────────────────────────────────
async function sendDailyDigest() {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[digest] Email env vars not set — skipping daily digest');
    return;
  }

  try {
    const stats   = await getStats();
    const dateStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Europe/Paris',
    });

    await createTransport().sendMail({
      from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
      to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
      subject: `[Portfolio] ${stats.total} visit${stats.total !== 1 ? 's' : ''} today — ${new Date().toLocaleDateString('en-GB')}`,
      html:    buildHtml(stats, dateStr),
      text:    [
        `Daily Visitor Report — ${dateStr}`,
        ``,
        `Total visits: ${stats.total}`,
        `Unique sessions: ${stats.unique}`,
        `All-time total: ${stats.allTime}`,
        `Bots filtered: ${stats.bots}`,
        `Peak hour: ${stats.peakHour}`,
        ``,
        `Countries: ${stats.countries.map(c => `${c.label} (${c.n})`).join(', ') || 'none'}`,
        `Sources: ${stats.referrers.map(r => `${r.label} (${r.n})`).join(', ') || 'none'}`,
        `Devices: ${stats.devices.map(d => `${d.label} (${d.n})`).join(', ') || 'none'}`,
      ].join('\n'),
    });

    console.log(`[digest] Daily report sent — ${stats.total} visits, ${stats.unique} unique`);
  } catch (err) {
    console.error('[digest] Failed to send daily digest:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────
function startDailyDigest() {
  // Send at 08:00 Europe/Paris every day
  scheduleDaily(sendDailyDigest, 8, 0, 'Europe/Paris');
}

module.exports = { startDailyDigest, sendDailyDigest };
