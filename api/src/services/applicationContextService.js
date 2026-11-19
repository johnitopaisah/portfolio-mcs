'use strict';
/**
 * "Application context" (Interview tab): the CV you sent for an application
 * and the job description — used by the AI for interview questions, the prep
 * checklist and follow-up email drafts.
 *
 * CV sources:
 *   document:<id>  a CV from the CV Library (application_documents)
 *   base:<id>      one of your base CV versions (base_cv_versions)
 *   upload:<id>    a PDF you uploaded — stored as a CV document on this
 *                  application, so it also appears in the CV Library
 * Picking a library document or uploading also records it as the document
 * submitted for this application (applications.submitted_doc_id).
 */

const pool = require('../db/client');

const MAX_TEXT = 20000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

// Flattens a CV's structured content_json into readable text for the AI.
function jsonToText(value, depth = 0) {
  if (value == null || depth > 8) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(v => jsonToText(v, depth + 1)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k]) => !/^(id|_id|logo|photo|image|mime|color|accent|template|style)/i.test(k))
      .map(([k, v]) => {
        const t = jsonToText(v, depth + 1);
        if (!t) return '';
        return typeof v === 'object' ? `${k.replace(/_/g, ' ')}:\n${t}` : `${k.replace(/_/g, ' ')}: ${t}`;
      })
      .filter(Boolean).join('\n');
  }
  return '';
}

const clip = s => String(s || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);

async function getApplicationContext(applicationId, db = pool) {
  const { rows } = await db.query(
    `SELECT context_cv_source, context_cv_text, context_job_description FROM applications WHERE id = $1`,
    [applicationId]
  );
  if (!rows.length) throw Object.assign(new Error('Application not found'), { status: 404 });
  const r = rows[0];
  return {
    cv_source:       r.context_cv_source || null,
    cv_text:         r.context_cv_text || '',
    job_description: r.context_job_description || '',
    cv_label:        await labelFor(r.context_cv_source, db),
  };
}

async function labelFor(source, db = pool) {
  const m = /^(document|base|upload):(\d+)$/.exec(source || '');
  if (!m) return null;
  if (m[1] === 'base') {
    const { rows } = await db.query('SELECT name, version FROM base_cv_versions WHERE id = $1', [m[2]]);
    return rows[0] ? `Base CV — ${rows[0].name}` : null;
  }
  const { rows } = await db.query(
    `SELECT d.content_json->>'filename' AS filename, d.created_at, a.company_name
     FROM application_documents d JOIN applications a ON a.id = d.application_id WHERE d.id = $1`, [m[2]]);
  if (!rows[0]) return null;
  return m[1] === 'upload'
    ? `Uploaded — ${rows[0].filename || 'CV.pdf'}`
    : `CV Library — ${rows[0].company_name} (${new Date(rows[0].created_at).toISOString().slice(0, 10)})`;
}

/** Choices for the "CV used" picker. */
async function listCvOptions() {
  const [docs, bases] = await Promise.all([
    pool.query(
      `SELECT d.id, a.company_name, a.job_title, d.created_at, d.generated_by_ai,
              d.content_json->>'filename' AS filename
       FROM application_documents d JOIN applications a ON a.id = d.application_id
       WHERE d.document_type = 'CV'
       ORDER BY d.created_at DESC LIMIT 200`),
    pool.query(`SELECT id, name, version, is_active, created_at FROM base_cv_versions ORDER BY version DESC`),
  ]);
  return {
    documents: docs.rows.map(d => ({
      source: `document:${d.id}`,
      label: `${d.company_name} — ${d.job_title}${d.filename ? ` (${d.filename})` : ''}`,
      created_at: d.created_at,
    })),
    base_versions: bases.rows.map(b => ({
      source: `base:${b.id}`,
      label: `${b.name}${b.is_active ? ' (active)' : ''}`,
      created_at: b.created_at,
    })),
  };
}

async function textForSource(source, db = pool) {
  const m = /^(document|base):(\d+)$/.exec(source || '');
  if (!m) throw Object.assign(new Error('Unknown CV source'), { status: 400 });
  if (m[1] === 'base') {
    const { rows } = await db.query('SELECT content_json FROM base_cv_versions WHERE id = $1', [m[2]]);
    if (!rows.length) throw Object.assign(new Error('Base CV not found'), { status: 404 });
    return { text: clip(jsonToText(rows[0].content_json)), documentId: null };
  }
  const { rows } = await db.query(
    `SELECT id, content_json, source_html FROM application_documents WHERE id = $1 AND document_type = 'CV'`, [m[2]]);
  if (!rows.length) throw Object.assign(new Error('CV document not found'), { status: 404 });
  const d = rows[0];
  const text = d.content_json?.extracted_text
    || jsonToText(d.content_json)
    || String(d.source_html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return { text: clip(text), documentId: d.id };
}

/**
 * Saves the context. Fields left undefined are unchanged; cv_source null
 * clears the CV.
 */
async function setApplicationContext(applicationId, { cv_source, job_description } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM applications WHERE id = $1 FOR UPDATE', [applicationId]);
    if (!exists.rows.length) throw Object.assign(new Error('Application not found'), { status: 404 });

    if (cv_source !== undefined) {
      if (cv_source === null || cv_source === '') {
        await client.query(
          `UPDATE applications SET context_cv_source = NULL, context_cv_text = NULL, updated_at = NOW() WHERE id = $1`,
          [applicationId]);
      } else {
        const { text, documentId } = await textForSource(cv_source, client);
        await client.query(
          `UPDATE applications SET context_cv_source = $1, context_cv_text = $2,
             submitted_doc_id = COALESCE($3, submitted_doc_id), updated_at = NOW()
           WHERE id = $4`,
          [cv_source, text, documentId, applicationId]);
      }
    }
    if (job_description !== undefined) {
      await client.query(
        `UPDATE applications SET context_job_description = NULLIF($1, ''), updated_at = NOW() WHERE id = $2`,
        [clip(job_description), applicationId]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getApplicationContext(applicationId);
}

/** Extracts text from an uploaded PDF CV and stores it as this application's CV. */
async function uploadCv(applicationId, file) {
  if (!file || !file.buffer?.length) throw Object.assign(new Error('No file uploaded'), { status: 400 });
  if (file.buffer.length > MAX_PDF_BYTES) throw Object.assign(new Error('PDF must be 5 MB or smaller'), { status: 413 });
  if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw Object.assign(new Error('Only PDF files are supported'), { status: 415 });
  }

  let text;
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: file.buffer });
    try { text = (await parser.getText()).text; } finally { await parser.destroy?.().catch?.(() => {}); }
  } catch {
    throw Object.assign(new Error("Couldn't read this PDF — is it a scanned image or password-protected?"), { status: 422 });
  }
  text = clip(String(text || '').replace(/^-- \d+ of \d+ --$/gm, ''));
  if (text.length < 50) {
    throw Object.assign(new Error('No readable text found in this PDF (scanned image?). Paste your CV text instead.'), { status: 422 });
  }

  const filename = String(file.originalname || 'CV.pdf').replace(/[^\w .()-]/g, '_').slice(0, 120);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM applications WHERE id = $1 FOR UPDATE', [applicationId]);
    if (!exists.rows.length) throw Object.assign(new Error('Application not found'), { status: 404 });
    const { rows } = await client.query(
      `INSERT INTO application_documents (application_id, document_type, content_json, file_data, generated_by_ai)
       VALUES ($1, 'CV', $2, $3, FALSE) RETURNING id`,
      [applicationId, JSON.stringify({ source: 'upload', filename, extracted_text: text }), file.buffer]);
    await client.query(
      `UPDATE applications SET context_cv_source = $1, context_cv_text = $2, submitted_doc_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [`upload:${rows[0].id}`, text, rows[0].id, applicationId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getApplicationContext(applicationId);
}

module.exports = {
  getApplicationContext, setApplicationContext, uploadCv, listCvOptions, jsonToText,
  MAX_PDF_BYTES,
};
