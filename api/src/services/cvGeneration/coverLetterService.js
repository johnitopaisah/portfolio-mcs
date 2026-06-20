'use strict';

const Anthropic     = require('@anthropic-ai/sdk');
const puppeteer     = require('puppeteer');
const pool          = require('../../db/client');
const baseCvService = require('./baseCvService');
const templateSvc   = require('./templateService');

// ── Tool schema ───────────────────────────────────────────────
const clOutputTool = {
  name: 'submit_cover_letter',
  description: 'Submit the structured cover letter output',
  input_schema: {
    type: 'object',
    required: ['subject_line', 'opening_hook', 'why_you', 'why_them', 'why_now', 'call_to_action'],
    properties: {
      subject_line:   { type: 'string', description: 'Email/letter subject line. Concise and role-specific.' },
      opening_hook:   { type: 'string', description: 'Opening paragraph. Compelling, specific, never generic. Do NOT start with "I am writing to apply".' },
      why_you:        { type: 'string', description: 'One paragraph: your top 2-3 most relevant achievements for THIS role.' },
      why_them:       { type: 'string', description: 'One paragraph: something specific about this company/role from the JD that genuinely interests you.' },
      why_now:        { type: 'string', description: 'One paragraph: your current situation and what you are actively looking for.' },
      call_to_action: { type: 'string', description: 'Closing paragraph with a clear, confident call to action.' },
      ps_line:        { type: 'string', description: 'Optional P.S. line for email format. Add one compelling follow-up point. Empty string if not needed.' },
    },
  },
};

const TONE_INSTRUCTIONS = {
  formal:         'Use formal, professional language. Avoid contractions. Maintain appropriate distance.',
  professional:   'Professional but personable. Clear, direct, confident. Occasional first-person natural flow.',
  conversational: 'Warm and natural. Read as a real person, not a template. Still professional in substance.',
  enthusiastic:   'Energetic and passionate while remaining professional. Show genuine excitement for the role.',
};

const LENGTH_TARGETS = {
  brief:    'Target ~220 words total across all paragraphs. Be extremely concise.',
  standard: 'Target ~370 words total across all paragraphs. Complete but focused.',
  detailed: 'Target ~500 words total across all paragraphs. Thorough and substantive.',
};

// ── PDF rendering ─────────────────────────────────────────────

async function renderCoverLetterPdf({ clOutput, profile, app, templateId = 'modern', colorScheme = 'colored', accentColor = '#2563EB' }) {
  let html = templateSvc.loadCoverLetterTemplate(templateId);
  html = templateSvc.applyColorScheme(html, { colorScheme, accentColor });

  const name      = profile.name        || '';
  const headline  = profile.headline    || '';
  const email     = profile.email       || '';
  const phone     = profile.phone       || '';
  const github    = profile.github_url  || '';
  const linkedin  = profile.linkedin_url|| '';

  const psHtml = clOutput.ps_line
    ? `<div class="ps-line"><strong>P.S.</strong> ${clOutput.ps_line}</div>`
    : '';

  const phoneItem = phone ? `<span class="contact-item">${phone}</span>` : '';

  html = html
    .replaceAll('{{NAME}}',         name)
    .replaceAll('{{HEADLINE}}',     headline)
    .replaceAll('{{EMAIL}}',        email)
    .replaceAll('{{GITHUB_URL}}',   github)
    .replaceAll('{{LINKEDIN_URL}}', linkedin)
    .replaceAll('{{PHONE_ITEM}}',   phoneItem)
    .replaceAll('{{LOCATION_ITEM}}','')
    .replaceAll('{{COMPANY_NAME}}', app.company_name || '')
    .replaceAll('{{ROLE_TITLE}}',   app.job_title    || '')
    .replaceAll('{{SUBJECT_LINE}}', clOutput.subject_line   || '')
    .replaceAll('{{OPENING_HOOK}}', clOutput.opening_hook   || '')
    .replaceAll('{{WHY_YOU}}',      clOutput.why_you        || '')
    .replaceAll('{{WHY_THEM}}',     clOutput.why_them       || '')
    .replaceAll('{{WHY_NOW}}',      clOutput.why_now        || '')
    .replaceAll('{{CALL_TO_ACTION}}',clOutput.call_to_action|| '')
    .replaceAll('{{PS_LINE}}',      psHtml)
    .replaceAll('{{DATE}}',         new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }));

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-crash-reporter', '--disable-gpu', '--no-zygote', '--no-first-run', '--headless',
    ],
    env: { ...process.env, HOME: '/tmp' },
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4', printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  return { pdfBuffer, sourceHtml: html };
}

// ── Main export ───────────────────────────────────────────────

async function generate(applicationId, {
  language           = 'en',
  tone               = 'professional',
  length             = 'standard',
  format             = 'modern',
  userHints          = '',
  accentColor        = '#2563EB',
  colorScheme        = 'colored',
  linkedCvDocumentId = null,
} = {}) {

  // Load application + job data
  const appRes = await pool.query(
    `SELECT a.*, j.description AS job_description, j.title AS job_ref_title
     FROM applications a
     LEFT JOIN jobs j ON a.job_id = j.id
     WHERE a.id = $1`,
    [applicationId]
  );
  if (!appRes.rows.length) throw new Error(`Application ${applicationId} not found`);
  const app = appRes.rows[0];

  // Load base CV for profile + achievements context
  const activeBaseCv = await baseCvService.getActiveBaseCv();
  const profile      = activeBaseCv.content_json || {};

  // Optionally load previously generated CV for context
  let tailoredCvContext = null;
  if (linkedCvDocumentId) {
    const cvRes = await pool.query(
      'SELECT content_json FROM application_documents WHERE id = $1',
      [linkedCvDocumentId]
    );
    if (cvRes.rows.length) tailoredCvContext = cvRes.rows[0].content_json;
  }

  // Build prompt
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.CV_AI_MODEL || 'claude-haiku-4-5-20251001';

  const allHints = [
    ...(userHints ? [userHints] : []),
  ].join('. ');

  const systemPrompt = `You are an expert cover letter writer.
Write a compelling, specific, human cover letter — never generic.
Use only real facts from the candidate's profile and the job description.
Do NOT fabricate achievements or claim skills not in the profile.
${TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional}
${LENGTH_TARGETS[length]  || LENGTH_TARGETS.standard}
Language: ${language === 'fr' ? 'Write entirely in French.' : 'Write in English.'}
${allHints ? `Additional instructions from the candidate (MUST follow): ${allHints}` : ''}`;

  const userMessage = JSON.stringify({
    candidate_profile:    {
      name:        profile.name,
      headline:    profile.headline,
      bio:         profile.bio,
      skills:      (profile.skills || []).map(s => s.name || s),
      experiences: (profile.experiences || []).slice(0, 5),
      education:   (profile.education  || []).slice(0, 3),
      certifications: (profile.certifications || []).slice(0, 5),
      projects:    (profile.projects   || []).slice(0, 4),
    },
    job_description:      app.job_description || '',
    company_name:         app.company_name,
    role_title:           app.job_title,
    tailored_cv_context:  tailoredCvContext,
  });

  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system:     systemPrompt,
    tools:      [clOutputTool],
    tool_choice: { type: 'tool', name: 'submit_cover_letter' },
    messages:   [{ role: 'user', content: userMessage }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) throw new Error('AI did not return structured cover letter output');
  const clOutput = toolResult.input;

  // Version number
  const versionRes = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM application_documents
     WHERE application_id = $1 AND document_type = 'COVER_LETTER'`,
    [applicationId]
  );
  const nextVersion = versionRes.rows[0].next_version;

  // Render PDF
  const { pdfBuffer, sourceHtml } = await renderCoverLetterPdf({
    clOutput, profile, app,
    templateId: format, colorScheme, accentColor,
  });

  // Persist
  const insertRes = await pool.query(
    `INSERT INTO application_documents
       (application_id, document_type, content_json, file_data, source_html,
        version, ai_model, generated_by_ai, template_id, color_scheme, accent_color,
        generation_config)
     VALUES ($1, 'COVER_LETTER', $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10)
     RETURNING *`,
    [
      applicationId,
      JSON.stringify(clOutput),
      pdfBuffer,
      sourceHtml,
      nextVersion,
      model,
      format,
      colorScheme,
      accentColor,
      JSON.stringify({ tone, length, format, language, linkedCvDocumentId }),
    ]
  );

  // Log event
  await pool.query(
    `INSERT INTO application_events (application_id, event_type, description)
     VALUES ($1, 'CV_GENERATED', $2)`,
    [applicationId, `Cover letter v${nextVersion} generated (${language.toUpperCase()}, ${tone})`]
  );

  return { document: insertRes.rows[0], clOutput };
}

module.exports = { generate };
