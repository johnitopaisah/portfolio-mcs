'use strict';
const Anthropic = require('@anthropic-ai/sdk');

// Cheap pre-filter: only mail that looks recruitment-related reaches the AI
// (and only that mail is stored). Matched on word boundaries — plain
// substring matching let "hr" hit "three" and "role" hit "contrôle", which
// let every automated notification through.
const RULE_PATTERNS = [
  /\bapplication/, /\bappl(?:ied|ying)\b/, /\binterview/, /\bunfortunately\b/,
  /\bnext steps?\b/, /\btechnical test/, /\bassessment/, /\brecruit/, /\brecrut/,
  /\boffers?\b/, /\bshortlisted\b/, /\bcandidat/, /\bentretien/, /\binvitation\b/,
  /\bhr\b/, /\bhiring\b/, /\bpositions?\b/, /\broles?\b/, /\bopportunit/,
  /\bpostul/, /\bmerci pour votre (?:int[ée]r[êe]t|candidature)/,
];

function passesRuleFilter({ subject = '', body_snippet = '' }) {
  const text = `${subject} ${body_snippet}`.toLowerCase();
  return RULE_PATTERNS.some(re => re.test(text));
}

// Mail from the user's own domain (portfolio visit digests, job-match
// digests, cluster alerts sent by notify.js) is never recruitment mail.
// Defaults to the domain of the mailbox itself; EMAIL_IGNORE_SENDER_DOMAINS
// (comma-separated) overrides.
function ignoredSenderDomains(env = process.env) {
  const configured = (env.EMAIL_IGNORE_SENDER_DOMAINS || '')
    .split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  if (configured.length) return configured;
  const own = (env.IMAP_USER || env.NOTIFY_EMAIL_USER || '').split('@')[1];
  return own ? [own.trim().toLowerCase()] : [];
}

function isIgnoredSender(senderEmail, domains = ignoredSenderDomains()) {
  const domain = String(senderEmail || '').toLowerCase().split('@')[1];
  if (!domain) return false;
  return domains.some(d => domain === d || domain.endsWith(`.${d}`));
}

// Single source of truth for email_responses.ai_classification — shared by
// the classifier tool schema and the manual /reclassify route.
const CLASSIFICATIONS = [
  'APPLICATION_CONFIRMATION', 'INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST',
  'OFFER', 'FOLLOW_UP_NEEDED', 'GENERAL_RESPONSE', 'UNKNOWN',
];

async function classify({ subject, body_snippet, sender_email, company_name, job_title, mailbox_folder }) {
  if (!passesRuleFilter({ subject, body_snippet })) {
    return null; // not relevant — do not call AI
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const classifyTool = {
    name: 'classify_email',
    description: 'Classify a recruitment-related email',
    input_schema: {
      type: 'object',
      required: ['classification', 'confidence', 'summary', 'suggested_status', 'requires_user_action', 'extracted_company', 'extracted_role'],
      properties: {
        classification:       {
          type: 'string',
          enum: CLASSIFICATIONS,
          description: 'APPLICATION_CONFIRMATION is ONLY an acknowledgement that the recipient\'s own job application was submitted or received (e.g. "thank you for applying", "merci pour votre candidature", "your application was sent to <company>"), with no decision yet. Job alerts, job recommendations, "X is hiring", "your application was viewed", reminders to finish an incomplete application, newsletters and marketing are NOT confirmations — use GENERAL_RESPONSE or UNKNOWN for those.',
        },
        confidence:           { type: 'number', minimum: 0, maximum: 1 },
        summary:              { type: 'string' },
        suggested_status:     {
          type: 'string',
          enum: ['APPLIED', 'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE', 'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED', 'NO_RESPONSE'],
        },
        requires_user_action: { type: 'boolean' },
        suggested_reply:      { type: 'string' },
        extracted_company:    {
          type: 'string',
          description: 'The company this email is from/about, read from the signature, body text, or sender domain — not just the raw domain string. Empty string if genuinely unclear.',
        },
        extracted_role:       {
          type: 'string',
          description: 'The job title/role this email refers to, if mentioned anywhere in the subject or body. Empty string if genuinely unclear.',
        },
      },
    },
  };

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools:      [classifyTool],
    tool_choice: { type: 'tool', name: 'classify_email' },
    messages: [{
      role:    'user',
      // mailbox_folder is a hint only (e.g. "Newsletter" is mostly job alerts);
      // omitted for Gmail, which has no folders.
      content: JSON.stringify({
        subject, body_snippet, sender_email, company_name, job_title,
        ...(mailbox_folder ? { mailbox_folder } : {}),
      }),
    }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) return null;
  return toolResult.input;
}

module.exports = { classify, passesRuleFilter, isIgnoredSender, ignoredSenderDomains, CLASSIFICATIONS };
