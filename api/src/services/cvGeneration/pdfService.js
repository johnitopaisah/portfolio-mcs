'use strict';

const puppeteer     = require('puppeteer');
const templateSvc   = require('./templateService');

// ── Date formatter ────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); }
  catch { return String(d).slice(0, 7); }
}

// ── Contact token helpers ─────────────────────────────────────
// Different templates use different contact slot patterns
function buildContactVariants(profile) {
  const phone    = profile.phone    || '';
  const location = profile.location || '';
  return {
    // inline item with separator for classic/wallstreet/harvard
    PHONE_ITEM:    phone    ? `<span>${phone}</span>`    : '',
    LOCATION_ITEM: location ? `<span>${location}</span>` : '',
    // raw text for ats-pure
    PHONE:         phone,
    LOCATION:      location,
    PHONE_SEP:     phone    ? '' : '<!---->',
    LOCATION_SEP:  location ? '' : '<!---->',
    // chip for startup
    PHONE_CHIP:    phone    ? `<span class="contact-chip">${phone}</span>` : '',
    LOCATION_CHIP: location ? `<span class="contact-chip">${location}</span>` : '',
    // sidebar item
    PHONE_SIDEBAR:    phone    ? `<div class="contact-item">${phone}</div>` : '',
    LOCATION_SIDEBAR: location ? `<div class="contact-item">${location}</div>` : '',
    // creative c-item
    PHONE_CITEM:    phone    ? `<div class="c-item">${phone}</div>` : '',
    LOCATION_CITEM: location ? `<div class="c-item">${location}</div>` : '',
    // europass row
    PHONE_EP_ROW:    phone    ? `<div class="ep-row"><div class="ep-label">Phone</div><div class="ep-value">${phone}</div></div>` : '',
    LOCATION_EP_ROW: location ? `<div class="ep-row"><div class="ep-label">Location</div><div class="ep-value">${location}</div></div>` : '',
    // name split for creative
    FIRST_NAME: (profile.name || '').split(' ')[0] || '',
    LAST_NAME:  (profile.name || '').split(' ').slice(1).join(' ') || '',
  };
}

// ── Section builders ──────────────────────────────────────────

function buildSummarySection(summary, layout) {
  if (!summary) return '';
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Profile</div><div class="section-body"><p class="summary-text">${summary}</p></div></div>`;
  }
  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Professional Profile</div><div class="ep-row"><div class="ep-label">Summary</div><div class="ep-value">${summary}</div></div></div>`;
  }
  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">01</div><div class="section-title">Profile</div><div class="section-line"></div></div><p class="summary-text">${summary}</p></div>`;
  }
  return `<div class="section"><div class="section-title">Professional Summary</div><p class="summary-text">${summary}</p></div>`;
}

function buildSkillsSection(skills, layout) {
  if (!skills || !skills.length) return '';
  const skillNames = skills.map(s => (typeof s === 'string' ? s : s.name || '')).filter(Boolean);

  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Skills</div><div class="section-body"><p class="skills-text">${skillNames.join(' · ')}</p></div></div>`;
  }
  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Skills</div><div class="ep-row"><div class="ep-label">Technical Skills</div><div class="ep-value">${skillNames.join(', ')}</div></div></div>`;
  }
  if (layout === 'creative') {
    const tags = skillNames.map(s => `<span class="skill-tag">${s}</span>`).join('');
    return `<div class="section"><div class="section-header"><div class="section-num">02</div><div class="section-title">Skills</div><div class="section-line"></div></div><div class="skills-wrap">${tags}</div></div>`;
  }
  if (layout === 'modern-header' || layout === 'single') {
    const tags = skillNames.map(s => `<span class="skill-tag">${s}</span>`).join('');
    return `<div class="section"><div class="section-title">Technical Skills</div><div class="skills-wrap">${tags}</div></div>`;
  }
  // ats-pure: plain text
  return `<div class="section"><div class="section-title">Skills</div><p class="skills-text">${skillNames.join(', ')}</p></div>`;
}

function buildExperienceSection(experiences, layout) {
  if (!experiences || !experiences.length) return '';

  const sectionNum = layout === 'creative' ? '03' : null;

  const entries = experiences.map(exp => {
    const bullets = (exp.bullets || []).map(b => `<li>${b}</li>`).join('');
    const dates   = exp.dates || [fmtDate(exp.start_date), exp.ongoing ? 'Present' : fmtDate(exp.end_date)].filter(Boolean).join(' – ');

    if (layout === 'ats') {
      return `<div class="exp-entry">
        <div class="exp-header"><span class="exp-title">${exp.role || exp.title || ''}</span></div>
        <div class="exp-company-line">${exp.company || ''} | ${dates}</div>
        <ul>${bullets}</ul>
      </div>`;
    }
    if (layout === 'side-label') {
      return `<div class="exp-entry">
        <div class="exp-top"><span class="exp-role">${exp.role || exp.title || ''}</span><span class="exp-dates">${dates}</span></div>
        <div class="exp-company">${exp.company || ''}</div>
        <ul>${bullets}</ul>
      </div>`;
    }
    if (layout === 'europass') {
      return `<div class="exp-entry">
        <div class="exp-dates-label">${dates}</div>
        <div class="exp-role">${exp.role || exp.title || ''}</div>
        <div class="exp-company">${exp.company || ''}</div>
        <ul class="exp-desc-list">${bullets}</ul>
      </div>`;
    }
    if (layout === 'creative') {
      return `<div class="exp-entry">
        <div class="exp-timeline"><div class="exp-dot"></div><div class="exp-line"></div></div>
        <div class="exp-body">
          <div class="exp-role">${exp.role || exp.title || ''}</div>
          <div class="exp-meta"><span class="exp-company">${exp.company || ''}</span><span class="exp-dates">${dates}</span></div>
          <ul>${bullets}</ul>
        </div>
      </div>`;
    }
    // default (classic, modern, executive, technical, harvard, startup, wallstreet, sidebar-main)
    return `<div class="exp-entry">
      <div class="exp-header">
        <div class="exp-meta">
          <span class="exp-role">${exp.role || exp.title || ''}</span>
          <span class="exp-company">${exp.company || ''}</span>
        </div>
        <span class="exp-dates">${dates}</span>
      </div>
      <ul>${bullets}</ul>
    </div>`;
  }).join('');

  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">${sectionNum}</div><div class="section-title">Experience</div><div class="section-line"></div></div>${entries}</div>`;
  }
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Experience</div><div class="section-body">${entries}</div></div>`;
  }
  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Work Experience</div>${entries}</div>`;
  }
  return `<div class="section"><div class="section-title">Experience</div>${entries}</div>`;
}

function buildEducationSection(education, layout) {
  if (!education || !education.length) return '';

  const entries = education.map(edu => {
    const dates = [fmtDate(edu.start_date), edu.ongoing ? 'Present' : fmtDate(edu.end_date)].filter(Boolean).join(' – ');
    const grade = edu.grade ? ` — ${edu.grade}` : '';

    if (layout === 'europass') {
      return `<div class="edu-entry">
        <div class="ep-row">
          <div class="ep-label">${dates}</div>
          <div class="ep-value">
            <strong>${edu.degree} in ${edu.field || ''}</strong><br/>
            ${edu.institution}${grade}
          </div>
        </div>
      </div>`;
    }
    if (layout === 'side-label') {
      return `<div class="edu-entry">
        <div class="edu-top"><span class="edu-degree">${edu.degree}</span><span class="edu-dates">${dates}</span></div>
        <div class="edu-institution">${edu.institution}</div>
        ${edu.field ? `<div class="edu-detail">${edu.field}${grade}</div>` : ''}
      </div>`;
    }
    return `<div class="edu-entry">
      <div class="edu-header">
        <div>
          <div class="edu-degree">${edu.degree}${edu.field ? ` in ${edu.field}` : ''}</div>
          <div class="edu-institution">${edu.institution}</div>
        </div>
        <div class="edu-dates">${dates}${grade}</div>
      </div>
      ${edu.highlights ? `<div class="edu-detail">${edu.highlights}</div>` : ''}
    </div>`;
  }).join('');

  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Education</div>${entries}</div>`;
  }
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Education</div><div class="section-body">${entries}</div></div>`;
  }
  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">04</div><div class="section-title">Education</div><div class="section-line"></div></div>${entries}</div>`;
  }
  return `<div class="section"><div class="section-title">Education</div>${entries}</div>`;
}

function buildCertificationsSection(certs, layout) {
  if (!certs || !certs.length) return '';
  const items = certs.map(c => {
    const year = c.issue_date ? fmtDate(c.issue_date) : '';
    return `<li><strong>${c.name}</strong> — ${c.issuer || ''}${year ? ` (${year})` : ''}</li>`;
  }).join('');

  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Certifications</div>${certs.map(c => `<div class="cert-item"><span class="cert-name">${c.name}</span> — ${c.issuer || ''}</div>`).join('')}</div>`;
  }
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Certifications</div><div class="section-body"><ul class="cert-list">${items}</ul></div></div>`;
  }
  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">05</div><div class="section-title">Certifications</div><div class="section-line"></div></div><ul class="cert-list">${items}</ul></div>`;
  }
  return `<div class="section"><div class="section-title">Certifications</div><ul class="cert-list">${items}</ul></div>`;
}

function buildProjectsSection(projects, layout) {
  if (!projects || !projects.length) return '';

  const entries = projects.map(p => {
    if (layout === 'europass') {
      return `<div class="proj-item"><div class="proj-title">${p.title}</div><div class="proj-desc">${p.description || ''}</div></div>`;
    }
    if (layout === 'creative') {
      return `<div class="proj-entry">
        <div class="proj-title">${p.title}</div>
        <div class="proj-tech">${p.tech_stack || ''}</div>
        <div class="proj-desc">${p.description || ''}</div>
      </div>`;
    }
    return `<div class="proj-entry">
      <div class="proj-title">${p.title}</div>
      ${p.tech_stack ? `<div class="proj-tech">${p.tech_stack}</div>` : ''}
      ${p.description ? `<div class="proj-desc">${p.description}</div>` : ''}
    </div>`;
  }).join('');

  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">Projects</div>${entries}</div>`;
  }
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">Projects</div><div class="section-body">${entries}</div></div>`;
  }
  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">06</div><div class="section-title">Projects</div><div class="section-line"></div></div>${entries}</div>`;
  }
  return `<div class="section"><div class="section-title">Projects</div>${entries}</div>`;
}

function buildReferencesSection(refs, layout) {
  if (!refs || !refs.length) return '';

  const entries = refs.map(r => {
    return `<div class="ref-entry">
      <div class="ref-name">${r.name}</div>
      <div class="ref-detail">${[r.title, r.organisation].filter(Boolean).join(', ')}</div>
    </div>`;
  }).join('');

  if (layout === 'europass') {
    return `<div class="ep-section"><div class="ep-section-title">References</div>${entries}</div>`;
  }
  if (layout === 'side-label') {
    return `<div class="section"><div class="section-label">References</div><div class="section-body">${entries}</div></div>`;
  }
  if (layout === 'creative') {
    return `<div class="section"><div class="section-header"><div class="section-num">07</div><div class="section-title">References</div><div class="section-line"></div></div>${entries}</div>`;
  }
  return `<div class="section"><div class="section-title">References</div>${entries}</div>`;
}

// ── Sidebar template special builder ─────────────────────────

function buildSidebarSections(aiOutput, baseCv) {
  const skills = safeArr(aiOutput.skills_to_emphasize) || safeArr(baseCv?.skills);
  const edu    = safeArr(aiOutput.education_entries)   || safeArr(baseCv?.education);
  const certs  = safeArr(aiOutput.certifications_to_include) || safeArr(baseCv?.certifications);

  const skillsHtml = skills.length
    ? `<div class="sidebar-section"><div class="sidebar-title">Skills</div>${skills.map(s => `<div class="sidebar-skill">${s}</div>`).join('')}</div>`
    : '';

  const eduHtml = edu.length
    ? `<div class="sidebar-section"><div class="sidebar-title">Education</div>${edu.map(e => `<div class="sidebar-edu"><div class="sidebar-degree">${e.degree}</div><div class="sidebar-institution">${e.institution}</div></div>`).join('')}</div>`
    : '';

  const certHtml = certs.length
    ? `<div class="sidebar-section"><div class="sidebar-title">Certifications</div>${certs.map(c => `<div class="sidebar-cert">${c.name}</div>`).join('')}</div>`
    : '';

  return { skillsHtml, eduHtml, certHtml };
}

// ── Fallback helpers ──────────────────────────────────────────

// Claude sometimes returns arrays as JSON strings — parse and always return an array
function safeArr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  return [];
}

function normExperiences(exps = []) {
  return exps.map(e => ({
    role:    e.title || e.role || '',
    company: e.company || '',
    dates:   [fmtDate(e.start_date), e.ongoing ? 'Present' : fmtDate(e.end_date)].filter(Boolean).join(' – '),
    bullets: e.bullets || (e.description ? [e.description] : []),
  }));
}
function normEducation(edu = []) {
  return edu.map(e => ({
    institution: e.institution || '',
    degree:      e.degree || '',
    field:       e.field || '',
    dates:       [fmtDate(e.start_date), e.ongoing ? 'Present' : fmtDate(e.end_date)].filter(Boolean).join(' – '),
    grade:       e.grade || '',
    highlights:  e.highlights || e.description || '',
  }));
}
function normCerts(certs = []) {
  return certs.map(c => ({ name: c.name || '', issuer: c.issuer || '', issue_date: c.issue_date || '' }));
}
function normProjects(projs = []) {
  return projs.map(p => ({ title: p.title || '', tech_stack: p.tech_stack || (p.tags || []).join(', '), description: p.description || p.short_description || '' }));
}
function normRefs(refs = []) {
  return refs.map(r => ({ name: r.name || '', title: r.title || '', organisation: r.organisation || r.company || '' }));
}

// ── HTML builder (no Puppeteer) ───────────────────────────────
function buildCvHtml({
  aiOutput,
  baseCv      = {},
  templateId  = 'classic',
  colorScheme = 'colored',
  accentColor = '#2563EB',
  fontFamily  = 'inter',
  fontSize    = '10.5pt',
  lineDensity = 'normal',
  sections    = ['summary', 'skills', 'experience', 'education', 'certifications'],
}) {
  const tmpl   = templateSvc.getTemplateById(templateId);
  const layout = tmpl.layout || 'single';

  // 1. Load + colour + font-override the template
  let html = templateSvc.loadCvTemplate(templateId);
  html = templateSvc.applyColorScheme(html, { colorScheme, accentColor });
  html = templateSvc.applyFontSettings(html, { fontFamily, fontSize, lineDensity });

  // 2. Profile — baseCv (DB) is authoritative; final_cv_json is AI's optional override
  const baseCvJson = aiOutput.final_cv_json || {};
  const profile    = {
    name:         baseCv.name         || baseCvJson.name         || '',
    headline:     baseCv.headline     || baseCvJson.headline     || '',
    email:        baseCv.email        || baseCvJson.email        || '',
    phone:        baseCv.phone        || baseCvJson.phone        || '',
    location:     baseCv.location     || baseCvJson.location     || '',
    github_url:   baseCv.github_url   || baseCvJson.github_url   || '',
    linkedin_url: baseCv.linkedin_url || baseCvJson.linkedin_url || '',
  };

  // 3. Header tokens
  const contacts = buildContactVariants(profile);
  html = html
    .replaceAll('{{NAME}}',         profile.name)
    .replaceAll('{{HEADLINE}}',     profile.headline)
    .replaceAll('{{EMAIL}}',        profile.email)
    .replaceAll('{{GITHUB_URL}}',   profile.github_url)
    .replaceAll('{{LINKEDIN_URL}}', profile.linkedin_url)
    .replaceAll('{{DATE}}',         new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  Object.entries(contacts).forEach(([k, v]) => { html = html.replaceAll(`{{${k}}}`, v); });

  // 4. Resolve data — AI first (unwrap string-JSON), base CV fallback
  const sectSet = new Set(sections);
  const aiSkills   = safeArr(aiOutput.skills_to_emphasize);
  const aiExps     = safeArr(aiOutput.tailored_experience);
  const aiEdu      = safeArr(aiOutput.education_entries);
  const aiCerts    = safeArr(aiOutput.certifications_to_include);
  const aiProjects = safeArr(aiOutput.project_highlights);
  const aiRefs     = safeArr(aiOutput.references_to_include);

  const effectiveSummary  = aiOutput.cv_summary || '';
  const effectiveSkills   = aiSkills.length   > 0 ? aiSkills   : (baseCv.skills || []).map(s => (typeof s === 'string' ? s : s.name || ''));
  const effectiveExps     = aiExps.length     > 0 ? aiExps     : normExperiences(baseCv.experiences || []);
  const effectiveEdu      = aiEdu.length      > 0 ? aiEdu      : normEducation(baseCv.education || []);
  const effectiveCerts    = aiCerts.length    > 0 ? aiCerts    : normCerts(baseCv.certifications || []);
  const effectiveProjects = aiProjects.length > 0 ? aiProjects : normProjects(baseCv.projects || []);
  const effectiveRefs     = aiRefs.length     > 0 ? aiRefs     : normRefs(baseCv.references || baseCv.referees || []);

  // 5. Inject sections
  if (layout === 'sidebar') {
    const effectiveAiForSidebar = {
      ...aiOutput,
      skills_to_emphasize:      effectiveSkills,
      education_entries:         effectiveEdu,
      certifications_to_include: effectiveCerts,
    };
    const { skillsHtml, eduHtml, certHtml } = buildSidebarSections(effectiveAiForSidebar, baseCvJson);
    html = html
      .replaceAll('{{SIDEBAR_SKILLS}}',        sectSet.has('skills')         ? skillsHtml : '')
      .replaceAll('{{SIDEBAR_EDUCATION}}',     sectSet.has('education')      ? eduHtml    : '')
      .replaceAll('{{SIDEBAR_CERTIFICATIONS}}',sectSet.has('certifications') ? certHtml   : '')
      .replaceAll('{{SECTION_SUMMARY}}',       sectSet.has('summary')        ? buildSummarySection(effectiveSummary, layout) : '')
      .replaceAll('{{SECTION_EXPERIENCE}}',    sectSet.has('experience')     ? buildExperienceSection(effectiveExps, layout) : '')
      .replaceAll('{{SECTION_PROJECTS}}',      sectSet.has('projects')       ? buildProjectsSection(effectiveProjects, layout) : '')
      .replaceAll('{{SECTION_REFERENCES}}',    sectSet.has('references')     ? buildReferencesSection(effectiveRefs, layout) : '')
      .replaceAll('{{SECTION_SKILLS}}',        '')
      .replaceAll('{{SECTION_EDUCATION}}',     '')
      .replaceAll('{{SECTION_CERTIFICATIONS}}','');
  } else {
    const sectionMap = {
      '{{SECTION_SUMMARY}}':       sectSet.has('summary')        ? buildSummarySection(effectiveSummary, layout)          : '',
      '{{SECTION_SKILLS}}':        sectSet.has('skills')         ? buildSkillsSection(effectiveSkills, layout)             : '',
      '{{SECTION_EXPERIENCE}}':    sectSet.has('experience')     ? buildExperienceSection(effectiveExps, layout)           : '',
      '{{SECTION_EDUCATION}}':     sectSet.has('education')      ? buildEducationSection(effectiveEdu, layout)             : '',
      '{{SECTION_CERTIFICATIONS}}':sectSet.has('certifications') ? buildCertificationsSection(effectiveCerts, layout)      : '',
      '{{SECTION_PROJECTS}}':      sectSet.has('projects')       ? buildProjectsSection(effectiveProjects, layout)         : '',
      '{{SECTION_REFERENCES}}':    sectSet.has('references')     ? buildReferencesSection(effectiveRefs, layout)           : '',
    };
    Object.entries(sectionMap).forEach(([token, value]) => { html = html.replaceAll(token, value); });
  }

  return html;
}

// ── PDF generator ─────────────────────────────────────────────
async function generate({
  applicationId,
  version,
  aiOutput,
  baseCv      = {},
  language    = 'en',
  templateId  = 'classic',
  colorScheme = 'colored',
  accentColor = '#2563EB',
  fontFamily  = 'inter',
  fontSize    = '10.5pt',
  lineDensity = 'normal',
  sections    = ['summary', 'skills', 'experience', 'education', 'certifications'],
}) {
  const html = buildCvHtml({ aiOutput, baseCv, templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity, sections });

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-crash-reporter', '--disable-gpu', '--no-zygote',
      '--no-first-run', '--headless',
    ],
    env: { ...process.env, HOME: '/tmp' },
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format:          'A4',
    printBackground: true,
    margin:          { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  });
  await browser.close();

  return { pdfBuffer, sourceHtml: html };
}

module.exports = { generate, buildCvHtml };
