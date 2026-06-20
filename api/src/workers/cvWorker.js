'use strict';

const pool               = require('../db/client');
const cvTailoringService = require('../services/cvGeneration/cvTailoringService');
const pdfService         = require('../services/cvGeneration/pdfService');
const baseCvService      = require('../services/cvGeneration/baseCvService');

async function generateCv(applicationId, {
  force       = false,
  language    = 'en',
  sections    = ['summary', 'skills', 'experience', 'education', 'certifications'],
  userHints   = '',
  hintChips   = [],
  intensity   = 'balanced',
  templateId  = 'classic',
  colorScheme = 'colored',
  accentColor = '#2563EB',
  fontFamily  = 'inter',
  fontSize    = '10.5pt',
  lineDensity = 'normal',
} = {}) {

  // Step 1: AI tailoring (cost guard + structured output)
  const tailoring = await cvTailoringService.generate(applicationId, {
    force, language, sections, userHints, hintChips, intensity,
    templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity,
  });

  if (tailoring.cached && !force) {
    return { ...tailoring.document, cached: true };
  }

  const { document: aiDoc, aiOutput } = tailoring;

  // Load base CV for pdfService fallback (ensures selected sections always render)
  const activeBaseCv = await baseCvService.getActiveBaseCv();

  // Step 2: PDF generation using selected template + colour + font
  const { pdfBuffer, sourceHtml } = await pdfService.generate({
    applicationId,
    version:  aiDoc.version,
    aiOutput,
    baseCv:   activeBaseCv.content_json || {},
    language,
    templateId,
    colorScheme,
    accentColor,
    fontFamily,
    fontSize,
    lineDensity,
    sections,
  });

  // Step 3: Store PDF bytes
  const updatedDoc = await pool.query(
    'UPDATE application_documents SET file_data = $1, source_html = $2 WHERE id = $3 RETURNING *',
    [pdfBuffer, sourceHtml, aiDoc.id]
  );

  // Step 4: Audit event
  await pool.query(
    `INSERT INTO application_events (application_id, event_type, description)
     VALUES ($1, 'CV_GENERATED', $2)`,
    [applicationId, `CV v${aiDoc.version} generated (${language.toUpperCase()}, template: ${templateId})`]
  );

  // Step 5: Advance status from DRAFT → CV_GENERATED
  await pool.query(
    `UPDATE applications SET status = 'CV_GENERATED', updated_at = NOW()
     WHERE id = $1 AND status = 'DRAFT'`,
    [applicationId]
  );

  return { ...updatedDoc.rows[0], cached: false };
}

module.exports = { generateCv };
