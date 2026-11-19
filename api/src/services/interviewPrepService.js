'use strict';
/**
 * AI interview preparation (Interview tab):
 *   generateQuestions(appId)  → interview questions + a prep checklist
 *   generateChecklist(appId)  → prep checklist only
 *
 * Context sent to the model: your profile, the scraped job (if any) and the
 * application's own context — the CV you sent and the pasted job
 * description (applicationContextService). Email-detected applications have
 * no scraped job, so that context is what makes their prep specific.
 *
 * AI checklist items are ADDED to the existing checklist (case-insensitive
 * duplicates skipped); your own items are never removed or changed.
 */

const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/client');
const { getApplicationContext } = require('./applicationContextService');

const MODEL = 'claude-haiku-4-5-20251001';
let client = null;
const anthropic = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

const checklistProperty = {
  type: 'array',
  description: '6–10 concrete preparation tasks for this specific interview, each a short imperative '
    + '(e.g. "Review how their product uses Kubernetes autoscaling"). No generic advice.',
  items: { type: 'string' },
};

const interviewPrepTool = {
  name: 'submit_interview_prep',
  description: 'Submit structured interview preparation for a job application',
  input_schema: {
    type: 'object',
    required: ['technical_questions', 'behavioral_questions', 'company_questions', 'prep_checklist'],
    properties: {
      technical_questions: {
        type: 'array',
        description: '5 technical questions likely to be asked based on the JD',
        items: {
          type: 'object',
          required: ['question', 'difficulty', 'hint'],
          properties: {
            question:   { type: 'string' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            hint:       { type: 'string', description: 'What to focus on in the answer' },
          },
        },
      },
      behavioral_questions: {
        type: 'array',
        description: '5 behavioral / STAR questions likely to be asked',
        items: {
          type: 'object',
          required: ['question', 'star_theme', 'hint'],
          properties: {
            question:   { type: 'string' },
            star_theme: { type: 'string', description: 'e.g. leadership, conflict, delivery, growth' },
            hint:       { type: 'string' },
          },
        },
      },
      situational_questions: {
        type: 'array',
        description: '3 situational / scenario questions',
        items: {
          type: 'object',
          required: ['question', 'hint'],
          properties: { question: { type: 'string' }, hint: { type: 'string' } },
        },
      },
      company_questions: {
        type: 'array',
        description: '5 thoughtful questions for the candidate to ask the interviewer',
        items: { type: 'string' },
      },
      red_flags_to_probe: {
        type: 'array',
        description: 'Things the candidate should watch out for or probe further',
        items: { type: 'string' },
      },
      key_talking_points: {
        type: 'array',
        description: 'Key achievements / talking points from the CV to highlight',
        items: { type: 'string' },
      },
      prep_checklist: checklistProperty,
    },
  },
};

const checklistTool = {
  name: 'submit_prep_checklist',
  description: 'Submit an interview preparation checklist',
  input_schema: { type: 'object', required: ['prep_checklist'], properties: { prep_checklist: checklistProperty } },
};

// ── context ──────────────────────────────────────────────────────
async function loadPromptContext(applicationId) {
  const { rows: appRows } = await pool.query(`
    SELECT a.id, a.company_name, a.job_title, a.matched_skills, a.missing_skills,
           a.strongest_angle, a.interview_prep,
           j.description, j.requirements, j.role_summary,
           j.required_skills, j.nice_to_have, j.soft_skills,
           j.red_flags, j.work_arrangement, j.company_stage
    FROM applications a
    LEFT JOIN jobs j ON j.id = a.job_id
    WHERE a.id = $1
  `, [applicationId]);
  if (!appRows.length) throw Object.assign(new Error('Application not found'), { status: 404 });
  const app = appRows[0];

  const { rows: profileRows } = await pool.query(`
    SELECT name AS full_name, cv_display_name, cv_headline,
           (SELECT string_agg(name || ' (' || category || ')', ', ') FROM skills) AS skills_summary,
           -- experiences has "role" (not "title"); the 4 most recent are
           -- picked in a subquery — ORDER BY/LIMIT can't wrap an aggregate.
           (SELECT string_agg(role || ' at ' || company || ' (' || start_date::text || ')', '; '
                              ORDER BY start_date DESC)
            FROM (SELECT role, company, start_date FROM experiences
                  ORDER BY start_date DESC LIMIT 4) recent) AS recent_exp
    FROM profile LIMIT 1
  `);
  const profile = profileRows[0] || {};
  const ctx = await getApplicationContext(applicationId);
  return { app, profile, ctx };
}

function promptFor({ app, profile, ctx }, task) {
  const jd = ctx.job_description || app.description || '';
  return `
CANDIDATE PROFILE:
Name: ${profile.cv_display_name || profile.full_name || 'the candidate'}
Headline: ${profile.cv_headline || ''}
Key skills: ${profile.skills_summary || ''}
Recent experience: ${profile.recent_exp || ''}
Matched skills: ${(app.matched_skills || []).join(', ')}
Missing skills: ${(app.missing_skills || []).join(', ')}
Strongest angle: ${app.strongest_angle || ''}
${ctx.cv_text ? `\nCV SENT FOR THIS APPLICATION:\n${ctx.cv_text.slice(0, 6000)}\n` : ''}
TARGET ROLE:
Company: ${app.company_name}
Title: ${app.job_title}
Work arrangement: ${app.work_arrangement || ''}
Company stage: ${app.company_stage || ''}
Required skills: ${(app.required_skills || []).join(', ')}
Nice to have: ${(app.nice_to_have || []).join(', ')}
Soft skills: ${(app.soft_skills || []).join(', ')}
Role summary: ${app.role_summary || ''}
Job description: ${jd.slice(0, 6000) || '(not available — infer from the company and title)'}

${task}
`;
}

const SYSTEM = `You are a senior technical recruiter and interview coach.
Generate targeted interview preparation for a candidate based on the job description and their profile.
Be specific, practical, and tailored to the exact role and company.`;

// ── checklist merge ──────────────────────────────────────────────
function mergeChecklist(existing, aiItems) {
  const list = Array.isArray(existing) ? existing.filter(i => i && typeof i.text === 'string') : [];
  const seen = new Set(list.map(i => i.text.trim().toLowerCase()));
  for (const raw of Array.isArray(aiItems) ? aiItems : []) {
    const text = String(raw || '').trim().slice(0, 200);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    list.push({ text, done: false, source: 'ai' });
  }
  return list;
}

async function saveChecklist(db, applicationId, aiItems) {
  const { rows } = await db.query('SELECT interview_prep FROM applications WHERE id = $1 FOR UPDATE', [applicationId]);
  const prep = rows[0]?.interview_prep || {};
  const checklist = mergeChecklist(prep.checklist, aiItems);
  await db.query('UPDATE applications SET interview_prep = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify({ ...prep, checklist }), applicationId]);
  return checklist;
}

// ── questions (+ checklist) ──────────────────────────────────────
async function generateQuestions(applicationId) {
  const context = await loadPromptContext(applicationId);

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [interviewPrepTool],
    tool_choice: { type: 'tool', name: 'submit_interview_prep' },
    system: SYSTEM,
    messages: [{ role: 'user', content: promptFor(context, `Generate comprehensive interview preparation. Be specific to THIS role and candidate.
For technical questions, focus on the required skills and the job description.
For behavioral questions, map to the candidate's actual experience (use the CV if provided).
For company questions, make them insightful and specific to this company/role.
The prep checklist is a to-do list for the days before the interview.`) }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('AI did not return structured prep data');
  const prep = toolUse.input;

  const db = await pool.connect();
  let checklist;
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM interview_questions WHERE application_id = $1', [applicationId]);

    // interview_questions.difficulty only accepts easy|medium|hard — normalise
    // whatever the model returns ("Hard", "intermediate"…) instead of failing
    // the whole generation on a CHECK constraint.
    const normaliseDifficulty = d => {
      const v = String(d || '').trim().toLowerCase();
      return ['easy', 'medium', 'hard'].includes(v) ? v : 'medium';
    };
    const insertQ = async (question, type, difficulty, hint) => {
      if (!question || !String(question).trim()) return;
      await db.query(
        `INSERT INTO interview_questions (application_id, question, question_type, difficulty, ai_hint)
         VALUES ($1,$2,$3,$4,$5)`,
        [applicationId, String(question).trim(), type, normaliseDifficulty(difficulty), hint || null]
      );
    };
    for (const q of prep.technical_questions   || []) await insertQ(q.question, 'technical', q.difficulty, q.hint);
    for (const q of prep.behavioral_questions  || []) await insertQ(q.question + (q.star_theme ? ` [${q.star_theme}]` : ''), 'behavioral', 'medium', q.hint);
    for (const q of prep.situational_questions || []) await insertQ(q.question, 'situational', 'medium', q.hint);
    for (const q of prep.company_questions     || []) await insertQ(q, 'company', 'easy', 'Ask this to the interviewer');

    checklist = await saveChecklist(db, applicationId, prep.prep_checklist);
    const { rows } = await db.query('SELECT interview_prep FROM applications WHERE id = $1', [applicationId]);
    await db.query('UPDATE applications SET interview_prep = $1 WHERE id = $2', [JSON.stringify({
      ...(rows[0].interview_prep || {}),
      key_talking_points: prep.key_talking_points || [],
      red_flags_to_probe: prep.red_flags_to_probe || [],
      company_questions:  prep.company_questions  || [],
    }), applicationId]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }

  return { questions: await listQuestions(applicationId), checklist, meta: prep };
}

// ── checklist only ───────────────────────────────────────────────
async function generateChecklist(applicationId) {
  const context = await loadPromptContext(applicationId);
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [checklistTool],
    tool_choice: { type: 'tool', name: 'submit_prep_checklist' },
    system: SYSTEM,
    messages: [{ role: 'user', content: promptFor(context,
      'Write a preparation checklist (6–10 concrete tasks) for the days before this interview. '
      + 'Avoid items already on the existing checklist: '
      + JSON.stringify((context.app.interview_prep?.checklist || []).map(i => i.text))) }],
  });
  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('AI did not return a checklist');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const checklist = await saveChecklist(db, applicationId, toolUse.input.prep_checklist);
    await db.query('COMMIT');
    return { checklist };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

// Same shape for "load saved" and "after generating" — { questions: [...] }.
// `hint` mirrors the stored ai_hint so the UI shows the AI's answer tips.
async function listQuestions(applicationId) {
  const { rows } = await pool.query(
    `SELECT iq.*, iq.ai_hint AS hint, ss.title AS star_story_title
     FROM interview_questions iq
     LEFT JOIN star_stories ss ON ss.id = iq.star_story_id
     WHERE iq.application_id = $1
     ORDER BY iq.question_type, iq.id`,
    [applicationId]
  );
  return rows;
}

module.exports = { generateQuestions, generateChecklist, listQuestions, mergeChecklist };
