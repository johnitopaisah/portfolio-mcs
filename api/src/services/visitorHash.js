'use strict';
// Anonymous visitor code: a keyed hash of IP + browser that changes every
// UTC day. Enough to count unique visitors within a day (and to link a blog
// click to the visit it came from), not to follow anyone across days. The IP
// itself is never stored. Replaces the portfolio-sid analytics cookie.
const crypto = require('crypto');

function dailyVisitorHash(ip, userAgent, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const key = crypto.createHash('sha256')
    .update(`visitor:${process.env.JWT_SECRET || ''}:${day}`)
    .digest();
  return crypto.createHmac('sha256', key).update(`${ip || ''}|${userAgent || ''}`).digest('hex').slice(0, 32);
}

// Only the site a visitor came from (e.g. "https://www.linkedin.com") —
// full referrer URLs can carry search terms or personal parameters.
function refererOrigin(raw) {
  try { const u = new URL(raw); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; }
}

module.exports = { dailyVisitorHash, refererOrigin };
