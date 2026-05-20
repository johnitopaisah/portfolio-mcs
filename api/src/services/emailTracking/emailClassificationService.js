'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const RULE_KEYWORDS = [
  'application', 'interview', 'unfortunately', 'next step', 'technical test',
  'assessment', 'recruitment', 'offer', 'shortlisted', 'candidature', 'entretien',
  'invitation', 'hr', 'hiring', 'position', 'role', 'opportunity',
];

function passesRuleFilter({ subject = '', body_snippet = '' }) {
  const text = `${subject} ${body_snippet}`.toLowerCase();
  return RULE_KEYWORDS.some(kw => text.includes(kw));
}

async function classify({ subject, body_snippet, sender_email, company_name, job_title }) {
  if (!passesRuleFilter({ subject, body_snippet })) {
    return null; // not relevant — do not call AI
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const classifyTool = {
    name: 'classify_email',
    description: 'Classify a recruitment-related email',
    input_schema: {
      type: 'object',
      required: ['classification', 'confidence', 'summary', 'suggested_status', 'requires_user_action'],
      properties: {
        classification:       { type: 'string', enum: ['INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST', 'OFFER', 'FOLLOW_UP_NEEDED', 'GENERAL_RESPONSE', 'UNKNOWN'] },
        confidence:           { type: 'number', minimum: 0, maximum: 1 },
        summary:              { type: 'string' },
        suggested_status:     { type: 'string' },
        requires_user_action: { type: 'boolean' },
        suggested_reply:      { type: 'string' },
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
      content: JSON.stringify({ subject, body_snippet, sender_email, company_name, job_title }),
    }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) return null;
  return toolResult.input;
}

module.exports = { classify, passesRuleFilter };
