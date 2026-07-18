'use strict';
// ============================================================
//  Visitor Parsing — User-Agent + Referer helpers
//  No external dependency — pure regex detection.
// ============================================================

// ── Bot detection ─────────────────────────────────────────────
const BOT_RE = /bot|crawl|spider|slurp|wget|curl|python|go-http|java\/|ruby|php\/|perl\/|httpclient|axios|node-fetch|got\/|undici|puppeteer|headless|phantom|playwright|selenium|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|datadog|newrelic|dynatrace|kube-probe|alb-healthcheck|ecs-introspection|amazonaws|blackbox.exporter|googlebot|bingbot|yandex|baidu|duckduck|facebot|twitterbot|linkedinbot|whatsapp|telegram|discord|slackbot|applebot|archive\.org_bot/i;

function isBot(ua) {
  if (!ua || ua === '-') return true;
  return BOT_RE.test(ua);
}

// ── Browser detection ─────────────────────────────────────────
function parseBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/Edg\//i.test(ua))     return 'Edge';
  if (/OPR\//i.test(ua))     return 'Opera';
  if (/Chrome\//i.test(ua))  return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua))  return 'Safari';
  if (/MSIE|Trident/i.test(ua)) return 'IE';
  return 'Other';
}

// ── OS detection ──────────────────────────────────────────────
function parseOs(ua) {
  if (!ua) return 'Unknown';
  if (/Windows NT/i.test(ua))       return 'Windows';
  if (/Mac OS X/i.test(ua))         return 'macOS';
  if (/Android/i.test(ua))          return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua))            return 'Linux';
  if (/CrOS/i.test(ua))             return 'ChromeOS';
  return 'Other';
}

// ── Device type ───────────────────────────────────────────────
function parseDevice(ua) {
  if (!ua) return 'desktop';
  if (/iPad|tablet|kindle|silk|playbook/i.test(ua))   return 'tablet';
  if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

// ── Referer labelling ─────────────────────────────────────────
function labelReferer(referer) {
  if (!referer || referer === '-') return 'Direct';
  const r = referer.toLowerCase();
  if (r.includes('linkedin'))  return 'LinkedIn';
  if (r.includes('google'))    return 'Google';
  if (r.includes('github'))    return 'GitHub';
  if (r.includes('twitter') || r.includes('t.co')) return 'Twitter/X';
  if (r.includes('facebook'))  return 'Facebook';
  if (r.includes('bing'))      return 'Bing';
  if (r.includes('duckduckgo')) return 'DuckDuckGo';
  if (r.includes('reddit'))    return 'Reddit';
  if (r.includes('youtube'))   return 'YouTube';
  return 'Other';
}

// ── Language ──────────────────────────────────────────────────
function parseLanguage(acceptLanguage) {
  if (!acceptLanguage) return '';
  // Take first tag before comma or semicolon
  return acceptLanguage.split(/[,;]/)[0].trim().slice(0, 10);
}

module.exports = { isBot, parseBrowser, parseOs, parseDevice, labelReferer, parseLanguage };
