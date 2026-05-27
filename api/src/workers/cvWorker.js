'use strict';
const pool               = require('../db/client');
const cvTailoringService = require('../services/cvGeneration/cvTailoringService');
const pdfService         = require('../services/cvGeneration/pdfService');

async function generateCv(applicationId, { force = false, language = 'en' } = {}) {
  // Step 1: AI tailoring (includes cost guard)
  const tailoring = await cvTailoringService.generate(applicationId, { force, language });

  // If cached and not forced, return the existing document as-is.
  // file_data is stored in the DB so no URL expiry to worry about.
  if (tailoring.cached && !force) {
    return { ...tailoring.document, cached: true };
  }

  const { document: aiDoc, aiOutput } = tailoring;

  // Step 2: PDF generation — returns raw buffer, stored directly in DB
  const { pdfBuffer, sourceHtml } = await pdfService.generate({
    applicationId,
    version:  aiDoc.version,
    aiOutput,
    language,
  });

  // Step 3: Update the document row — store PDF bytes in file_data BYTEA column
  const updatedDoc = await pool.query(
    'UPDATE application_documents SET file_data = $1, source_html = $2 WHERE id = $3 RETURNING *',
    [pdfBuffer, sourceHtml, aiDoc.id]
  );

  // Step 4: Create CV_GENERATED event
  await pool.query(
    `INSERT INTO application_events (application_id, event_type, description)
     VALUES ($1, 'CV_GENERATED', $2)`,
    [applicationId, `CV v${aiDoc.version} generated (${language.toUpperCase()})`]
  );

  // Step 5: Update application status to CV_GENERATED (only if currently DRAFT)
  await pool.query(
    `UPDATE applications SET status = 'CV_GENERATED', updated_at = NOW()
     WHERE id = $1 AND status = 'DRAFT'`,
    [applicationId]
  );

  return { ...updatedDoc.rows[0], cached: false };
}

module.exports = { generateCv };
