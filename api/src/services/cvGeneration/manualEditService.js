'use strict';
const sanitizeHtml = require('sanitize-html');

// Allow-list scoped to formatting only — manually-edited HTML is later
// re-rendered in an iframe and printed via headless Chrome, so anything
// beyond inline text formatting (scripts, event handlers, iframes,
// external resources) is a real XSS/self-XSS vector and must be stripped.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'div', 'span', 'b', 'i', 'u', 'strong', 'em',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a',
  ],
  allowedAttributes: {
    span: ['style'],
    div:  ['style'],
    p: ['style'], h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], li: ['style'],
    a:    ['href', 'target'],
    '*':  ['class'],
  },
  allowedStyles: {
    '*': {
      color:           [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
      'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
      'font-size':     [/^\d+(\.\d+)?(pt|px|em)$/],
      'font-family':   [/^[\w\s,'"-]+$/],
      'font-weight':   [/^(bold|normal|\d+)$/],
      'font-style':    [/^(italic|normal)$/],
      'text-decoration': [/^(underline|none)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

// Sanitizes ONLY the <body> content — the part the user actually edits via
// TipTap. The <head> (template CSS: fonts, A4 page sizing, colour scheme)
// is reconstructed verbatim from the original document rather than passed
// through the formatting-only allow-list, since it was never user-editable
// and stripping it would silently destroy the document's styling.
function sanitizeEditedHtml(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  // Defense in depth: the head is never user-typed (TipTap only mounts
  // into the body), but strip any <script> regardless in case a raw API
  // call bypasses the normal client flow — script tags are never
  // legitimately needed in our own template heads (style/link/meta only).
  const head = headMatch ? headMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '') : '';
  const body = bodyMatch ? bodyMatch[1] : html;
  const safeBody = sanitizeHtml(body, SANITIZE_OPTIONS);
  return `<!DOCTYPE html><html><head>${head}</head><body>${safeBody}</body></html>`;
}

// ATS-risk heuristic — non-blocking advisory warnings only, never
// rejects a save. Flags patterns that commonly garble when an
// Applicant Tracking System re-parses a PDF as plain text.
//
// matchedSkills (optional): the application's matched_skills list —
// the keywords that made this application a good fit for the specific
// job posting. If an edit removes one of those exact keywords from the
// visible text, that's worth flagging, since it's the easiest way to
// accidentally weaken an already-good match while trimming for length.
function checkAtsRisks(html, matchedSkills = []) {
  const warnings = [];

  const fontFamilies = [...html.matchAll(/font-family:\s*([^;"']+)/gi)].map(m => m[1].trim());
  const nonStandard = fontFamilies.filter(f => !/^(arial|helvetica|inter|times|georgia|calibri)/i.test(f));
  if (nonStandard.length > 0) {
    warnings.push('Non-standard fonts may not render consistently when an ATS re-parses this document.');
  }

  const colorCount = (html.match(/color:\s*#[0-9a-fA-F]{3,6}/gi) || []).length;
  if (colorCount > 3) {
    warnings.push('Multiple text colors detected — heavy use of color can reduce readability in plain-text ATS parsing.');
  }

  if (/<table/i.test(html)) {
    warnings.push('Tables can be parsed out of order by some ATS systems — consider plain paragraphs/lists instead.');
  }

  if (Array.isArray(matchedSkills) && matchedSkills.length > 0) {
    const visibleText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    const missing = matchedSkills.filter(skill => skill && !visibleText.includes(String(skill).toLowerCase()));
    if (missing.length > 0) {
      warnings.push(`Removed keyword${missing.length > 1 ? 's' : ''} that matched this job posting: ${missing.join(', ')} — this may reduce ATS match relevance.`);
    }
  }

  return warnings;
}

module.exports = { sanitizeEditedHtml, checkAtsRisks };
