'use strict';

const Anthropic     = require('@anthropic-ai/sdk');
const pool          = require('../../db/client');
const baseCvService = require('./baseCvService');

// ── All sections the AI can populate ─────────────────────────
const ALL_SECTIONS = ['summary', 'skills', 'experience', 'education', 'certifications', 'projects', 'references'];

// ── Tool schema ───────────────────────────────────────────────
const cvOutputTool = {
  name: 'submit_tailored_cv',
  description: 'Submit the structured tailored CV output',
  input_schema: {
    type: 'object',
    required: [
      'cv_summary', 'skills_to_emphasize', 'tailored_experience',
      'education_entries', 'project_highlights', 'certifications_to_include',
      'references_to_include', 'missing_requirements', 'keyword_alignment',
      'recommendation', 'risk_notes', 'final_cv_json',
    ],
    properties: {
      cv_summary:              { type: 'string', description: 'Professional summary tailored to the role. Empty string if summary section not requested.' },
      skills_to_emphasize:     { type: 'array', items: { type: 'string' }, description: 'Skills to highlight, ordered by relevance to JD. Empty array if skills section not requested.' },
      tailored_experience:     {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            company:   { type: 'string' },
            role:      { type: 'string' },
            dates:     { type: 'string' },
            bullets:   { type: 'array', items: { type: 'string' } },
          },
        },
        description: 'Rephrased experience entries. Empty array if experience section not requested.',
      },
      education_entries:       {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            institution: { type: 'string' },
            degree:      { type: 'string' },
            field:       { type: 'string' },
            dates:       { type: 'string' },
            grade:       { type: 'string' },
            highlights:  { type: 'string' },
          },
        },
        description: 'Education entries to include. Empty array if education section not requested.',
      },
      project_highlights:      {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            tech_stack:  { type: 'string' },
            description: { type: 'string' },
          },
        },
        description: 'Projects to highlight. Empty array if projects section not requested.',
      },
      certifications_to_include: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:       { type: 'string' },
            issuer:     { type: 'string' },
            issue_date: { type: 'string' },
          },
        },
        description: 'Certifications to include. Empty array if certifications section not requested.',
      },
      references_to_include: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:         { type: 'string' },
            title:        { type: 'string' },
            organisation: { type: 'string' },
          },
        },
        description: 'References to include. Empty array if references section not requested.',
      },
      missing_requirements:  { type: 'array', items: { type: 'string' } },
      keyword_alignment:     { type: 'array', items: { type: 'string' }, description: 'Keywords from JD that appear in the tailored CV.' },
      recommendation:        { type: 'string', enum: ['Strong fit', 'Partial fit', 'Weak fit'] },
      risk_notes:            { type: 'array', items: { type: 'string' } },
      final_cv_json:         { type: 'object', description: 'Full structured CV data used for PDF rendering.' },
    },
  },
};

const BASE_SYSTEM_PROMPT = `You are a professional CV tailoring assistant.
You may ONLY rephrase, reorder, and emphasize experience that EXISTS in the base CV provided.
Do NOT add skills, jobs, certifications, or projects that are not present in the base CV data.
If a job requirement is not met by the base CV, list it in missing_requirements.
Never fabricate experience.

CRITICAL SECTION RULES — READ CAREFULLY:
The user message contains a "requested_sections" array. This is the definitive list of sections for this CV.
1. For EVERY section listed in requested_sections: you MUST return populated data using the base CV.
   - cv_summary → if "summary" is in requested_sections, write a tailored professional summary
   - skills_to_emphasize → if "skills" is in requested_sections, return all relevant skills from base CV
   - tailored_experience → if "experience" is in requested_sections, return tailored experience entries
   - education_entries → if "education" is in requested_sections, return ALL education entries from base CV
   - certifications_to_include → if "certifications" is in requested_sections, return ALL certifications
   - project_highlights → if "projects" is in requested_sections, return top projects from base CV
   - references_to_include → if "references" is in requested_sections, return referee entries from base CV
2. For sections NOT in requested_sections: return empty strings/arrays for those fields.
3. If a requested section has no source data in the base CV, return what is available (even if limited) and note in risk_notes.
4. In final_cv_json include the full structured CV with contact info from the base CV.`;

// ── Intensity → instructions ──────────────────────────────────
const INTENSITY_INSTRUCTIONS = {
  conservative: 'Apply minimal changes — light rephrasing for clarity. Preserve the original tone and structure closely.',
  balanced:     'Balance keyword optimisation with natural language. Rephrase bullets for impact where beneficial.',
  aggressive:   'Maximise keyword coverage and impact language. Significantly rephrase bullets to align with JD. Still only use skills from the base CV.',
};

// ── Main export ───────────────────────────────────────────────

async function generate(applicationId, {
  force        = false,
  language     = 'en',
  sections     = ALL_SECTIONS,
  userHints    = '',
  hintChips    = [],
  intensity    = 'balanced',
  templateId   = 'classic',
  colorScheme  = 'colored',
  accentColor  = '#2563EB',
} = {}) {

  // ── Step A: Cost guard ────────────────────────────────────────
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

  // ── Step B: Load application + job data ──────────────────────
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

  const allHints = [
    ...(hintChips || []),
    ...(userHints ? [userHints] : []),
  ].join('. ');

  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    `\nIntensity level: ${INTENSITY_INSTRUCTIONS[intensity] || INTENSITY_INSTRUCTIONS.balanced}`,
    allHints ? `\nUser-specific tailoring instructions (MUST honour these):\n${allHints}` : '',
  ].join('\n');

  const userMessage = JSON.stringify({
    base_cv:          activeBaseCv.content_json,
    job_description:  app.job_description || '',
    company_name:     app.company_name,
    role_title:       app.job_title,
    target_language:  language,
    requested_sections: sections,
    generation_config: { templateId, colorScheme, accentColor, intensity },
  });

  // ── Step D: Anthropic call ────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model,
    max_tokens: 5000,
    system:     systemPrompt,
    tools:      [cvOutputTool],
    tool_choice: { type: 'tool', name: 'submit_tailored_cv' },
    messages:   [{ role: 'user', content: userMessage }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) throw new Error('AI did not return structured CV output');
  const output = toolResult.input;

  // ── Step E: Version number ────────────────────────────────────
  const versionRes = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM application_documents
     WHERE application_id = $1 AND document_type = 'CV'`,
    [applicationId]
  );
  const nextVersion = versionRes.rows[0].next_version;

  // ── Step F: Persist ───────────────────────────────────────────
  const insertRes = await pool.query(
    `INSERT INTO application_documents
       (application_id, document_type, content_json, version, base_cv_version,
        ai_model, generated_by_ai, template_id, color_scheme, accent_color,
        sections_included, generation_hints, generation_config)
     VALUES ($1, 'CV', $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      applicationId,
      JSON.stringify(output),
      nextVersion,
      activeBaseCv.id,
      model,
      templateId,
      colorScheme,
      accentColor,
      JSON.stringify(sections),
      userHints || null,
      JSON.stringify({ intensity, hintChips, sections, templateId, colorScheme, accentColor }),
    ]
  );

  return { cached: false, document: insertRes.rows[0], aiOutput: output };
}

module.exports = { generate };
