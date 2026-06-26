'use strict';
const Anthropic = require('@anthropic-ai/sdk');

// Condenses existing prose (already-edited CV/cover-letter text) rather
// than regenerating from scratch — distinct from cvTailoringService's
// AI generation. Used by the manual editor's "Shrink to fit" (whole
// document) and "Shorten this paragraph" (single block) actions.

const shrinkTool = {
  name: 'submit_shortened_blocks',
  description: 'Submit the shortened version of each text block, in the same order and count as the input.',
  input_schema: {
    type: 'object',
    required: ['blocks'],
    properties: {
      blocks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Shortened text for each input block, same order, same count.',
      },
    },
  },
};

const INTENSITY_INSTRUCTIONS = {
  light:      'Trim roughly 15% of the length. Cut filler words and redundant phrasing. Keep all facts, metrics, and impact.',
  aggressive: 'Trim roughly 35% of the length. Be ruthless about removing anything non-essential, but never invent or remove factual claims — only tighten wording.',
};

async function shrinkBlocks(blocks, intensity = 'light') {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  if (!Array.isArray(blocks) || blocks.length === 0) return { blocks: [] };

  const model = process.env.CV_AI_MODEL || 'claude-haiku-4-5-20251001';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an expert resume editor. Shorten each given text block to be more concise.
${INTENSITY_INSTRUCTIONS[intensity] || INTENSITY_INSTRUCTIONS.light}
Never fabricate or change facts, numbers, company names, or job titles — only tighten existing wording.
If a block is already short (under ~8 words), return it unchanged.
Return exactly one shortened block per input block, in the same order.`;

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    tools: [shrinkTool],
    tool_choice: { type: 'tool', name: 'submit_shortened_blocks' },
    messages: [{ role: 'user', content: JSON.stringify({ blocks }) }],
  });

  const toolResult = response.content.find(b => b.type === 'tool_use');
  if (!toolResult) throw new Error('AI did not return shortened blocks');
  const result = toolResult.input;

  if (!Array.isArray(result.blocks) || result.blocks.length !== blocks.length) {
    // Defensive fallback — if the model returns a mismatched count,
    // pad/truncate rather than corrupting the document's structure.
    const out = blocks.map((b, i) => (result.blocks && result.blocks[i]) || b);
    return { blocks: out };
  }

  return { blocks: result.blocks };
}

module.exports = { shrinkBlocks };
