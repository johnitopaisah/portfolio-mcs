'use strict';
/**
 * Availability (admin dashboard: Available / Open to right / Not open).
 *
 *   active, passive → the job search runs as usual (passive only changes the
 *                     badge on the public site).
 *   not_open        → the job search is PAUSED:
 *                       - job discovery (scraper) and AI filtering
 *                       - job digest emails
 *                       - follow-up drafts, Outbox sending (approved emails wait)
 *                       - hourly reminder rules
 *                       - weekly goal / "applied this week" / pipeline checks
 *                         in Search Health, and the weekly streak (paused
 *                         weeks neither count nor break it)
 *                     Email tracking keeps running so recruiter replies
 *                     (interviews, offers) are never missed.
 *
 * Every change is recorded in availability_changes (migration 041) so past
 * paused weeks can be recognised.
 */
const pool = require('../db/client');

const STATUSES = ['active', 'passive', 'not_open'];
const CACHE_MS = 30 * 1000;
let cache = null;   // { status, since, at }

/** @returns {Promise<{ status: string, paused: boolean, since: string|null }>} */
async function getAvailability(db = pool, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return view(cache);
  let status = 'active', since = null;
  try {
    const { rows } = await db.query('SELECT availability_status FROM profile LIMIT 1');
    if (STATUSES.includes(rows[0]?.availability_status)) status = rows[0].availability_status;
    const { rows: ch } = await db.query(
      'SELECT changed_at FROM availability_changes WHERE status = $1 ORDER BY changed_at DESC LIMIT 1', [status]);
    since = ch[0]?.changed_at ? new Date(ch[0].changed_at).toISOString() : null;
  } catch {
    // profile/table not readable — never block work because of this check
  }
  cache = { status, since, at: Date.now() };
  return view(cache);
}

function view(c) { return { status: c.status, paused: c.status === 'not_open', since: c.since }; }

async function isSearchPaused(db = pool) {
  return (await getAvailability(db)).paused;
}

async function setAvailability(status, db = pool) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('status must be active, passive, or not_open'), { status: 400 });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rows: [prev] } = await c.query('SELECT availability_status FROM profile LIMIT 1 FOR UPDATE');
    const { rows } = await c.query('UPDATE profile SET availability_status = $1 RETURNING availability_status', [status]);
    if (prev?.availability_status !== status) {
      await c.query('INSERT INTO availability_changes (status) VALUES ($1)', [status]);
    }
    await c.query('COMMIT');
    cache = null;
    return rows[0];
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { c.release(); }
}

/**
 * Paris weeks (Monday 'YYYY-MM-DD') in which the search was Not open at any
 * moment, from `fromDate` until now.
 */
async function pausedWeeks(db = pool) {
  const { rows } = await db.query(`
    WITH ch AS (
      SELECT status, changed_at,
             LEAD(changed_at, 1, NOW()) OVER (ORDER BY changed_at) AS until
      FROM availability_changes
    )
    SELECT DISTINCT to_char(date_trunc('week', w), 'YYYY-MM-DD') AS week
    FROM ch,
         generate_series(date_trunc('week', changed_at AT TIME ZONE 'Europe/Paris'),
                         until AT TIME ZONE 'Europe/Paris', INTERVAL '1 week') AS w
    WHERE status = 'not_open'`).catch(() => ({ rows: [] }));
  return new Set(rows.map(r => r.week));
}

/** When the search last came back from Not open (null if never paused). */
async function lastResumedAt(db = pool) {
  const { rows } = await db.query(`
    SELECT changed_at FROM (
      SELECT status, changed_at, LAG(status) OVER (ORDER BY changed_at) AS prev FROM availability_changes
    ) x WHERE prev = 'not_open' AND status <> 'not_open' ORDER BY changed_at DESC LIMIT 1`).catch(() => ({ rows: [] }));
  return rows[0]?.changed_at || null;
}

function resetCache() { cache = null; }

module.exports = { getAvailability, isSearchPaused, setAvailability, pausedWeeks, lastResumedAt, resetCache, STATUSES };
