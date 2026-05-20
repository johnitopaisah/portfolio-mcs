'use strict';

const Anthropic       = require('@anthropic-ai/sdk');
const pool            = require('../../db/client');
const baseCvService   = require('./baseCvService');

// ── Tool schema — enforces structured AI output ───────────────
const cvOutputTool = {
  name: 'submit_tailored_cv',
  description: 'Submit the structured tailored CV output',
  input_schema: {
    type: 'object',
    required: [
      'cv_summary', 'skills_to_emphasize', 'tailored_experience',
      'project_highlights', 'missing_requirements', 'keyword_alignment',
      'recommendation', 'risk_notes', 'final_cv_json',
    ],
    properties: {
      cv_summary:           { type: 'string' },
      skills_to_emphasize:  { type: 'array', items: { type: 'string' } },
      tailored_experience:  {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            company: { type: 'string' },
            role:    { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      project_highlights:   { type: 'array', items: { type: 'string' } },
      missing_requirements: { type: 'array', items: { type: 'string' } },
      keyword_alignment:    { type: 'array', items: { type: 'string' } },
      recommendation:       { type: 'string', enum: ['Strong fit', 'Partial fit', 'Weak fit'] },
      risk_notes:           { type: 'array', items: { type: 'string' } },
      final_cv_json:        { type: 'object' },
    },
  },
};

const systemPrompt = `You are a professional CV tailoring assistant.
You may ONLY rephrase, reorder, and emphasize experience that EXISTS in the base CV provided.
Do NOT add skills, jobs, certifications, or projects that are not present in the base CV data.
If a job requirement is not met by the base CV, list it in missing_requirements.
Never fabricate experience.`;

// ── Main export ───────────────────────────────────────────────

async function generate(applicationId, { force = false, language = 'en' } = {}) {

  // ── Step A: Cost guard — skip AI if a current-version CV already exists ──
  const existing = await pool.query(
    `SELECT ad.*, bcv.version AS base_cv_version_num
     FROM application_documents ad
     JOIN base_cv_versions bcv ON ad.base_cv_version = bcv.id
     WHERE ad.application_id = $1
       AND ad.document_type = 'CV'
       AND ad.generated_by_ai = TRUE
     ORDER BY ad.version DESC
     LIMIT 1`,
    [applicationId]
  );

  const activeBaseCv = await baseCvService.getActiveBaseCv();

  if (!force && existing.rows.length > 0) {
    const doc = existing.rows[0];
    if (doc.base_cv_version === activeBaseCv.id) {
      return { cached: true, document: doc };
    }
  }

  // ── Step B: Load application + joined job data ────────────────
  const appRes = await pool.query(
    `SELECT a.*, j.description AS job_description, j.title AS job_ref_title
     FROM applications a
     LEFT JOIN jobs j ON a.job_id = j.id
     WHERE a.id = $1`,
    [applicationId]
  );
  if (!appRes.rows.length) throw new Error(`Application ${applicationId} not found`);
  const app = appRes.rows[0];

  // ── Step C: Build AI input ────────────────────────────────────
  const model = process.env.CV_AI_MODEL || 'claude-haiku-4-5-20251001';

  const userMessage = JSON.stringify({
    base_cv:         activeBaseCv.content_json,
    job_description: app.job_description || '',
    company_name:    app.company_name,
    role_title:      app.job_title,
    target_language: language,
    cv_style:        'standard',
  });

  // ── Step D: Anthropic tool_use call ──────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:     systemPrompt,
    tools:      [cvOutputTool],
    tool_choice: { type: 'tool', name: 'submit_tailored_cv' },
    messages:   [{ role: 'user', content: userMessage }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) throw new Error('AI did not return structured CV output');
  const output = toolResult.input;

  // ── Step E: Next document version ────────────────────────────
  const versionRes = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM application_documents
     WHERE application_id = $1 AND document_type = 'CV'`,
    [applicationId]
  );
  const nextVersion = versionRes.rows[0].next_version;

  // ── Step F: Persist document ──────────────────────────────────
  const insertRes = await pool.query(
    `INSERT INTO application_documents
       (application_id, document_type, content_json, version, base_cv_version, ai_model, generated_by_ai)
     VALUES ($1, 'CV', $2, $3, $4, $5, TRUE)
     RETURNING *`,
    [applicationId, JSON.stringify(output), nextVersion, activeBaseCv.id, model]
  );

  return { cached: false, document: insertRes.rows[0], aiOutput: output };
}

module.exports = { generate };
