'use strict';

// One-off: finds application-confirmation emails that were linked to an
// EXISTING application at the same company although they name a different
// role — the pre-033 matcher decided on company alone — and records each as
// its own application.
//
// Report-only by default. Nothing is written without --apply.
//
//   node scripts/split-merged-confirmations.js            # list what would change
//   node scripts/split-merged-confirmations.js --apply    # make the changes
//
// In the cluster:
//   kubectl exec -n portfolio deploy/portfolio-api -- node scripts/split-merged-confirmations.js
//
// New applications are dated at the email's received time, so past weeks'
// counts come out right. The application an email is moved off is left
// as-is — if that email also changed its status, review it by hand.

require('dotenv').config();
const pool = require('../src/db/client');
const applicationMatchingService     = require('../src/services/emailTracking/applicationMatchingService');
const { createApplicationFromEmail } = require('../src/services/emailTracking/emailLinkingService');
const { roleSimilarity, isPlaceholderTitle, ROLE_DIFFERENT } = require('../src/services/emailTracking/roleSimilarity');

const APPLY = process.argv.includes('--apply');

// Emails classified before APPLICATION_CONFIRMATION existed sit under
// GENERAL_RESPONSE; recognise them by wording instead.
const CONFIRMATION_WORDING = /thank(s| you) for (applying|your application|your interest)|received your application|receipt of (your |an? )?application|application (was |has been )?(sent|received|submitted)|confirm\w* (the )?receipt|acknowledg|merci (pour|de) votre candidature|candidature a bien ete|bien recu votre candidature|accuse de reception/i;

function looksLikeConfirmation(email) {
  if (email.ai_classification === 'APPLICATION_CONFIRMATION') return true;
  if (email.ai_classification !== 'GENERAL_RESPONSE') return false;
  const text = `${email.subject || ''} ${email.raw_label || ''} ${email.body_snippet || ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return CONFIRMATION_WORDING.test(text);
}

async function run() {
  const { rows } = await pool.query(
    `SELECT er.id, er.subject, er.raw_label, er.body_snippet, er.received_at, er.sender_email, er.sender_name,
            er.ai_classification, er.extracted_company, er.extracted_role, er.application_id,
            a.company_name, a.job_title
     FROM email_responses er
     JOIN applications a ON a.id = er.application_id
     WHERE COALESCE(er.extracted_role, '') <> ''
       AND COALESCE(er.match_method, '') NOT IN ('manual_split', 'history_split')
     ORDER BY er.received_at`
  );

  const misfiled = rows.filter(e =>
    looksLikeConfirmation(e) &&
    !isPlaceholderTitle(e.job_title) &&
    roleSimilarity(e.job_title, e.extracted_role) < ROLE_DIFFERENT
  );

  console.log(`${misfiled.length} confirmation email(s) linked to an application for a different role.`);
  console.log(APPLY ? 'Mode: APPLY\n' : 'Mode: report only — re-run with --apply to make these changes\n');

  let created = 0, relinked = 0;
  for (const e of misfiled) {
    const day = new Date(e.received_at).toISOString().slice(0, 10);
    console.log(`#${e.id}  ${day}  "${(e.subject || '').slice(0, 70)}"`);
    console.log(`   linked to : ${e.company_name} — ${e.job_title} (application ${e.application_id})`);
    console.log(`   email says: ${e.extracted_role}`);
    if (!APPLY) { console.log(`   would     : record ${e.company_name} — ${e.extracted_role} as its own application\n`); continue; }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Oldest first, so a second email about a role split out a moment
      // ago joins that new application instead of creating another.
      const match = await applicationMatchingService.findMatch(client, {
        senderEmail:      e.sender_email,
        senderName:       e.sender_name,
        extractedCompany: e.extracted_company || e.company_name,
        extractedRole:    e.extracted_role,
        isConfirmation:   true,
        receivedAt:       e.received_at,
      });

      if (match.status === 'matched' && match.application.id !== e.application_id) {
        await client.query(
          `UPDATE email_responses SET application_id = $1, match_method = 'history_split' WHERE id = $2`,
          [match.application.id, e.id]
        );
        relinked++;
        console.log(`   done      : moved to application ${match.application.id} (${match.application.job_title})\n`);
      } else if (match.status === 'new' || match.status === 'none') {
        const app = await createApplicationFromEmail(client, {
          emailResponseId:  e.id,
          companyName:      e.company_name,
          role:             e.extracted_role,
          isConfirmation:   true,
          status:           'APPLIED',
          receivedAt:       e.received_at,
          createdAt:        e.received_at,
          eventDescription: `${e.ai_classification}: ${e.raw_label || e.subject || ''}`.trim(),
          matchMethod:      'history_split',
        });
        created++;
        console.log(`   done      : created application ${app.id}\n`);
      } else {
        console.log('   skipped   : already on the right application\n');
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`   FAILED    : ${err.message}\n`);
    } finally {
      client.release();
    }
  }

  if (APPLY) console.log(`Created ${created} application(s), moved ${relinked} email(s).`);
}

run()
  .then(() => pool.end())
  .catch(err => { console.error('Fatal:', err); process.exit(1); });
