'use strict';
const { ImapFlow }   = require('imapflow');
const { simpleParser } = require('mailparser');

/**
 * Fetch emails received after `since` (Date object) from a second,
 * non-Google mailbox (e.g. a professional-domain inbox) via IMAP.
 *
 * Mirrors gmailService.fetchRecentEmails()'s return shape exactly, so
 * the worker can treat both sources identically. IDs are prefixed with
 * "imap_" since IMAP UIDs are small integers scoped to a folder and
 * could otherwise collide with Gmail's message ID string space.
 *
 * Downloads the full raw message and parses it with mailparser rather
 * than hand-picking IMAP body parts — mailparser correctly handles
 * MIME structure and Content-Transfer-Encoding (quoted-printable/base64)
 * decoding, which IMAP's raw BODY[TEXT] fetch does not do on its own.
 *
 * body_snippet is ALWAYS truncated to 500 chars max — never return full bodies.
 */
async function fetchRecentEmails(since) {
  // IMAP_USER/IMAP_PASSWORD fall back to NOTIFY_EMAIL_USER/NOTIFY_EMAIL_PASS —
  // notify.js already authenticates to this same mailbox via SMTP, so we
  // reuse that one credential instead of duplicating the Zoho app-password
  // across two secrets (duplication risks drift if it's ever rotated).
  const client = new ImapFlow({
    host:   process.env.IMAP_HOST,
    port:   parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER     || process.env.NOTIFY_EMAIL_USER,
      pass: process.env.IMAP_PASSWORD || process.env.NOTIFY_EMAIL_PASS,
    },
    logger: false,
  });

  const results = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ since }, { uid: true });

      for (const uid of uids) {
        let parsed;
        try {
          const { content } = await client.download(uid, false, { uid: true });
          parsed = await simpleParser(content);
        } catch {
          continue; // unreadable message — skip rather than fail the whole fetch
        }

        const from        = parsed.from?.value?.[0] || {};
        const senderEmail  = from.address || '';
        const senderName   = from.name    || '';
        const bodyText     = (parsed.text || '').slice(0, 500);

        results.push({
          gmail_message_id: `imap_${uid}`,
          sender_email:      senderEmail,
          sender_name:       senderName,
          subject:           parsed.subject || '',
          body_snippet:      bodyText,
          received_at:       parsed.date || new Date(),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return results;
}

module.exports = { fetchRecentEmails };
