'use strict';

// Some ATS APIs (Greenhouse) return description text HTML-entity-encoded
// (e.g. "&lt;div&gt;" rather than "<div>"), so tags must be decoded before
// they can be stripped. Harmless no-op on already-raw HTML (Lever, Ashby).
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Catch-all for numeric entities (decimal &#160; and hex &#xa0;) — e.g.
    // SmartRecruiters encodes non-breaking spaces this way rather than &nbsp;.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripHtml(html) {
  const decoded = decodeEntities(String(html || ''));
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Derives a display company name from a URL slug when the ATS API doesn't
// return one directly, e.g. "smart-working-solutions" -> "Smart Working Solutions".
function slugToCompanyName(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = { stripHtml, slugToCompanyName };
