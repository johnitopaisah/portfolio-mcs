'use strict';

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

async function generate({ applicationId, version, aiOutput, language = 'en' }) {
  // 1. Load template
  const templatePath = path.join(__dirname, '../../templates', `cv-template-${language}.html`);
  let html = fs.readFileSync(templatePath, 'utf8');

  // 2. Inject AI output into template
  const cv         = aiOutput;
  const baseCvJson = cv.final_cv_json || {};

  const experienceHtml = (cv.tailored_experience || []).map(exp => `
    <div class="exp-entry">
      <div class="exp-header"><strong>${exp.company}</strong> — <em>${exp.role}</em></div>
      <ul>${(exp.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
    </div>
  `).join('');

  const certHtml = (baseCvJson.certifications || []).map(c =>
    `<li>${c.name} — ${c.issuer} (${c.issue_date?.slice(0, 4) || ''})</li>`
  ).join('');

  // replaceAll handles tokens that appear more than once (e.g. {{EMAIL}} in href + link text)
  html = html
    .replaceAll('{{NAME}}',           baseCvJson.name         || '')
    .replaceAll('{{HEADLINE}}',       baseCvJson.headline      || '')
    .replaceAll('{{EMAIL}}',          baseCvJson.email         || '')
    .replaceAll('{{GITHUB_URL}}',     baseCvJson.github_url    || '')
    .replaceAll('{{LINKEDIN_URL}}',   baseCvJson.linkedin_url  || '')
    .replaceAll('{{SUMMARY}}',        cv.cv_summary            || '')
    .replaceAll('{{SKILLS}}',         (cv.skills_to_emphasize || []).join(', '))
    .replaceAll('{{EXPERIENCE}}',     experienceHtml)
    .replaceAll('{{CERTIFICATIONS}}', certHtml);

  // 3. Generate PDF with Puppeteer — return raw buffer, do not upload anywhere
  //
  // Container-safe Chromium flags:
  //   --no-sandbox / --disable-setuid-sandbox  : required when running as non-root
  //   --disable-dev-shm-usage                  : K8s limits /dev/shm to 64 MB by default;
  //                                              this makes Chrome use /tmp instead
  //   --disable-crash-reporter                 : stops crashpad handler from spawning
  //                                              (crashes with "--database required" in
  //                                              read-only container environments)
  //   --no-zygote / --no-first-run             : skip process setup not needed in headless mode
  //   --disable-gpu                            : no GPU available in containers
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--disable-gpu',
      '--no-zygote',
      '--no-first-run',
      '--headless',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format:          'A4',
    printBackground: true,
    margin:          { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });
  await browser.close();

  // Return buffer + source HTML. Caller stores file_data in the DB.
  return { pdfBuffer, sourceHtml: html };
}

module.exports = { generate };
