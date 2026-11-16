'use strict';
const crypto           = require('crypto');
const { ImapFlow }     = require('imapflow');
const { simpleParser } = require('mailparser');

/**
 * IMAP access for the second, non-Google mailbox (the Zoho professional
 * inbox). Only talks to the mail server — de-duplication, classification and
 * progress tracking live in imapSyncService.js.
 *
 * Every folder is opened read-only, so nothing is ever marked \Seen, moved
 * or deleted.
 */

// Folders that never hold inbound recruitment mail. Matched by RFC 6154
// special-use flag first (locale-independent), then by name.
const EXCLUDED_SPECIAL_USE = new Set(['\\Sent', '\\Drafts', '\\Trash', '\\All', '\\Flagged']);
const DEFAULT_EXCLUDED_NAMES = ['Sent', 'Drafts', 'Trash', 'Templates', 'Snoozed', 'Outbox'];

const MAX_DOWNLOAD_BYTES = 512 * 1024; // enough for the text part; attachments are cut off

function excludedNames(env = process.env) {
  const extra = (env.IMAP_EXCLUDE_FOLDERS || '').split(',').map(s => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_EXCLUDED_NAMES, ...extra].map(s => s.toLowerCase()));
}

function createClient(env = process.env) {
  const client = new ImapFlow({
    host:   env.IMAP_HOST,
    port:   parseInt(env.IMAP_PORT || '993', 10),
    secure: env.IMAP_SECURE !== 'false',
    // IMAP_USER/IMAP_PASSWORD fall back to NOTIFY_EMAIL_USER/NOTIFY_EMAIL_PASS —
    // notify.js already authenticates to this same mailbox via SMTP, so the
    // one Zoho app-password is not duplicated across two secrets.
    auth: {
      user: env.IMAP_USER     || env.NOTIFY_EMAIL_USER,
      pass: env.IMAP_PASSWORD || env.NOTIFY_EMAIL_PASS,
    },
    // Zoho regularly drops idle or slow sessions ("Unexpected close",
    // "Failed to receive greeting"). Bounded timeouts turn a hang into an
    // error the sync can recover from instead of a killed pod.
    connectionTimeout: 30_000,
    greetingTimeout:   30_000,
    socketTimeout:     120_000,
    logger: false,
    ...(env.IMAP_TLS_INSECURE === 'true' ? { tls: { rejectUnauthorized: false } } : {}),
  });
  // Without a listener, a socket error emitted outside a pending command
  // is an unhandled 'error' event and crashes the process.
  client.on('error', err => { client.lastError = err; });
  return client;
}

/**
 * Folders to scan: every selectable folder except sent/drafts/trash-like
 * ones. Spam is included but flagged, so its mail can be held for review.
 * @returns {Promise<Array<{ path: string, specialUse: string|null, isSpam: boolean }>>}
 */
async function listScanFolders(client, env = process.env) {
  const exclude = excludedNames(env);
  const boxes   = await client.list();
  return boxes
    .filter(b => !b.flags?.has('\\Noselect') && !b.flags?.has('\\NonExistent'))
    .filter(b => !EXCLUDED_SPECIAL_USE.has(b.specialUse))
    .filter(b => !exclude.has(b.path.toLowerCase()) && !exclude.has((b.name || '').toLowerCase()))
    .map(b => ({
      path:       b.path,
      specialUse: b.specialUse || null,
      isSpam:     b.specialUse === '\\Junk' || /^(spam|junk)$/i.test(b.name || b.path),
    }));
}

// RFC 5322 Message-ID without angle brackets. Mail without one (rare, but
// some bulk senders omit it) gets a stable synthetic id so it can still be
// de-duplicated across folders and runs.
function messageIdOf(envelope = {}) {
  const raw = String(envelope.messageId || '').trim().replace(/^<|>$/g, '').trim();
  if (raw) return raw;
  const from = envelope.from?.[0]?.address || '';
  const date = envelope.date ? new Date(envelope.date).toISOString() : '';
  const hash = crypto.createHash('sha1').update(`${from}|${date}|${envelope.subject || ''}`).digest('hex');
  return `synthetic-${hash}`;
}

/**
 * UIDs to look at in the currently selected folder: everything after
 * lastUid, or — with no usable watermark — everything that arrived in the
 * last `lookbackDays` (server arrival time, not the sender's Date header).
 */
async function candidateUids(client, { lastUid, lookbackDays }) {
  let uids;
  if (lastUid != null) {
    // "N:*" always matches at least the highest UID, even when it is < N.
    uids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
    uids = (uids || []).filter(u => u > lastUid);
  } else {
    const since = new Date(Date.now() - lookbackDays * 864e5);
    uids = await client.search({ since }, { uid: true });
  }
  return (uids || []).map(Number).sort((a, b) => a - b);
}

/** Envelope-only pass: cheap, no bodies. */
async function fetchEnvelopes(client, uids) {
  if (!uids.length) return [];
  const out = [];
  for await (const m of client.fetch(uids.join(','), { uid: true, envelope: true, internalDate: true, size: true }, { uid: true })) {
    const env  = m.envelope || {};
    const from = env.from?.[0] || {};
    out.push({
      uid:          Number(m.uid),
      message_id:   messageIdOf(env),
      sender_email: from.address || '',
      sender_name:  from.name    || '',
      subject:      env.subject  || '',
      // Server arrival time. The Date header is set by the sender and can be
      // hours off (one in the future stalled the old worker for a day).
      received_at:  m.internalDate ? new Date(m.internalDate) : (env.date ? new Date(env.date) : new Date()),
      size:         m.size || 0,
    });
  }
  return out.sort((a, b) => a.uid - b.uid);
}

/**
 * Downloads (at most MAX_DOWNLOAD_BYTES of) one message and extracts what
 * the classifier needs. body_snippet is ALWAYS ≤ 500 chars.
 */
async function fetchBody(client, uid) {
  const { content } = await client.download(String(uid), false, { uid: true, maxBytes: MAX_DOWNLOAD_BYTES });
  const parsed = await simpleParser(content);
  // No native thread id over IMAP — the root Message-ID of the References
  // chain is stable across every reply in a conversation.
  const references = [].concat(parsed.references || []);
  const text = parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '');
  return {
    body_snippet: text.replace(/\s+/g, ' ').trim().slice(0, 500),
    thread_id:    references[0] || parsed.inReplyTo || parsed.messageId || null,
  };
}

module.exports = {
  createClient, listScanFolders, candidateUids, fetchEnvelopes, fetchBody, messageIdOf,
  EXCLUDED_SPECIAL_USE, DEFAULT_EXCLUDED_NAMES,
};
