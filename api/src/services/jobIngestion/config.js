/**
 * Job API Configuration & Provider Setup
 * Manages API keys, rate limits, and provider-specific logic
 */

module.exports = {
  // Job API provider: JoobleAPI (Jooble.org - largest job aggregator in Europe)
  // You can also use: RemoteOK, Indeed, LinkedIn, Greenhouse, Lever, Workday
  providers: {
    joobleApi: {
      name: 'Jooble',
      baseUrl: 'https://api.jooble.org/api/v2/search',
      apiKey: process.env.JOOBLE_API_KEY,
      rateLimit: {
        requestsPerSecond: 1,
        dailyLimit: 1000,
      },
      features: {
        pagination: true,
        dateFiltering: true,
        locationFiltering: true,
        keywordFiltering: true,
      },
    },
    remoteOk: {
      name: 'RemoteOK',
      baseUrl: 'https://remoteok.com/api',
      apiKey: process.env.REMOTE_OK_API_KEY,
      rateLimit: {
        requestsPerSecond: 1,
        dailyLimit: 2000,
      },
      features: {
        pagination: false,
        dateFiltering: false,
        locationFiltering: true,
        keywordFiltering: true,
      },
    },
  },

  // Polling schedule
  pollSchedule: {
    intervalMinutes: parseInt(process.env.JOB_POLL_INTERVAL_MINUTES || '15'),
    retryOnFailure: true,
    maxRetries: 3,
    backoffMultiplier: 2,
  },

  // Job filtering rules
  jobFiltering: {
    // Only ingest jobs posted within this window
    maxAgeHours: 30 * 24, // 30 days
    
    // Keyword filters (inclusive) — must match at least one
    keywordFilters: [
      'DevOps',
      'Cloud',
      'Kubernetes',
      'AWS',
      'Google Cloud',
      'Azure',
      'Docker',
      'Infrastructure',
      'Site Reliability',
      'SRE',
      'Embedded',
      'Firmware',
      'Systems',
      'Backend',
      'Full-stack',
    ],

    // Location filters (inclusive)
    locationFilters: [
      'Remote',
      'France',
      'EU',
      'Europe',
      'Germany',
      'Netherlands',
      'UK',
      'Canada',
      'US',
    ],

    // Exclude keywords (exclusive)
    excludeKeywords: [
      'Sales',
      'Marketing',
      'HR',
      'Recruiter',
    ],

    // Minimum job description length (chars)
    minDescriptionLength: 100,
  },

  // Search queries per provider
  searchQueries: {
    joobleApi: [
      'DevOps Engineer Remote',
      'Cloud Infrastructure Engineer',
      'Kubernetes Administrator',
      'SRE Site Reliability Engineer',
      'Infrastructure as Code',
      'AWS Solutions Architect',
      'Embedded Systems Engineer',
      'Backend Engineer Go Rust',
    ],
    remoteOk: [
      'devops',
      'kubernetes',
      'cloud',
      'infrastructure',
    ],
  },

  // Notification thresholds
  notifications: {
    enableForNewJobs: true,
    minRelevanceScore: 75,
    batchNotifications: true, // Send daily digest instead of real-time
    batchTime: '09:00', // 9 AM user's timezone
  },
};
