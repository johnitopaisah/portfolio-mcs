'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (compatible; PortfolioScraperBot/1.0; +https://github.com/johnitopaisah/portfolio-mcs)';

// Below this, assume the page is JS-rendered (plain fetch only got nav/
// cookie-banner chrome, not real content) and escalate to a headless
// browser. Verified against a real case (jobs.apple.com literally says
// "Please enable Javascript") before picking this threshold.
const MIN_TEXT_LENGTH = 500;

// Strips script/style/nav/etc *elements entirely* (not just their tags —
// naive tag-stripping regex leaves their text content behind as noise, and
// for <script> specifically that's also the security-relevant step: none of
// that content should ever reach the LLM prompt).
function extractVisibleText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, svg, iframe, template').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function fetchWithHttp(url) {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
    maxRedirects: 5,
  });
  return extractVisibleText(html);
}

const CHROMIUM_PATH = process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

async function fetchWithBrowser(url) {
  // Lazy require — the vast majority of pages never need this, so the
  // (heavier) browser-automation code path is only ever loaded on demand.
  const { chromium } = require('playwright-core');
  // --no-sandbox is required to launch at all under the CronJob pod's
  // restrictive securityContext (runAsNonRoot, no privilege escalation) —
  // verified against the actual built container image, not just locally.
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    return extractVisibleText(html);
  } finally {
    await browser.close();
  }
}

// Returns { text, renderedWithBrowser } or null if the page couldn't be
// fetched at all. Never throws — a single bad URL shouldn't sink a run.
async function fetchPageText(url) {
  let text = '';
  try {
    text = await fetchWithHttp(url);
  } catch (err) {
    console.warn(`[FetchPage] HTTP fetch failed for ${url}:`, err.message);
  }

  if (text.length >= MIN_TEXT_LENGTH) {
    return { text, renderedWithBrowser: false };
  }

  try {
    const browserText = await fetchWithBrowser(url);
    if (browserText.length > text.length) {
      return { text: browserText, renderedWithBrowser: true };
    }
  } catch (err) {
    console.warn(`[FetchPage] Browser fetch failed for ${url}:`, err.message);
  }

  return text ? { text, renderedWithBrowser: false } : null;
}

module.exports = { fetchPageText, extractVisibleText };
