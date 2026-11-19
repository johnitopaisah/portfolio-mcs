'use strict';
/**
 * Shared rules for the scheduled digest emails (visitor report, job matches).
 *
 *   digestPlan()   — honours Goals → Notification Preferences → Digest schedule:
 *                      daily  → every day, last 24 hours
 *                      weekly → Mondays only (Paris time), last 7 days
 *                      off    → never
 *   claimDigest()  — every API pod runs the same in-process scheduler (2–10
 *                    pods under the HPA), which used to send one copy per pod.
 *                    The first pod to insert the (channel, key) row into
 *                    notification_log — unique index — sends; the rest skip.
 *                    Uses Postgres, so it works even when Redis is down.
 */

const pool = require('../db/client');

const TZ = 'Europe/Paris';

function parisParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday };   // weekday: 'Mon'…'Sun'
}

async function getDigestSchedule(db = pool) {
  try {
    const { rows } = await db.query('SELECT digest_schedule FROM user_settings LIMIT 1');
    return ['daily', 'weekly', 'off'].includes(rows[0]?.digest_schedule) ? rows[0].digest_schedule : 'daily';
  } catch {
    return 'daily';   // column missing (migration not applied yet) — previous behaviour
  }
}

/** @returns {Promise<{ send: boolean, schedule: string, hours?: number, period?: 'daily'|'weekly', reason?: string }>} */
async function digestPlan({ now = new Date(), db = pool } = {}) {
  const schedule = await getDigestSchedule(db);
  if (schedule === 'off') return { send: false, schedule, reason: 'digests are turned off' };
  if (schedule === 'weekly') {
    if (parisParts(now).weekday !== 'Mon') return { send: false, schedule, reason: 'weekly digest goes out on Mondays' };
    return { send: true, schedule, hours: 24 * 7, period: 'weekly' };
  }
  return { send: true, schedule, hours: 24, period: 'daily' };
}

/** true for exactly one caller per (name, Paris date). */
async function claimDigest(name, { now = new Date(), db = pool } = {}) {
  const key = `${name}:${parisParts(now).date}`;
  const { rows } = await db.query(
    `INSERT INTO notification_log (channel, alert_key) VALUES ('digest', $1)
     ON CONFLICT (channel, alert_key) DO NOTHING RETURNING alert_key`,
    [key]
  );
  return rows.length === 1;
}

module.exports = { digestPlan, claimDigest, getDigestSchedule, parisParts };
