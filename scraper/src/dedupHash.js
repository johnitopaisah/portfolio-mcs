'use strict';

const crypto = require('crypto');

// Must stay identical to api/src/services/jobIngestion/deduplicationService.js's
// calculateDeduplicationHash() — both write into the same jobs_raw.dedup_hash column.
function calculateDeduplicationHash(title, company, location) {
  const normalized = `${title.toLowerCase()}-${company.toLowerCase()}-${(location || 'remote').toLowerCase()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

module.exports = { calculateDeduplicationHash };
