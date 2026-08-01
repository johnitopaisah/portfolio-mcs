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

module.exports = { VALID_STATUSES };
