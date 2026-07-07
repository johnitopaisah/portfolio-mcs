'use strict';

const axios = require('axios');

// Thin wrapper around a self-hosted SearXNG instance's JSON API — no API key,
// no billing account, ever. Returns [] (never throws) on failure, so a
// discovery hiccup just means "no new boards this run," not a crashed pipeline.
async function search(query, { count = 20 } = {}) {
  const baseUrl = process.env.SEARXNG_URL;
  if (!baseUrl) {
    console.warn('[SearXNG] SEARXNG_URL not set — skipping query:', query);
    return [];
  }

  try {
    const { data } = await axios.get(`${baseUrl}/search`, {
      params: { q: query, format: 'json' },
      timeout: 10000,
    });

    const results = (data?.results || []).slice(0, count);
    return results.map((r) => ({ url: r.url, title: r.title, description: r.content }));
  } catch (err) {
    console.error(`[SearXNG] Query failed ("${query}"):`, err.response?.status || err.message);
    return [];
  }
}

module.exports = { search };
