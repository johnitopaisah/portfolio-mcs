'use strict';
// The CV PDF for a language: the uploaded EN/FR PDF (Profile page) if there
// is one, otherwise generated on the fly from the active base CV (no AI).
const pool = require('../db/client');

async function getCvPdf(lang) {
  if (lang !== 'en' && lang !== 'fr') throw Object.assign(new Error('lang must be en or fr'), { status: 400 });
  const col = lang === 'en' ? 'resume_en' : 'resume_fr';
  const { rows } = await pool.query(`SELECT ${col} AS pdf, ${col}_mime AS mime FROM profile LIMIT 1`);
  if (rows[0]?.pdf) return { buffer: rows[0].pdf, mime: rows[0].mime || 'application/pdf', filename: `cv-${lang}.pdf` };

  const baseCvService = require('./cvGeneration/baseCvService');
  const pdfService    = require('./cvGeneration/pdfService');
  const activeBaseCv  = await baseCvService.getActiveBaseCv();
  const baseCvJson    = activeBaseCv.content_json;
  const { pdfBuffer } = await pdfService.generate({
    applicationId: null,
    version:       activeBaseCv.version,
    aiOutput: {
      cv_summary:          baseCvJson.summary    || '',
      skills_to_emphasize: baseCvJson.skills     || [],
      tailored_experience: baseCvJson.experience || [],
      final_cv_json:       baseCvJson,
    },
    language: lang,
  });
  return { buffer: pdfBuffer, mime: 'application/pdf', filename: `cv-${lang}.pdf` };
}

module.exports = { getCvPdf };
