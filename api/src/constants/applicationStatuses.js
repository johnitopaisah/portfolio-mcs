'use strict';

// Single source of truth for the applications.status pipeline — shared by
// applications.js (request validation) and emailWorker.js (guards against
// an AI-suggested status that isn't a real pipeline value).
const VALID_STATUSES = new Set([
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER',
  'REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED',
]);

// Pipeline stage groups — the buckets the dashboard Pipeline panel counts
// and the applications list filters by (?group=). 'closed' is deliberately
// not listed: it is every non-archived status that isn't in one of these,
// so the list filter and the dashboard count can never disagree.
const STATUS_GROUPS = {
  prep:      ['DRAFT', 'CV_GENERATED', 'READY_TO_APPLY'],
  active:    ['APPLIED', 'EMAIL_RECEIVED', 'HR_CONTACTED'],
  interview: ['INTERVIEW_INVITE', 'INTERVIEW_SCHEDULED', 'TECHNICAL_TEST', 'FINAL_INTERVIEW'],
  offer:     ['OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER'],
};
const GROUP_KEYS      = [...Object.keys(STATUS_GROUPS), 'closed'];
const GROUPED_STATUSES = Object.values(STATUS_GROUPS).flat();

module.exports = { VALID_STATUSES, STATUS_GROUPS, GROUP_KEYS, GROUPED_STATUSES };
