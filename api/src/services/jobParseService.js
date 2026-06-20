'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Known job platform domain → label map
const PLATFORM_DOMAINS = {
  'linkedin.com':             'linkedin',
  'indeed.com':               'indeed',
  'glassdoor.com':            'glassdoor',
  'seek.com.au':              'seek',
  'seek.co.nz':               'seek',
  'otta.com':                 'otta',
  'otta.io':                  'otta',
  'remoteok.com':             'remoteok',
  'weworkremotely.com':       'weworkremotely',
  'jobs.lever.co':            'lever',
  'boards.greenhouse.io':     'greenhouse',
  'apply.workable.com':       'workable',
  'jobs.ashbyhq.com':         'ashby',
  'careers.smartrecruiters.com': 'smartrecruiters',
  'angel.co':                 'wellfound',
  'wellfound.com':            'wellfound',
  'monster.com':              'monster',
  'ziprecruiter.com':         'ziprecruiter',
  'arbeitnow.com':            'arbeitnow',
  'adzuna.com':               'adzuna',
  'jooble.org':               'jooble',
  'remotive.com':             'remotive',
  'apec.fr':                  'apec',
  'welcometothejungle.com':   'welcometothejungle',
};

function detectPlatformFromUrl(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, label] of Object.entries(PLATFORM_DOMAINS)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) return label;
    }
    return 'company_website';
  } catch {
    return null;
  }
}

const parseJobTool = {
  name: 'submit_parsed_job',
  description: 'Submit the structured parsed job data extracted from the raw text',
  input_schema: {
    type: 'object',
    required: ['title', 'company_name', 'location', 'work_arrangement', 'job_type', 'role_summary', 'tech_stack', 'required_skills', 'relevance_score', 'ai_decision', 'ai_reasoning'],
    properties: {
      title:                { type: 'string' },
      company_name:         { type: 'string' },
      location:             { type: 'string' },
      work_arrangement:     { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unclear'] },
      job_type:             { type: 'string', enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'unclear'] },
      seniority_level:      { type: 'string', enum: ['junior', 'mid', 'senior', 'lead', 'principal', 'staff', 'unclear'] },
      salary_min:           { type: ['number', 'null'] },
      salary_max:           { type: ['number', 'null'] },
      salary_currency:      { type: ['string', 'null'] },
      visa_sponsorship:     { type: ['boolean', 'null'] },
      apply_url:            { type: ['string', 'null'] },
      role_summary:         { type: 'string', description: '2-3 sentence plain-English summary of what this role actually does' },
      description_clean:    { type: 'string', description: 'Full cleaned job description text' },
      requirements_text:    { type: 'string', description: 'Key requirements as bullet-point text' },
      tech_stack:           { type: 'array', items: { type: 'string' }, description: 'Technology names only' },
      required_skills:      { type: 'array', items: { type: 'string' }, description: 'Hard requirements, specific and concrete' },
      nice_to_have:         { type: 'array', items: { type: 'string' }, description: 'Explicitly stated as bonus or preferred' },
      soft_skills:          { type: 'array', items: { type: 'string' } },
      certifications_req:   { type: 'array', items: { type: 'string' } },
      languages_required:   { type: 'array', items: { type: 'string' } },
      red_flags:            { type: 'array', items: { type: 'string' }, description: 'Any concerns: vague scope, unrealistic requirements, missing salary, etc.' },
      company_stage:        { type: 'string', enum: ['startup', 'scaleup', 'enterprise', 'unknown'] },
      team_size_hint:       { type: ['string', 'null'] },
      reporting_to:         { type: ['string', 'null'] },
      relevance_score:      { type: 'integer', minimum: 0, maximum: 100, description: 'Match score 0-100 against a senior DevOps/Cloud/Backend engineer profile' },
      ai_decision:          { type: 'string', enum: ['KEEP', 'REVIEW', 'DROP'] },
      ai_reasoning:         { type: 'string', description: '2-3 sentences explaining the score and decision' },
      matched_skills:       { type: 'array', items: { type: 'string' }, description: 'Skills from a senior DevOps/Cloud/Backend profile that match this job' },
      missing_skills:       { type: 'array', items: { type: 'string' }, description: 'Skills this job requires that a typical senior DevOps engineer might lack' },
      strongest_angle:      { type: 'string', description: 'Single best reason this candidate fits — be specific' },
      cover_letter_hook:    { type: 'string', description: 'Suggested opening hook sentence for the cover letter' },
      suggested_sections:   { type: 'array', items: { type: 'string' }, description: 'CV sections most relevant: summary, skills, experience, education, certifications, projects, references' },
      suggested_hints:      { type: 'array', items: { type: 'string' }, description: 'Hint chips to pre-fill in the generation drawer' },
      recommended_template: { type: 'string', description: 'Suggested CV template: classic, modern, minimal, or sidebar' },
      recommended_tone:     { type: 'string', enum: ['formal', 'conversational', 'technical'] },
    },
  },
};

async function parseJob(rawText, { sourceUrl, baseCvSummary } = {}) {
  const urlContext = sourceUrl ? `\nJob URL: ${sourceUrl}` : '';
  const profileContext = baseCvSummary
    ? `\nCandidate profile summary: ${baseCvSummary}`
    : '\nCandidate profile: Senior DevOps/Cloud/Backend engineer with 3+ years experience in Node.js, Docker, Kubernetes, Terraform, AWS/GCP, PostgreSQL, CI/CD pipelines.';

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools:      [parseJobTool],
    tool_choice: { type: 'tool', name: 'submit_parsed_job' },
    messages: [
      {
        role: 'user',
        content: `You are a job analysis assistant. Extract structured data from the job posting below and score it against the candidate profile.
${profileContext}${urlContext}

JOB POSTING:
---
${rawText.slice(0, 12000)}
---

Extract all available information. For fields not mentioned in the posting, use null or empty arrays. Be specific and accurate — don't invent details not in the text.`,
      },
    ],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('AI did not return parsed job data');

  return {
    ...toolUse.input,
    detected_platform: detectPlatformFromUrl(sourceUrl),
  };
}

module.exports = { parseJob, detectPlatformFromUrl };
