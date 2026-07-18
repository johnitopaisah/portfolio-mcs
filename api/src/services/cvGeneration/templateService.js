'use strict';

const fs   = require('fs');
const path = require('path');

// ── Template registry ─────────────────────────────────────────
const CV_TEMPLATES = [
  {
    id:          'classic',
    name:        'Classic',
    description: 'Clean single-column with accent colour headers. Universally accepted.',
    category:    'classic',
    atsScore:    95,
    supportsColor: true,
    layout:      'single',
    bestFor:     ['Most roles', 'Tech', 'General'],
  },
  {
    id:          'ats-pure',
    name:        'ATS Pure',
    description: 'Zero graphics, single column, maximum ATS parser compatibility.',
    category:    'ats',
    atsScore:    100,
    supportsColor: false,
    layout:      'single',
    bestFor:     ['Large companies', 'FMCG', 'Government'],
  },
  {
    id:          'modern',
    name:        'Modern',
    description: 'Bold coloured header, card-style sections, contemporary feel.',
    category:    'modern',
    atsScore:    80,
    supportsColor: true,
    layout:      'modern-header',
    bestFor:     ['Tech startups', 'SaaS companies', 'Product roles'],
  },
  {
    id:          'minimal',
    name:        'Minimal',
    description: 'Scandinavian whitespace aesthetic with side-label section layout.',
    category:    'minimal',
    atsScore:    85,
    supportsColor: true,
    layout:      'side-label',
    bestFor:     ['Design-adjacent', 'Creative tech', 'Senior roles'],
  },
  {
    id:          'executive',
    name:        'Executive',
    description: 'Serif typography, centred header, dense achievement-focused bullets.',
    category:    'classic',
    atsScore:    90,
    supportsColor: true,
    layout:      'single',
    bestFor:     ['Senior / Director', 'Consulting', 'Finance'],
  },
  {
    id:          'technical',
    name:        'Technical',
    description: 'Monospace accents, arrow bullets, dark section labels. Developer aesthetic.',
    category:    'technical',
    atsScore:    88,
    supportsColor: true,
    layout:      'single',
    bestFor:     ['Engineers', 'DevOps', 'Data roles'],
  },
  {
    id:          'harvard',
    name:        'Harvard',
    description: 'Traditional academic format with centred header and horizontal rules.',
    category:    'classic',
    atsScore:    92,
    supportsColor: false,
    layout:      'single',
    bestFor:     ['Academia', 'Research', 'Law', 'Consulting'],
  },
  {
    id:          'startup',
    name:        'Startup',
    description: 'Bold colour block header, card-wrapped entries, high-energy layout.',
    category:    'modern',
    atsScore:    75,
    supportsColor: true,
    layout:      'modern-header',
    bestFor:     ['Startups', 'Scaleups', 'Product', 'Growth roles'],
  },
  {
    id:          'wallstreet',
    name:        'Wall Street',
    description: 'Conservative serif, dense information layout. Finance/consulting standard.',
    category:    'classic',
    atsScore:    92,
    supportsColor: false,
    layout:      'single',
    bestFor:     ['Finance', 'Banking', 'Legal', 'Insurance'],
  },
  {
    id:          'sidebar',
    name:        'Sidebar',
    description: 'Two-column: coloured sidebar for contact/skills, main column for experience.',
    category:    'modern',
    atsScore:    70,
    supportsColor: true,
    layout:      'sidebar',
    bestFor:     ['Mid-level tech', 'Marketing', 'Operations'],
  },
  {
    id:          'creative',
    name:        'Creative',
    description: 'Bold typographic hierarchy, timeline-style experience, distinctive borders.',
    category:    'creative',
    atsScore:    65,
    supportsColor: true,
    layout:      'creative',
    bestFor:     ['Creative roles', 'Portfolio-heavy', 'Design engineering'],
  },
  {
    id:          'europass',
    name:        'Europass',
    description: 'EU-standard Europass format. Required for some EU government applications.',
    category:    'international',
    atsScore:    88,
    supportsColor: true,
    layout:      'europass',
    bestFor:     ['EU institutions', 'Government', 'International roles'],
  },
];

const COVER_LETTER_TEMPLATES = [
  {
    id:          'modern',
    name:        'Modern',
    description: 'Coloured header matching CV, clean professional body.',
  },
  {
    id:          'classic',
    name:        'Classic Formal',
    description: 'Traditional formal business letter format.',
  },
  {
    id:          'email',
    name:        'Email',
    description: 'Email body format — no formal header, starts directly.',
  },
];

// ── Colour utilities ──────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function lightenHex(hex, factor = 0.88) {
  const { r, g, b } = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`;
}

function darkenHex(hex, factor = 0.2) {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
}

// ── Loaders ───────────────────────────────────────────────────

function loadCvTemplate(templateId) {
  const templatePath = path.join(__dirname, '../../templates/cv', `${templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    // Fallback to classic
    return fs.readFileSync(path.join(__dirname, '../../templates/cv/classic.html'), 'utf8');
  }
  return fs.readFileSync(templatePath, 'utf8');
}

function loadCoverLetterTemplate(templateId) {
  const templatePath = path.join(__dirname, '../../templates/cover-letter', `${templateId}.html`);
  if (!fs.existsSync(templatePath)) {
    return fs.readFileSync(path.join(__dirname, '../../templates/cover-letter/modern.html'), 'utf8');
  }
  return fs.readFileSync(templatePath, 'utf8');
}

// ── Font settings ─────────────────────────────────────────────

const FONT_FAMILIES = {
  inter:    "'Inter', 'Helvetica Neue', Arial, sans-serif",
  calibri:  "'Calibri', 'Trebuchet MS', 'Gill Sans MT', sans-serif",
  georgia:  "'Georgia', 'Times New Roman', serif",
  garamond: "'Garamond', 'EB Garamond', 'Palatino Linotype', serif",
  roboto:   "'Roboto', 'Open Sans', 'Segoe UI', sans-serif",
};

const DENSITIES = {
  compact: { lineHeight: '1.3',  sectionGap: '10px', entryGap: '6px',  padding: '18px 24px' },
  normal:  { lineHeight: '1.45', sectionGap: '16px', entryGap: '11px', padding: '28px 36px' },
  relaxed: { lineHeight: '1.6',  sectionGap: '22px', entryGap: '15px', padding: '36px 44px' },
};

function applyFontSettings(html, { fontFamily = 'inter', fontSize = '10.5pt', lineDensity = 'normal' } = {}) {
  const ff      = FONT_FAMILIES[fontFamily] || FONT_FAMILIES.inter;
  const density = DENSITIES[lineDensity]    || DENSITIES.normal;
  const override = `
<style id="font-override">
  body,p,li,td,th,div,span { font-family: ${ff} !important; }
  body { font-size: ${fontSize} !important; line-height: ${density.lineHeight} !important; padding: ${density.padding} !important; }
  .section,.ep-section { margin-bottom: ${density.sectionGap} !important; }
  .exp-entry,.edu-entry,.proj-entry,.ref-entry { margin-bottom: ${density.entryGap} !important; }
  .exp-entry ul li,.exp-entry li { line-height: ${density.lineHeight} !important; }
  .sidebar-section { margin-bottom: ${density.entryGap} !important; }
</style>`;
  return html.replace('</head>', override + '\n</head>');
}

function applyColorScheme(html, { colorScheme = 'colored', accentColor = '#2563EB' } = {}) {
  const accent      = colorScheme === 'bw' ? '#111111' : accentColor;
  const accentLight = colorScheme === 'bw' ? '#f0f0f0' : lightenHex(accent, 0.88);
  const accentDark  = colorScheme === 'bw' ? '#000000' : darkenHex(accent, 0.15);

  return html
    .replaceAll('{{ACCENT_COLOR}}', accent)
    .replaceAll('{{ACCENT_LIGHT}}', accentLight)
    .replaceAll('{{ACCENT_DARK}}',  accentDark);
}

function getTemplateById(id) {
  return CV_TEMPLATES.find(t => t.id === id) || CV_TEMPLATES[0];
}

// ── Section presets ────────────────────────────────────────────

const SECTION_PRESETS = {
  'devops-cloud': {
    label:    'DevOps / Cloud',
    sections: ['summary', 'skills', 'experience', 'certifications', 'projects', 'education'],
  },
  'backend-engineering': {
    label:    'Backend Engineering',
    sections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
  },
  'fullstack': {
    label:    'Full-Stack',
    sections: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
  },
  'data-ml': {
    label:    'Data / ML',
    sections: ['summary', 'skills', 'experience', 'education', 'projects', 'certifications'],
  },
  'senior-leadership': {
    label:    'Senior / Leadership',
    sections: ['summary', 'experience', 'education', 'certifications', 'skills'],
  },
  'academic': {
    label:    'Academic / Research',
    sections: ['summary', 'education', 'experience', 'certifications', 'skills', 'references'],
  },
  'minimal': {
    label:    'Minimal (1-page)',
    sections: ['summary', 'skills', 'experience', 'education'],
  },
};

function suggestPreset(jobDescription = '') {
  const jd = jobDescription.toLowerCase();
  if (/kubernetes|terraform|ansible|ci\/cd|devops|sre|infrastructure|cloud|aws|gcp|azure/i.test(jd)) return 'devops-cloud';
  if (/machine learning|deep learning|neural|nlp|data science|pytorch|tensorflow|llm/i.test(jd)) return 'data-ml';
  if (/full.stack|frontend|react|vue|angular|next\.?js|typescript/i.test(jd)) return 'fullstack';
  if (/backend|api|microservice|node|django|spring|golang|rust/i.test(jd))    return 'backend-engineering';
  if (/director|vp|head of|lead|manager|principal|staff/i.test(jd))          return 'senior-leadership';
  if (/research|university|professor|phd|publication/i.test(jd))             return 'academic';
  return 'backend-engineering';
}

module.exports = {
  CV_TEMPLATES,
  COVER_LETTER_TEMPLATES,
  SECTION_PRESETS,
  loadCvTemplate,
  loadCoverLetterTemplate,
  applyColorScheme,
  applyFontSettings,
  getTemplateById,
  suggestPreset,
};
