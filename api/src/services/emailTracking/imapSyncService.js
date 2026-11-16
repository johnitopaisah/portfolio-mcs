'use strict';
/**
 * Syncs the professional (Zoho) mailbox over IMAP: every folder, tracked by
 * UID, de-duplicated by Message-ID. See db/migrations/035_imap_multi_folder.sql.
 *
 *   1. Collect  — per folder: new UIDs since the folder's watermark (or a
 *                 look-back window when there is none), envelopes first,
 *                 drop duplicates and own-domain notifications, then
 *                 download bodies only for what is left and keep the mail
 *                 that looks recruitment-related.
 *   2. Process  — across all folders, oldest first (so a backfilled older
 *                 email can never overwrite a newer status): classify,
 *                 insert, link. Spam is inserted as PENDING and not linked
 *                 until the user keeps it on the dashboard.
 *   3. Advance  — move each folder's watermark up to what was processed.
 *                 A classification failure (Anthropic down / out of credit)
 *                 stops processing so that mail is retried next run.
 *
 * Dependencies are injectable for tests.
 */

const imapServiceDefault    = require('./imapService');
const classificationDefault = require('./emailClassificationService');
const linkingDefault        = require('./emailLinkingService');

const DEFAULTS = {
  lookbackDays:         3,
  maxPerFolder:         300,
  maxClassifyAttempts:  5,
};

function optionsFrom(env, overrides = {}) {
  const int = (v, d) => (Number.isFinite(parseInt(v, 10)) && parseInt(v, 10) > 0 ? parseInt(v, 10) : d);
  return {
    lookbackDays:        int(overrides.lookbackDays ?? env.IMAP_LOOKBACK_DAYS, DEFAULTS.lookbackDays),
    backfillDays:        overrides.backfillDays ? int(overrides.backfillDays, null) : null,
    maxPerFolder:        int(overrides.maxPerFolder ?? env.IMAP_MAX_PER_RUN, DEFAULTS.maxPerFolder),
    maxClassifyAttempts: int(overrides.maxClassifyAttempts ?? env.IMAP_MAX_CLASSIFY_ATTEMPTS, DEFAULTS.maxClassifyAttempts),
  };
}

// ── folder state ────────────────────────────────────────────────
async function getFolderState(db, sourceKey, folder) {
  const { rows } = await db.query(
    'SELECT uid_validity, last_uid FROM imap_folder_state WHERE source_account = $1 AND folder = $2',
    [sourceKey, folder]
  );
  return rows[0] ? { uidValidity: Number(rows[0].uid_validity), lastUid: Number(rows[0].last_uid) } : null;
}

// Never moves a watermark backwards under the same UIDVALIDITY; a new
// UIDVALIDITY replaces it outright (old UIDs are meaningless then).
async function setFolderState(db, sourceKey, folder, uidValidity, lastUid) {
  await db.query(
    `INSERT INTO imap_folder_state (source_account, folder, uid_validity, last_uid, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (source_account, folder) DO UPDATE SET
       last_uid = CASE WHEN imap_folder_state.uid_validity = EXCLUDED.uid_validity
                       THEN GREATEST(imap_folder_state.last_uid, EXCLUDED.last_uid)
                       ELSE EXCLUDED.last_uid END,
       uid_validity = EXCLUDED.uid_validity,
       updated_at   = NOW()`,
    [sourceKey, folder, uidValidity, lastUid]
  );
}

// ── de-duplication ──────────────────────────────────────────────
async function existingMessageIds(db, sourceKey, messageIds) {
  if (!messageIds.length) return new Set();
  const { rows } = await db.query(
    'SELECT message_id FROM email_responses WHERE source_account = $1 AND message_id = ANY($2)',
    [sourceKey, messageIds]
  );
  return new Set(rows.map(r => r.message_id));
}

// Rows written before migration 035 are keyed "imap_<INBOX uid>" with no
// message_id. Treat them as already seen, and fill in their message_id so
// they are recognised in any folder from now on.
async function adoptLegacyInboxRows(db, sourceKey, metas) {
  if (!metas.length) return new Set();
  const byKey = new Map(metas.map(m => [`imap_${m.uid}`, m]));
  const { rows } = await db.query(
    `SELECT id, gmail_message_id FROM email_responses
     WHERE source_account = $1 AND message_id IS NULL AND gmail_message_id = ANY($2)`,
    [sourceKey, [...byKey.keys()]]
  );
  const adopted = new Set();
  for (const r of rows) {
    const m = byKey.get(r.gmail_message_id);
    adopted.add(m.message_id);
    await db.query(
      `UPDATE email_responses SET message_id = $1, imap_folder = 'INBOX', imap_uid = $2
       WHERE id = $3 AND NOT EXISTS (
         SELECT 1 FROM email_responses WHERE source_account = $4 AND message_id = $1)`,
      [m.message_id, m.uid, r.id, sourceKey]
    ).catch(() => {}); // best effort — it is already treated as seen
  }
  return adopted;
}

// ── classification retry bookkeeping ────────────────────────────
async function recordClassifyFailure(db, sourceKey, messageId, err) {
  const { rows } = await db.query(
    `INSERT INTO imap_message_failures (source_account, message_id, attempts, last_error, updated_at)
     VALUES ($1, $2, 1, $3, NOW())
     ON CONFLICT (source_account, message_id) DO UPDATE SET
       attempts = imap_message_failures.attempts + 1, last_error = EXCLUDED.last_error, updated_at = NOW()
     RETURNING attempts`,
    [sourceKey, messageId, String(err?.message || err).slice(0, 500)]
  );
  return rows[0].attempts;
}

async function clearClassifyFailure(db, sourceKey, messageId) {
  await db.query(
    'DELETE FROM imap_message_failures WHERE source_account = $1 AND message_id = $2',
    [sourceKey, messageId]
  );
}

// ── insert ──────────────────────────────────────────────────────
async function insertEmail(db, sourceKey, email, classification, reviewStatus) {
  const { rows } = await db.query(
    `INSERT INTO email_responses
       (source_account, gmail_message_id, message_id, imap_folder, imap_uid,
        sender_email, sender_name, subject, body_snippet, received_at,
        ai_classification, confidence_score, raw_label, extracted_company, extracted_role,
        ai_suggested_status, thread_id, review_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      sourceKey, `mid:${email.message_id}`, email.message_id, email.folder, email.uid,
      email.sender_email, email.sender_name, email.subject, email.body_snippet, email.received_at,
      classification?.classification || 'UNKNOWN',
      classification?.confidence     || 0,
      classification?.summary        || '',
      classification?.extracted_company || '',
      classification?.extracted_role    || '',
      classification?.suggested_status  || null,
      email.thread_id || null,
      reviewStatus,
    ]
  );
  return rows[0]?.id || null;
}

/** Rebuilds the classifier result from a stored row (used when a held Spam email is kept). */
function classificationFromRow(row) {
  return {
    classification:    row.ai_classification,
    confidence:        Number(row.confidence_score) || 0,
    summary:           row.raw_label || '',
    suggested_status:  row.ai_suggested_status || undefined,
    extracted_company: row.extracted_company || '',
    extracted_role:    row.extracted_role || '',
  };
}

// ── phase 1: collect one folder ─────────────────────────────────
async function collectFolder({ client, db, sourceKey, folder, opts, imap, classification, ignoreDomains, log }) {
  const result = {
    path: folder.path, isSpam: folder.isSpam,
    scanned: 0, duplicates: 0, ignored: 0, irrelevant: 0, unreadable: 0, candidates: 0,
    truncated: false, error: null,
    uidValidity: null, uidNext: null, maxUid: null, mode: null,
  };
  const candidates = [];

  const lock = await client.getMailboxLock(folder.path, { readOnly: true });
  try {
    result.uidValidity = Number(client.mailbox.uidValidity);
    result.uidNext     = Number(client.mailbox.uidNext) || null;

    const state = await getFolderState(db, sourceKey, folder.path);
    const useWatermark = !opts.backfillDays && state && state.uidValidity === result.uidValidity;
    result.mode = useWatermark ? 'watermark' : (opts.backfillDays ? 'backfill' : 'lookback');

    let uids = await imap.candidateUids(client, {
      lastUid:      useWatermark ? state.lastUid : null,
      lookbackDays: opts.backfillDays || opts.lookbackDays,
    });
    if (uids.length > opts.maxPerFolder) {
      uids = uids.slice(0, opts.maxPerFolder); // oldest first; the rest next run
      result.truncated = true;
    }
    result.scanned = uids.length;
    result.maxUid  = uids.length ? uids[uids.length - 1] : null;
    if (!uids.length) return { result, candidates };

    const metas = await imap.fetchEnvelopes(client, uids);
    const seen  = await existingMessageIds(db, sourceKey, metas.map(m => m.message_id));
    if (folder.path.toUpperCase() === 'INBOX') {
      for (const id of await adoptLegacyInboxRows(db, sourceKey, metas.filter(m => !seen.has(m.message_id)))) seen.add(id);
    }

    for (const meta of metas) {
      if (seen.has(meta.message_id))                                       { result.duplicates++; continue; }
      seen.add(meta.message_id); // same message twice in one folder scan
      if (classification.isIgnoredSender(meta.sender_email, ignoreDomains)) { result.ignored++;    continue; }

      let body;
      try {
        body = await imap.fetchBody(client, meta.uid);
      } catch (err) {
        if (client.usable === false) throw err; // connection gone — not this message's fault
        log(`unreadable uid ${meta.uid} in ${folder.path}: ${err.message}`);
        result.unreadable++;
        continue;
      }
      const email = { ...meta, ...body, folder: folder.path, isSpam: folder.isSpam };
      if (!classification.passesRuleFilter(email)) { result.irrelevant++; continue; }
      candidates.push(email);
    }
    result.candidates = candidates.length;
    return { result, candidates };
  } finally {
    lock.release();
  }
}

// ── main entry point ────────────────────────────────────────────
/**
 * @returns {Promise<{ status: 'SUCCESS'|'PARTIAL'|'FAILED', fetched: number, inserted: number,
 *   matched: number, pending: number, halted: boolean, folders: object[], errors: string[] }>}
 */
async function syncImapMailbox({
  db, sourceKey = 'imap', env = process.env, overrides = {},
  imap = imapServiceDefault, classification = classificationDefault, linking = linkingDefault,
  log = msg => console.log(`[EmailWorker:${sourceKey}] ${msg}`),
} = {}) {
  const opts          = optionsFrom(env, overrides);
  const ignoreDomains = classification.ignoredSenderDomains(env);
  const summary = { status: 'SUCCESS', fetched: 0, inserted: 0, matched: 0, pending: 0, halted: false, folders: [], errors: [] };

  let client = imap.createClient(env);
  await client.connect(); // a failure here fails the whole sync (logged FAILED by the worker)
  let reconnected = false;

  try {
    const folders = await imap.listScanFolders(client, env);
    log(`Scanning ${folders.length} folders: ${folders.map(f => f.path + (f.isSpam ? ' (review)' : '')).join(', ')}` +
        (opts.backfillDays ? ` — backfill ${opts.backfillDays}d` : ''));

    // Phase 1
    const allCandidates = [];
    for (const folder of folders) {
      try {
        const { result, candidates } = await collectFolder({ client, db, sourceKey, folder, opts, imap, classification, ignoreDomains, log });
        summary.folders.push(result);
        allCandidates.push(...candidates);
      } catch (err) {
        summary.folders.push({ path: folder.path, isSpam: folder.isSpam, error: err.message });
        summary.errors.push(`${folder.path}: ${err.message}`);
        log(`Folder ${folder.path} failed: ${err.message}`);
        // Zoho drops sessions mid-run; one fresh connection for the rest.
        if (client.usable === false && !reconnected) {
          reconnected = true;
          try { await client.logout(); } catch { /* already closed */ }
          client = imap.createClient(env);
          await client.connect();
        }
      }
    }
    summary.fetched = summary.folders.reduce((n, f) => n + (f.scanned || 0), 0);

    // Phase 2 — oldest first across every folder
    allCandidates.sort((a, b) => a.received_at - b.received_at || a.uid - b.uid);
    const done = new Set(); // `${folder}\u0000${uid}`
    for (const email of allCandidates) {
      let result;
      try {
        result = await classification.classify({
          subject: email.subject, body_snippet: email.body_snippet, sender_email: email.sender_email,
          company_name: '', job_title: '', mailbox_folder: email.folder,
        });
        await clearClassifyFailure(db, sourceKey, email.message_id);
      } catch (err) {
        const attempts = await recordClassifyFailure(db, sourceKey, email.message_id, err);
        if (attempts < opts.maxClassifyAttempts) {
          summary.halted = true;
          summary.errors.push(`classify failed (attempt ${attempts}/${opts.maxClassifyAttempts}): ${err.message}`);
          log(`Classification failed for "${email.subject}" — stopping, will retry next run: ${err.message}`);
          break;
        }
        log(`Classification failed ${attempts}× for "${email.subject}" — storing as UNKNOWN`);
        result = null;
      }

      const reviewStatus = email.isSpam ? 'PENDING' : null;
      const id = await insertEmail(db, sourceKey, email, result, reviewStatus);
      done.add(`${email.folder}\u0000${email.uid}`);
      if (!id) continue; // raced with another copy of the same message
      summary.inserted++;
      if (reviewStatus === 'PENDING') { summary.pending++; continue; }

      if (result) {
        try {
          const link = await linking.linkEmail(db, { sourceKey, emailResponseId: id, email, classification: result });
          if (link.outcome === 'matched' || link.outcome === 'created') {
            summary.matched++;
            log(`${link.outcome === 'created' ? 'Auto-created' : 'Matched'} application ${link.application.id} (${link.application.company_name}) from ${email.folder}`);
          }
        } catch (err) {
          // The email is stored; only the linking failed. Don't block the folder.
          summary.errors.push(`link failed for email ${id}: ${err.message}`);
          log(`Linking failed for email ${id}: ${err.message}`);
        }
      }
    }

    // Phase 3 — advance watermarks only past what was processed
    const pendingByFolder = new Map();
    for (const e of allCandidates) {
      if (done.has(`${e.folder}\u0000${e.uid}`)) continue;
      const cur = pendingByFolder.get(e.folder);
      if (cur == null || e.uid < cur) pendingByFolder.set(e.folder, e.uid);
    }
    for (const f of summary.folders) {
      if (f.error || f.uidValidity == null) continue;
      const firstUnprocessed = pendingByFolder.get(f.path);
      let lastUid;
      if (firstUnprocessed != null)  lastUid = firstUnprocessed - 1;
      else if (f.maxUid != null)     lastUid = f.maxUid;
      else if (f.uidNext)            lastUid = f.uidNext - 1; // nothing new: start from "now"
      else continue;
      await setFolderState(db, sourceKey, f.path, f.uidValidity, lastUid);
    }
  } finally {
    try { await client.logout(); } catch { /* connection may already be closed */ }
  }

  const failedFolders = summary.folders.filter(f => f.error).length;
  if (failedFolders && failedFolders === summary.folders.length) summary.status = 'FAILED';
  else if (failedFolders || summary.halted)                      summary.status = 'PARTIAL';
  return summary;
}

module.exports = {
  syncImapMailbox, classificationFromRow, optionsFrom,
  // exported for tests
  setFolderState, getFolderState,
};
