/**
 * Job Pipeline Configuration
 * Raw job discovery lives in scraper/ (career-site pipeline). This config
 * covers only the lifecycle/notification settings the API's job worker
 * still owns (expiry window, digest scoring threshold).
 */

module.exports = {
  jobFiltering: {
    maxAgeHours: 30 * 24, // 30 days
  },

  notifications: {
    enableDigest: true,
    minRelevanceScore: 65,
    digestTime: process.env.NOTIFY_JOB_DIGEST_TIME || '08:15', // HH:MM Europe/Paris
  },
};
