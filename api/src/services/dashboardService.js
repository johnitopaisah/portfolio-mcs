'use strict';

const pool = require('../db/client');
const { FINAL_STATUSES } = require('../constants/applicationStatuses');

// Weekly goal is scored in proportion to progress (29/30 → 14/15) rather
// than all-or-nothing (rounded down: full marks only once the goal is met),
// so being one application short doesn't score the
// same as not applying at all.
function weeklyGoalPoints(count, goal, max) {
  if (!goal || goal <= 0) return max;
  return Math.floor(Math.min(1, Math.max(0, count) / goal) * max);   // full marks only when met
}

async function computeHealthScore() {
  const components = [];
  let total = 0;

  // Get current week start (Monday)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  // 1. Applied at least 1 job this week (+15)
  const { rows: weekApps } = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM applications WHERE created_at >= $1',
    [weekStart]
  );
  const appliedThisWeek = weekApps[0].cnt > 0;
  const pts1 = appliedThisWeek ? 15 : 0;
  components.push({ key: 'applied_this_week', label: 'Applied this week', pts: pts1, max: 15, ok: appliedThisWeek, detail: `${weekApps[0].cnt} this week` });
  total += pts1;

  // 2. No stale follow-ups (APPLIED > 7 days with no follow-up planned or done) (+15)
  // A done follow-up counts — otherwise marking it done (or clearing old
  // ones) made the application look "never followed up". Overdue open
  // follow-ups are still penalised by check 6 (reminders cleared).
  const { rows: staleApps } = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM applications a
    WHERE a.status = 'APPLIED'
      AND a.applied_at < NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM application_reminders r
        WHERE r.application_id = a.id AND r.reminder_type='follow_up'
      )
  `);
  const noStaleFollowups = staleApps[0].cnt === 0;
  const pts2 = noStaleFollowups ? 15 : Math.max(0, 15 - staleApps[0].cnt * 3);
  components.push({ key: 'no_stale_followups', label: 'No overdue follow-ups', pts: pts2, max: 15, ok: noStaleFollowups, detail: `${staleApps[0].cnt} need follow-up` });
  total += pts2;

  // 3. All interviews have prep (+15) — a prep checklist item OR AI-generated
  // interview questions (Interview tab) both count as preparation.
  const { rows: interviewsPrep } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE jsonb_array_length(COALESCE(a.interview_prep->'checklist','[]'::jsonb)) > 0
           OR EXISTS (SELECT 1 FROM interview_questions q WHERE q.application_id = a.id)
      )::int AS prepped
    FROM applications a
    WHERE a.status IN ('INTERVIEW_INVITE','INTERVIEW_SCHEDULED','TECHNICAL_TEST','FINAL_INTERVIEW')
  `);
  const ip = interviewsPrep[0];
  const interviewsPrepped = ip.total === 0 || ip.prepped >= ip.total;
  const pts3 = ip.total === 0 ? 15 : Math.round((ip.prepped / ip.total) * 15);
  components.push({ key: 'interviews_prepped', label: 'Interviews have prep', pts: pts3, max: 15, ok: interviewsPrepped, detail: `${ip.prepped}/${ip.total} prepared` });
  total += pts3;

  // 4. Submitted applications have a document attached (+10)
  // Any attached document counts (a generated CV/cover letter, or one
  // explicitly marked as submitted). Finished applications are left out.
  // Applications the email worker detected
  // (e.g. LinkedIn Easy Apply confirmations) were sent outside this app, so
  // there is no document to attach — they are not counted.
  const { rows: docCheck } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE a.submitted_doc_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM application_documents d WHERE d.application_id = a.id)
      )::int AS with_doc
    FROM applications a
    WHERE a.status NOT IN ('DRAFT','CV_GENERATED','READY_TO_APPLY')
      AND a.status <> ALL($1::text[])          -- finished (rejected, withdrawn…): nothing left to send
      AND a.entry_method IS DISTINCT FROM 'email_detected'
  `, [FINAL_STATUSES]);
  const dc = docCheck[0];
  const docsAttached = dc.total === 0 || dc.with_doc >= dc.total;
  const pts4 = dc.total === 0 ? 10 : Math.round((dc.with_doc / dc.total) * 10);
  components.push({ key: 'docs_attached', label: 'Submitted docs attached', pts: pts4, max: 10, ok: docsAttached, detail: `${dc.with_doc}/${dc.total} with a document` });
  total += pts4;

  // 5. Contacts added for final-stage applications (+10)
  const { rows: contactCheck } = await pool.query(`
    SELECT
      COUNT(DISTINCT a.id)::int AS total,
      COUNT(DISTINCT ac.application_id)::int AS with_contact
    FROM applications a
    LEFT JOIN application_contacts ac ON ac.application_id = a.id
    WHERE a.status IN ('INTERVIEW_INVITE','INTERVIEW_SCHEDULED','TECHNICAL_TEST',
                       'FINAL_INTERVIEW','OFFER','NEGOTIATING')
  `);
  const cc = contactCheck[0];
  const contactsOk = cc.total === 0 || cc.with_contact >= cc.total;
  const pts5 = cc.total === 0 ? 10 : Math.round((cc.with_contact / cc.total) * 10);
  components.push({ key: 'contacts_in_finals', label: 'Contacts for interviews', pts: pts5, max: 10, ok: contactsOk, detail: `${cc.with_contact}/${cc.total} with a contact` });
  total += pts5;

  // 6. All due reminders cleared (+10)
  const { rows: remCheck } = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM application_reminders
    WHERE is_done=FALSE AND remind_at < NOW()
  `);
  const remindersDone = remCheck[0].cnt === 0;
  const pts6 = remindersDone ? 10 : Math.max(0, 10 - remCheck[0].cnt * 2);
  components.push({ key: 'reminders_cleared', label: 'Reminders cleared', pts: pts6, max: 10, ok: remindersDone, detail: `${remCheck[0].cnt} overdue` });
  total += pts6;

  // 7. At least 1 application moved forward this week (+10)
  const { rows: pipelineMove } = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM application_events
    WHERE event_type='STATUS_CHANGED' AND event_date >= $1
  `, [weekStart]);
  const pipelineMoved = pipelineMove[0].cnt > 0;
  const pts7 = pipelineMoved ? 10 : 0;
  components.push({ key: 'pipeline_moved', label: 'Pipeline moved this week', pts: pts7, max: 10, ok: pipelineMoved, detail: `${pipelineMove[0].cnt} status change(s)` });
  total += pts7;

  // 8. Weekly goal met (+15)
  const { rows: goalRows } = await pool.query(
    'SELECT weekly_application_goal FROM user_settings LIMIT 1'
  );
  const goal = goalRows[0]?.weekly_application_goal || 5;
  const weeklyGoalMet = weekApps[0].cnt >= goal;
  const pts8 = weeklyGoalPoints(weekApps[0].cnt, goal, 15);
  components.push({ key: 'weekly_goal_met', label: 'Weekly goal', pts: pts8, max: 15, ok: weeklyGoalMet, detail: `${weekApps[0].cnt}/${goal} this week` });
  total += pts8;

  const label = total >= 71 ? 'Excellent' : total >= 41 ? 'On Track' : 'Needs Attention';
  const color = total >= 71 ? 'green'     : total >= 41 ? 'yellow'   : 'red';

  return { total: Math.min(total, 100), label, color, components };
}

// A viewer-supplied IANA zone decides where "today" starts; anything Intl
// rejects falls back to UTC rather than reaching the query.
function safeTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

async function getDashboardStats({ timeZone } = {}) {
  const tz = safeTimeZone(timeZone || 'UTC');
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const [healthScore, settings, pipelineRows, recentActivity,
         dueReminders, weeklyVelocity, skillsGap, dailyCounts, reminderCounts] = await Promise.all([

    computeHealthScore(),

    pool.query('SELECT * FROM user_settings LIMIT 1'),

    pool.query(`
      SELECT
        CASE
          WHEN status IN ('DRAFT','CV_GENERATED','READY_TO_APPLY') THEN 'prep'
          WHEN status IN ('APPLIED','EMAIL_RECEIVED','HR_CONTACTED') THEN 'active'
          WHEN status IN ('INTERVIEW_INVITE','INTERVIEW_SCHEDULED',
                          'TECHNICAL_TEST','FINAL_INTERVIEW') THEN 'interview'
          WHEN status IN ('OFFER','NEGOTIATING','ACCEPTED','DECLINED_OFFER') THEN 'offer'
          ELSE 'closed'
        END AS grp,
        COUNT(*)::int AS cnt
      FROM applications
      WHERE status NOT IN ('ARCHIVED')
      GROUP BY grp
    `),

    pool.query(`
      SELECT ae.event_type, ae.description, ae.event_date,
             a.company_name, a.job_title, a.id AS application_id
      FROM application_events ae
      JOIN applications a ON a.id = ae.application_id
      ORDER BY ae.event_date DESC
      LIMIT 8
    `),

    pool.query(`
      SELECT ar.*, a.company_name, a.job_title, a.id AS application_id
      FROM application_reminders ar
      JOIN applications a ON a.id = ar.application_id
      WHERE ar.is_done=FALSE AND ar.remind_at <= NOW() + INTERVAL '48 hours'
      ORDER BY ar.remind_at
      LIMIT 5
    `),

    // Last 8 weeks application velocity
    pool.query(`
      SELECT
        date_trunc('week', created_at)::date AS week,
        COUNT(*)::int AS cnt
      FROM applications
      WHERE created_at > NOW() - INTERVAL '8 weeks'
      GROUP BY week ORDER BY week
    `),

    // Skills gap: top missing skills from recent imports
    pool.query(`
      SELECT skill, COUNT(*)::int AS cnt
      FROM applications a,
           LATERAL unnest(COALESCE(a.missing_skills, '{}')) AS skill
      WHERE a.created_at > NOW() - INTERVAL '90 days'
      GROUP BY skill ORDER BY cnt DESC LIMIT 5
    `),

    // Last 14 days of applications per day, in the viewer's time zone.
    // Counted by created_at, the same as the weekly velocity above.
    pool.query(`
      SELECT d.day::date::text AS day, COUNT(a.id)::int AS cnt
      FROM generate_series(
             date_trunc('day', NOW() AT TIME ZONE $1) - INTERVAL '13 days',
             date_trunc('day', NOW() AT TIME ZONE $1),
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN applications a
        ON date_trunc('day', a.created_at AT TIME ZONE $1) = d.day
      GROUP BY d.day ORDER BY d.day
    `, [tz]),

    // Real totals — the list above is capped at 5 rows, so its length is
    // not the number of reminders waiting.
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE remind_at <= NOW() + INTERVAL '48 hours')::int AS due,
        COUNT(*) FILTER (WHERE remind_at <  NOW())::int                        AS overdue,
        COUNT(*) FILTER (WHERE remind_at <  NOW() - INTERVAL '7 days')::int   AS overdue_7d,
        COUNT(*) FILTER (WHERE remind_at <  NOW() - INTERVAL '30 days')::int  AS overdue_30d
      FROM application_reminders
      WHERE is_done = FALSE
    `),
  ]);

  const s   = settings.rows[0] || {};
  const goal = s.weekly_application_goal || 5;

  const weekApps = (weeklyVelocity.rows.find(r => {
    const rDate = new Date(r.week);
    const wDate = new Date(weekStart);
    return rDate.toDateString() === wDate.toDateString();
  }) || {}).cnt || 0;

  // Streak: consecutive weeks goal was met
  const { rows: snapshots } = await pool.query(
    'SELECT week_start, goal_met FROM weekly_snapshots ORDER BY week_start DESC LIMIT 26'
  );
  let streak = 0;
  for (const snap of snapshots) {
    if (snap.goal_met) streak++;
    else break;
  }

  const pipelineCounts = { prep: 0, active: 0, interview: 0, offer: 0, closed: 0 };
  for (const row of pipelineRows.rows) {
    pipelineCounts[row.grp] = row.cnt;
  }

  return {
    goal: {
      target:       goal,
      this_week:    weekApps,
      today:        dailyCounts.rows[dailyCounts.rows.length - 1]?.cnt || 0,
      pct:          Math.min(100, Math.round((weekApps / goal) * 100)),
      streak_weeks: streak,
    },
    health_score:    healthScore,
    due_reminders:   dueReminders.rows,
    reminder_counts: reminderCounts.rows[0],
    pipeline_counts: pipelineCounts,
    recent_activity: recentActivity.rows,
    weekly_velocity: weeklyVelocity.rows,
    daily_counts:    dailyCounts.rows,
    skills_gap:      skillsGap.rows,
  };
}

module.exports = { getDashboardStats, computeHealthScore, weeklyGoalPoints };
