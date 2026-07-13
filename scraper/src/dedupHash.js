'use strict';

const crypto = require('crypto');

function calculateDeduplicationHash(title, company, location) {
  const normalized = `${(title || '').toLowerCase()}-${(company || '').toLowerCase()}-${(location || 'remote').toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

module.exports = { calculateDeduplicationHash };
