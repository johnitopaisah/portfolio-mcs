'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/client');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const interviewPrepTool = {
  name: 'submit_interview_prep',
  description: 'Submit structured interview preparation for a job application',
  input_schema: {
    type: 'object',
    required: ['technical_questions', 'behavioral_questions', 'company_questions'],
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
          properties: {
            question: { type: 'string' },
            hint:     { type: 'string' },
          },
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
    },
  },
};

async function generateQuestions(applicationId) {
  // Load application + job + base CV context
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

  // Load profile CV summary
  const { rows: profileRows } = await pool.query(`
    SELECT name AS full_name, cv_display_name, cv_headline,
           (SELECT string_agg(name || ' (' || category || ')', ', ') FROM skills) AS skills_summary,
           (SELECT string_agg(title || ' at ' || company || ' (' || start_date::text || ')', '; ')
            FROM experiences ORDER BY start_date DESC LIMIT 4) AS recent_exp
    FROM profile LIMIT 1
  `);
  const profile = profileRows[0] || {};

  const systemPrompt = `You are a senior technical recruiter and interview coach.
Generate targeted interview preparation for a candidate based on the job description and their profile.
Be specific, practical, and tailored to the exact role and company.`;

  const userMessage = `
CANDIDATE PROFILE:
Name: ${profile.cv_display_name || profile.full_name || 'the candidate'}
Headline: ${profile.cv_headline || ''}
Key skills: ${profile.skills_summary || ''}
Recent experience: ${profile.recent_exp || ''}
Matched skills: ${(app.matched_skills || []).join(', ')}
Missing skills: ${(app.missing_skills || []).join(', ')}
Strongest angle: ${app.strongest_angle || ''}

TARGET ROLE:
Company: ${app.company_name}
Title: ${app.job_title}
Work arrangement: ${app.work_arrangement || ''}
Company stage: ${app.company_stage || ''}
Required skills: ${(app.required_skills || []).join(', ')}
Nice to have: ${(app.nice_to_have || []).join(', ')}
Soft skills: ${(app.soft_skills || []).join(', ')}
Role summary: ${app.role_summary || ''}
Job description excerpt: ${(app.description || '').slice(0, 1500)}

Generate comprehensive interview preparation. Be specific to THIS role and candidate.
For technical questions, focus on the required skills listed above.
For behavioral questions, map to the candidate's actual experience areas.
For company questions, make them insightful and specific to this company/role.
`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools: [interviewPrepTool],
    tool_choice: { type: 'tool', name: 'submit_interview_prep' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('AI did not return structured prep data');

  const prep = toolUse.input;

  // Persist to interview_questions table
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear old AI-generated questions for this application
    await client.query(
      "DELETE FROM interview_questions WHERE application_id=$1",
      [applicationId]
    );

    const insertQ = async (question, type, difficulty, hint) => {
      await client.query(
        `INSERT INTO interview_questions
           (application_id, question, question_type, difficulty, ai_hint)
         VALUES ($1,$2,$3,$4,$5)`,
        [applicationId, question, type, difficulty || 'medium', hint || null]
      );
    };

    for (const q of prep.technical_questions || []) {
      await insertQ(q.question, 'technical', q.difficulty, q.hint);
    }
    for (const q of prep.behavioral_questions || []) {
      await insertQ(q.question + (q.star_theme ? ` [${q.star_theme}]` : ''), 'behavioral', 'medium', q.hint);
    }
    for (const q of prep.situational_questions || []) {
      await insertQ(q.question, 'situational', 'medium', q.hint);
    }
    for (const q of prep.company_questions || []) {
      await insertQ(q, 'company', 'easy', 'Ask this to the interviewer');
    }

    // Merge into interview_prep JSONB on applications
    const existingPrep = app.interview_prep || {};
    const mergedPrep = {
      ...existingPrep,
      key_talking_points: prep.key_talking_points || [],
      red_flags_to_probe: prep.red_flags_to_probe || [],
      company_questions:  prep.company_questions  || [],
    };
    await client.query(
      'UPDATE applications SET interview_prep=$1 WHERE id=$2',
      [JSON.stringify(mergedPrep), applicationId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Return questions grouped
  const { rows: questions } = await pool.query(
    'SELECT * FROM interview_questions WHERE application_id=$1 ORDER BY question_type, id',
    [applicationId]
  );

  return { questions, meta: prep };
}

module.exports = { generateQuestions };
