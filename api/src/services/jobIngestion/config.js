/**
 * Job API Configuration & Provider Setup
 * Providers: Jooble, RemoteOK, Adzuna (free API, 250 req/day)
 */

module.exports = {
  providers: {
    joobleApi: {
      name: 'Jooble',
      baseUrl: 'https://jooble.org/api',
      apiKey: process.env.JOOBLE_API_KEY,
      rateLimit: { requestsPerSecond: 1, dailyLimit: 1000 },
      features: { pagination: true, dateFiltering: true, locationFiltering: true },
    },
    remoteOk: {
      name: 'RemoteOK',
      baseUrl: 'https://remoteok.com/api',
      apiKey: process.env.REMOTE_OK_API_KEY || 'public', // RemoteOK is free
      rateLimit: { requestsPerSecond: 1, dailyLimit: 2000 },
      features: { pagination: false, dateFiltering: false, locationFiltering: true },
    },
    adzuna: {
      name: 'Adzuna',
      // Base URL built dynamically in fetcher (includes country + page)
      baseUrl: 'https://api.adzuna.com/v1/api/jobs',
      appId:   process.env.ADZUNA_APP_ID,
      apiKey:  process.env.ADZUNA_API_KEY,
      rateLimit: { requestsPerSecond: 1, dailyLimit: 250 },
      features: { pagination: true, dateFiltering: true, locationFiltering: true },
      // Countries to search (Adzuna has separate endpoints per country)
      countries: ['gb', 'fr', 'de', 'nl', 'us', 'ca'],
    },
  },

  pollSchedule: {
    intervalMinutes: parseInt(process.env.JOB_POLL_INTERVAL_MINUTES || '15'),
    retryOnFailure:  true,
    maxRetries:      3,
    backoffMultiplier: 2,
  },

  jobFiltering: {
    maxAgeHours: 30 * 24, // 30 days

    keywordFilters: [
      'DevOps', 'Cloud', 'Kubernetes', 'AWS', 'Google Cloud', 'Azure',
      'Docker', 'Infrastructure', 'Site Reliability', 'SRE',
      'Embedded', 'Firmware', 'Systems', 'Backend', 'Platform Engineer',
    ],

    locationFilters: [
      'Remote', 'France', 'EU', 'Europe', 'Germany',
      'Netherlands', 'UK', 'Canada', 'US',
    ],

    excludeKeywords: ['Sales', 'Marketing', 'HR', 'Recruiter', 'Accounting'],
    minDescriptionLength: 100,
  },

  searchQueries: {
    joobleApi: [
      'DevOps Engineer Remote',
      'Cloud Infrastructure Engineer Europe',
      'Kubernetes Administrator',
      'SRE Site Reliability Engineer',
      'Embedded Systems Engineer',
      'Backend Engineer Go Rust Python',
    ],
    remoteOk: [
      'devops',
      'kubernetes',
      'cloud',
      'infrastructure',
    ],
    adzuna: [
      'devops engineer',
      'site reliability engineer',
      'cloud infrastructure',
      'kubernetes',
      'embedded systems',
      'platform engineer',
    ],
  },

  notifications: {
    enableDigest: true,
    minRelevanceScore: 65,
    digestTime: process.env.NOTIFY_JOB_DIGEST_TIME || '08:15', // HH:MM Europe/Paris
  },
};
