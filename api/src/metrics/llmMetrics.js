'use strict';
/**
 * LLM Observability Metrics (Prometheus)
 * Tracks per-provider request outcome, latency, token usage, and estimated
 * spend for the AI job-scoring engine (aiFilteringService.js's
 * scoreWithClaude/scoreWithGroq/scoreWithGemini).
 *
 * Registers on prom-client's default global registry (no explicit
 * `registers` option) — the same registry jobMetrics.js's Pushgateway push
 * already ships from jobWorker.js, so no separate push wiring is needed here.
 */

const client = require('prom-client');

const llmRequestsTotal = new client.Counter({
  name: 'llm_requests_total',
  help: 'Total LLM scoring requests by provider and outcome',
  labelNames: ['provider', 'status'], // status: success | failed
});

const llmRequestDurationSeconds = new client.Histogram({
  name: 'llm_request_duration_seconds',
  help: 'LLM scoring request duration in seconds, by provider',
  labelNames: ['provider'],
  buckets: [0.25, 0.5, 1, 2, 5, 10, 15, 30],
});

const llmTokensTotal = new client.Counter({
  name: 'llm_tokens_total',
  help: 'Total tokens consumed by provider and token type',
  labelNames: ['provider', 'token_type'], // token_type: prompt | completion
});

const llmEstimatedCostUsdTotal = new client.Counter({
  name: 'llm_estimated_cost_usd_total',
  help: 'Running estimate of LLM spend in USD, by provider',
  labelNames: ['provider'],
});

// $ per 1M tokens — approximate published rates as of early 2026. These are
// estimates for dashboard/budget-tracking purposes only, not a billing
// source of truth; update the numbers here if a provider changes pricing.
const PRICING_PER_1M_TOKENS = {
  claude: { prompt: 1.00, completion: 5.00 },   // Claude Haiku 4.5
  groq:   { prompt: 0.59, completion: 0.79 },   // Llama 3.3 70B (free tier in use today — tracked for if/when that changes)
  gemini: { prompt: 0.10, completion: 0.40 },   // Gemini 2.0 Flash
};

function recordLLMUsage(provider, { promptTokens = 0, completionTokens = 0 } = {}) {
  llmTokensTotal.inc({ provider, token_type: 'prompt' }, promptTokens);
  llmTokensTotal.inc({ provider, token_type: 'completion' }, completionTokens);

  const rates = PRICING_PER_1M_TOKENS[provider];
  if (rates) {
    const cost = (promptTokens / 1e6) * rates.prompt + (completionTokens / 1e6) * rates.completion;
    llmEstimatedCostUsdTotal.inc({ provider }, cost);
  }
}

module.exports = {
  llmRequestsTotal,
  llmRequestDurationSeconds,
  llmTokensTotal,
  llmEstimatedCostUsdTotal,
  recordLLMUsage,
  // Exported so aiFilteringService.js's DB audit log (llm_requests_log) can
  // compute the same cost estimate without duplicating the pricing table.
  PRICING_PER_1M_TOKENS,
};
