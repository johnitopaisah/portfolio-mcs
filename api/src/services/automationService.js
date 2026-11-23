'use strict';

const pool = require('../db/client');
const { getAvailability, isSearchPaused, lastResumedAt } = require('./availability');

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || k);
}

async function createReminderIfAbsent(appId, type, title, daysFromNow = 1) {
  const existing = await pool.query(
    `SELECT id FROM application_reminders
     WHERE application_id = $1 AND reminder_type = $2 AND is_done = FALSE`,
    [appId, type]
  );
  if (existing.rows.length) return null;
  const remindAt = new Date();
  remindAt.setDate(remindAt.getDate() + daysFromNow);
  const { rows } = await pool.query(
    `INSERT INTO application_reminders
       (application_id, reminder_type, title, remind_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [appId, type, title, remindAt]
  );
  return rows[0].id;
}

async function logAutomation(appId, ruleKey, action, detail) {
  await pool.query(
    `INSERT INTO automation_log (application_id, rule_key, action_taken, detail)
     VALUES ($1, $2, $3, $4)`,
    [appId, ruleKey, action, detail]
  );
}

async function wasRecentlyActioned(appId, ruleKey, withinDays = 7) {
  const { rows } = await pool.query(
    `SELECT id FROM automation_log
     WHERE application_id = $1 AND rule_key = $2
       AND created_at > NOW() - ($3 || ' days')::INTERVAL`,
    [appId, ruleKey, withinDays]
  );
  return rows.length > 0;
}

// ── Rule 1: Follow-up after 7 days in APPLIED ─────────────────────
async function runFollowUp7d() {
  const { rows: rule } = await pool.query(
    "SELECT is_enabled FROM automation_rules WHERE rule_key='follow_up_7d'"
  );
  if (!rule.length || !rule[0].is_enabled) return 0;

  const { rows: apps } = await pool.query(`
    SELECT a.id, a.company_name
    FROM applications a
    WHERE a.status = 'APPLIED'
      AND a.applied_at < NOW() - INTERVAL '7 days'
      -- After a pause (Not open), the 7 days restart from the resume.
      AND ($1::timestamptz IS NULL OR $1::timestamptz < NOW() - INTERVAL '7 days')
      -- One follow-up per application. Checking only OPEN reminders re-created
      -- a new (immediately overdue) one ~7 days after each was marked done,
      -- so reminders piled up forever (187 overdue, Nov 2026).
      AND NOT EXISTS (
        SELECT 1 FROM application_reminders r
        WHERE r.application_id = a.id
          AND r.reminder_type = 'follow_up'
      )
  `, [await lastResumedAt()]);

  let created = 0;
  for (const app of apps) {
    if (await wasRecentlyActioned(app.id, 'follow_up_7d')) continue;
    const title = interpolate('Follow up with {{company}}', { company: app.company_name });
    const rid = await createReminderIfAbsent(app.id, 'follow_up', title, 0);
    if (rid) {
      await logAutomation(app.id, 'follow_up_7d', 'reminder_created', `Reminder #${rid}`);
      created++;
    }
  }
  return created;
}

// ── Rule 2: Interview prep 24h before ────────────────────────────────
async function runInterviewPrep24h() {
  const { rows: rule } = await pool.query(
    "SELECT is_enabled FROM automation_rules WHERE rule_key='interview_prep_24h'"
  );
  if (!rule.length || !rule[0].is_enabled) return 0;

  const { rows: apps } = await pool.query(`
    SELECT a.id, a.company_name, a.interview_at
    FROM applications a
    WHERE a.interview_at IS NOT NULL
      AND a.interview_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND a.status IN ('INTERVIEW_SCHEDULED','FINAL_INTERVIEW','TECHNICAL_TEST')
  `);

  let created = 0;
  for (const app of apps) {
    if (await wasRecentlyActioned(app.id, 'interview_prep_24h', 2)) continue;
    const title = interpolate('Prep session: {{company}} interview tomorrow', { company: app.company_name });
    const rid = await createReminderIfAbsent(app.id, 'preparation', title, 0);
    if (rid) {
      await logAutomation(app.id, 'interview_prep_24h', 'reminder_created', `Reminder #${rid}`);
      created++;
    }
  }
  return created;
}

// ── Rule 3: Post-interview follow-up 3 days after ────────────────────
async function runPostInterview3d() {
  const { rows: rule } = await pool.query(
    "SELECT is_enabled FROM automation_rules WHERE rule_key='post_interview_3d'"
  );
  if (!rule.length || !rule[0].is_enabled) return 0;

  const { rows: apps } = await pool.query(`
    SELECT a.id, a.company_name
    FROM applications a
    WHERE a.status IN ('INTERVIEW_SCHEDULED','FINAL_INTERVIEW','TECHNICAL_TEST')
      AND a.interview_at IS NOT NULL
      AND a.interview_at < NOW() - INTERVAL '3 days'
      AND a.updated_at < NOW() - INTERVAL '3 days'
  `);

  let created = 0;
  for (const app of apps) {
    if (await wasRecentlyActioned(app.id, 'post_interview_3d', 7)) continue;
    const title = interpolate('Send thank-you / chase {{company}}', { company: app.company_name });
    const rid = await createReminderIfAbsent(app.id, 'follow_up', title, 0);
    if (rid) {
      await logAutomation(app.id, 'post_interview_3d', 'reminder_created', `Reminder #${rid}`);
      created++;
    }
  }
  return created;
}

// ── Rule 4: Offer deadline 48h before ────────────────────────────────
async function runOfferDeadline48h() {
  const { rows: rule } = await pool.query(
    "SELECT is_enabled FROM automation_rules WHERE rule_key='offer_deadline_48h'"
  );
  if (!rule.length || !rule[0].is_enabled) return 0;

  const { rows: apps } = await pool.query(`
    SELECT a.id, a.company_name
    FROM applications a
    WHERE a.status IN ('OFFER','NEGOTIATING')
      AND a.follow_up_at IS NOT NULL
      AND a.follow_up_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
  `);

  let created = 0;
  for (const app of apps) {
    if (await wasRecentlyActioned(app.id, 'offer_deadline_48h', 3)) continue;
    const title = interpolate('Respond to offer from {{company}}', { company: app.company_name });
    const rid = await createReminderIfAbsent(app.id, 'deadline', title, 0);
    if (rid) {
      await logAutomation(app.id, 'offer_deadline_48h', 'reminder_created', `Reminder #${rid}`);
      created++;
    }
  }
  return created;
}

// ── Rule 5: Stale application 14 days ────────────────────────────────
async function runStale14d() {
  const { rows: rule } = await pool.query(
    "SELECT is_enabled FROM automation_rules WHERE rule_key='stale_14d'"
  );
  if (!rule.length || !rule[0].is_enabled) return 0;

  const { rows: apps } = await pool.query(`
    SELECT a.id, a.company_name
    FROM applications a
    WHERE a.status IN ('APPLIED','EMAIL_RECEIVED','HR_CONTACTED')
      AND a.updated_at < NOW() - INTERVAL '14 days'
      AND ($1::timestamptz IS NULL OR $1::timestamptz < NOW() - INTERVAL '14 days')
      -- Once reviewed (reminder open or done), don't ask again until the
      -- application has changed since — not every 14 days forever.
      AND NOT EXISTS (
        SELECT 1 FROM application_reminders r
        WHERE r.application_id = a.id
          AND r.reminder_type = 'review'
          AND r.created_at >= a.updated_at
      )
  `, [await lastResumedAt()]);

  let created = 0;
  for (const app of apps) {
    if (await wasRecentlyActioned(app.id, 'stale_14d', 14)) continue;
    const title = interpolate('Review stale application: {{company}}', { company: app.company_name });
    const rid = await createReminderIfAbsent(app.id, 'review', title, 0);
    if (rid) {
      await logAutomation(app.id, 'stale_14d', 'reminder_created', `Reminder #${rid}`);
      created++;
    }
  }
  return created;
}

// ── Main runner ───────────────────────────────────────────────────────
async function runAllRules() {
  const results = {};
  try {
    // Snapshot first — it's history and still recorded while paused.
    await captureWeeklySnapshot().catch(e => console.error('[Snapshot]', e.message));
    if (await isSearchPaused()) {
      console.log('[Automation] Job search paused (availability: Not open) — rules not run');
      return { paused: true, total: 0 };
    }
    results.follow_up_7d        = await runFollowUp7d();
    results.interview_prep_24h  = await runInterviewPrep24h();
    results.post_interview_3d   = await runPostInterview3d();
    results.offer_deadline_48h  = await runOfferDeadline48h();
    results.stale_14d           = await runStale14d();

    const total = Object.values(results).reduce((s, v) => s + v, 0);
    await pool.query(
      "UPDATE automation_rules SET last_ran_at = NOW()"
    );
    console.log(`[Automation] Run complete — ${total} reminders created`, results);
    return { results, total };
  } catch (err) {
    console.error('[Automation] Error during rule run:', err);
    throw err;
  }
}

// ── Weekly snapshot ───────────────────────────────────────────────────
// Records the Paris week that just ENDED (Monday–Sunday). Safe to call any
// time, from any number of pods: it only writes completed weeks and the
// upsert is idempotent. Called hourly, so a missed run fixes itself.
// (The old Sunday-23:55 version computed the NEXT Monday — getDay() is 0 on
// Sundays — and recorded an empty week every time.)
async function captureWeeklySnapshot() {
  const { rows: [st] } = await pool.query('SELECT weekly_application_goal FROM user_settings LIMIT 1');
  const goal = st?.weekly_application_goal || 5;
  const { paused } = await getAvailability();
  const { rows } = await pool.query(`
    WITH w AS (SELECT (date_trunc('week', NOW() AT TIME ZONE 'Europe/Paris') - INTERVAL '1 week') AS ws)
    INSERT INTO weekly_snapshots
      (week_start, applications_count, interviews_count, offers_count, responses_count, goal, goal_met, paused)
    SELECT w.ws::date,
      COUNT(a.id) FILTER (WHERE (a.created_at AT TIME ZONE 'Europe/Paris') >= w.ws
                            AND (a.created_at AT TIME ZONE 'Europe/Paris') <  w.ws + INTERVAL '1 week')::int,
      COUNT(a.id) FILTER (WHERE a.status IN ('INTERVIEW_SCHEDULED','FINAL_INTERVIEW','TECHNICAL_TEST')
                            AND (a.updated_at AT TIME ZONE 'Europe/Paris') >= w.ws)::int,
      COUNT(a.id) FILTER (WHERE a.status IN ('OFFER','NEGOTIATING','ACCEPTED')
                            AND (a.updated_at AT TIME ZONE 'Europe/Paris') >= w.ws)::int,
      COUNT(a.id) FILTER (WHERE a.status NOT IN ('DRAFT','CV_GENERATED','READY_TO_APPLY','APPLIED')
                            AND (a.updated_at AT TIME ZONE 'Europe/Paris') >= w.ws)::int,
      $1::int, FALSE, $2::boolean
    FROM w LEFT JOIN applications a ON TRUE
    GROUP BY w.ws
    ON CONFLICT (week_start) DO NOTHING
    RETURNING week_start, applications_count`, [goal, paused]);
  // goal_met from the stored goal (also correct if a later run re-reads it)
  await pool.query(`UPDATE weekly_snapshots SET goal_met = applications_count >= COALESCE(goal, $1) WHERE goal_met IS DISTINCT FROM (applications_count >= COALESCE(goal, $1))`, [goal]);
  if (rows.length) console.log(`[Automation] Weekly snapshot captured for ${rows[0].week_start.toISOString?.().slice(0, 10) || rows[0].week_start}: ${rows[0].applications_count}/${goal}`);
  return rows[0] || null;
}

module.exports = { runAllRules, captureWeeklySnapshot };
