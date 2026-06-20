'use strict';

const pool = require('../db/client');

function resolvePlaceholders(template, ctx) {
  if (!template) return '';
  return template
    .replace(/\{\{company\}\}/g,        ctx.company        || 'the company')
    .replace(/\{\{role\}\}/g,           ctx.role           || 'the position')
    .replace(/\{\{recruiter_name\}\}/g, ctx.recruiter_name || 'Hiring Team')
    .replace(/\{\{your_name\}\}/g,      ctx.your_name      || '')
    .replace(/\{\{applied_date\}\}/g,   ctx.applied_date   || '')
    .replace(/\{\{interview_date\}\}/g, ctx.interview_date || '');
}

async function buildDraftContext(applicationId) {
  const { rows: apps } = await pool.query(`
    SELECT a.company_name, a.job_title, a.applied_at, a.interview_at,
           p.name AS full_name, p.cv_display_name, p.cv_email_primary,
           (SELECT c.name FROM application_contacts c
            WHERE c.application_id = a.id
              AND c.role IN ('recruiter','hr')
            ORDER BY c.created_at LIMIT 1) AS recruiter_name
    FROM applications a
    LEFT JOIN profile p ON TRUE
    WHERE a.id = $1
    LIMIT 1
  `, [applicationId]);

  if (!apps.length) return null;
  const a = apps[0];

  return {
    company:        a.company_name,
    role:           a.job_title,
    recruiter_name: a.recruiter_name || 'Hiring Team',
    your_name:      a.cv_display_name || a.full_name || '',
    applied_date:   a.applied_at
      ? new Date(a.applied_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
      : '',
    interview_date: a.interview_at
      ? new Date(a.interview_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
      : '',
  };
}

async function generateDraft(applicationId, templateId) {
  const [ctx, tpl] = await Promise.all([
    buildDraftContext(applicationId),
    pool.query('SELECT * FROM email_templates WHERE id=$1', [templateId]),
  ]);

  if (!ctx) throw Object.assign(new Error('Application not found'), { status: 404 });
  if (!tpl.rows.length) throw Object.assign(new Error('Template not found'), { status: 404 });

  const tmpl = tpl.rows[0];
  return {
    subject: resolvePlaceholders(tmpl.subject_template, ctx),
    body:    resolvePlaceholders(tmpl.body_template,    ctx),
    context: ctx,
    template: tmpl,
  };
}

module.exports = { generateDraft, resolvePlaceholders };
