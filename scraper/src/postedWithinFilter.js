'use strict';

// Rejects postings older than the target's posted_within_days window.
// null/undefined means no constraint — always passes.
function matchesPostedWithin(postedAt, days) {
  if (days === null || days === undefined) return true;

  const posted = postedAt instanceof Date ? postedAt : new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return true; // unknown date — safety net, don't drop blind

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return posted.getTime() >= cutoff;
}

module.exports = { matchesPostedWithin };
