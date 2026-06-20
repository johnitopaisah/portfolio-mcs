'use strict';

// Single source of truth for "which email goes on the CV/cover letter".
// Used by baseCvService, coverLetterService, and cvIdentity's
// build-contact-fields — all three previously hardcoded profile.email.
function resolveCvEmail(p) {
  const appEmails     = p.application_emails || {};
  const gmail         = appEmails.gmail        || p.email            || '';
  const professional  = appEmails.professional || p.cv_email_primary || '';

  switch (p.cv_email_choice) {
    case 'professional': return professional || gmail;
    case 'both':          return [professional, gmail].filter(Boolean).join(' / ');
    case 'none':          return '';
    case 'gmail':
    default:              return gmail || professional;
  }
}

module.exports = { resolveCvEmail };
