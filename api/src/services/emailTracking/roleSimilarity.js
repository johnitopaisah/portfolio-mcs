'use strict';

// Decides whether two job titles name the same role.
//
// Plain trigram similarity is the wrong tool here: "Cloud Engineer" and
// "DevOps Engineer" share the whole word "engineer" and score as close as
// "Junior DevOps Engineer" vs "DevOps Engineer" do. Titles are compared as
// weighted token sets instead, so the distinguishing words (devops, cloud,
// sre...) dominate and generic ones (engineer, junior) barely count.
//
// One side is usually the posting title and the other an AI-extracted role
// from an email, which may be translated ("Stage ... Ingénieur.e DevOps H/F"
// vs "DevOps Intern"), so a small FR/DE → EN synonym map is applied first.

const ROLE_MATCH     = 0.6;   // at/above -> same role
const ROLE_DIFFERENT = 0.35;  // below    -> clearly a different role

// Title used for auto-created applications whose email named no role.
const PLACEHOLDER_TITLE = 'Application via email';

const SYNONYMS = {
  ingenieur: 'engineer', ingenieure: 'engineer', ingenieurin: 'engineer', engineering: 'engineer',
  developpeur: 'developer', developpeuse: 'developer', entwickler: 'developer', dev: 'developer',
  stage: 'intern', stagiaire: 'intern', internship: 'intern', praktikum: 'intern', praktikant: 'intern',
  alternance: 'apprentice', alternant: 'apprentice', apprentissage: 'apprentice', apprenticeship: 'apprentice',
  administrateur: 'administrator', admin: 'administrator', architecte: 'architect',
  sr: 'senior', jr: 'junior', debutant: 'junior',
};

// Multi-word expansions, applied to the normalized string.
const EXPANSIONS = [
  [/\bsre\b/g, 'site reliability engineer'],
];

const STOPWORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'en', 'et', 'fin', 'etudes', 'etude',
  'of', 'the', 'and', 'at', 'for', 'in', 'to', 'an', 'position', 'role', 'job', 'poste',
  'remote', 'hybrid', 'cdi', 'cdd', 'full', 'time',
]);

const GENERIC   = new Set(['engineer', 'developer', 'specialist', 'consultant']);
const SENIORITY = new Set([
  'junior', 'senior', 'lead', 'staff', 'principal', 'intern', 'apprentice',
  'graduate', 'entry', 'level', 'mid', 'confirme', 'experimente',
]);

function weightOf(token) {
  if (GENERIC.has(token))   return 0.25;
  if (SENIORITY.has(token)) return 0.5;
  return 1;
}

/** @returns {Set<string>} normalized, de-duplicated role tokens */
function tokenize(title) {
  let s = (title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of EXPANSIONS) s = s.replace(re, to);

  const tokens = new Set();
  for (let t of s.split(' ')) {
    // Single letters are gender markers (H/F, m/w/d) or elision leftovers.
    if (t.length < 2) continue;
    t = SYNONYMS[t] || t;
    if (STOPWORDS.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

function isPlaceholderTitle(title) {
  return !title || title.trim() === PLACEHOLDER_TITLE || tokenize(title).size === 0;
}

/**
 * Similarity in [0,1] between two job titles; see ROLE_MATCH / ROLE_DIFFERENT.
 * @param {string} a
 * @param {string} b
 */
function roleSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;

  let inter = 0, union = 0;
  const extras = [];
  for (const t of new Set([...ta, ...tb])) {
    const w = weightOf(t);
    union += w;
    if (ta.has(t) && tb.has(t)) inter += w;
    else extras.push(t);
  }
  const score = union ? inter / union : 0;

  // "DevOps Engineer" vs "Junior DevOps Engineer": they differ only by
  // seniority/generic words and share a distinguishing one — same role.
  const sharesDistinct = [...ta].some(t => tb.has(t) && weightOf(t) === 1);
  const onlyMinorDiffs = extras.every(t => weightOf(t) < 1);
  const oneSided       = extras.every(t => ta.has(t)) || extras.every(t => tb.has(t));
  if (sharesDistinct && onlyMinorDiffs && oneSided) return Math.max(score, 0.9);

  return score;
}

module.exports = {
  roleSimilarity, tokenize, isPlaceholderTitle,
  ROLE_MATCH, ROLE_DIFFERENT, PLACEHOLDER_TITLE,
};
