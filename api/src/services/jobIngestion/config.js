/**
 * Job API Configuration & Provider Setup
 * Providers: Jooble, RemoteOK, Adzuna, Arbeitnow, Remotive, Indeed
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
      apiKey: process.env.REMOTE_OK_API_KEY || 'public',
      rateLimit: { requestsPerSecond: 1, dailyLimit: 2000 },
      features: { pagination: false, dateFiltering: false, locationFiltering: true },
    },
    adzuna: {
      name: 'Adzuna',
      baseUrl: 'https://api.adzuna.com/v1/api/jobs',
      appId:   process.env.ADZUNA_APP_ID,
      apiKey:  process.env.ADZUNA_API_KEY,
      rateLimit: { requestsPerSecond: 1, dailyLimit: 250 },
      features: { pagination: true, dateFiltering: true, locationFiltering: true },
      countries: ['gb', 'fr', 'de', 'nl', 'us', 'ca'],
    },
    // ── Free providers (no API key required) ─────────────────
    arbeitnow: {
      name: 'Arbeitnow',
      baseUrl: 'https://www.arbeitnow.com/api/job-board-api',
      rateLimit: { requestsPerSecond: 1, dailyLimit: 500 },
      features: { pagination: true, dateFiltering: false, locationFiltering: false },
    },
    remotive: {
      name: 'Remotive',
      baseUrl: 'https://remotive.com/api/remote-jobs',
      rateLimit: { requestsPerSecond: 0.03, dailyLimit: 20 },
      features: { pagination: false, dateFiltering: false, locationFiltering: false },
    },
    // APEC — French executive job board, no auth required
    apec: {
      name: 'APEC',
      baseUrl: 'https://www.apec.fr/cms/webservices/rechercheOffre',
      rateLimit: { requestsPerSecond: 1, dailyLimit: 300 },
      features: { pagination: true, dateFiltering: true, locationFiltering: false },
    },
    // Welcome to the Jungle — Algolia-powered search
    // How to get credentials (one-time, ~5 minutes):
    //   1. Open https://www.welcometothejungle.com/fr/jobs in Chrome DevTools → Network
    //   2. Filter by "algolia.net" — click any POST request
    //   3. Copy x-algolia-application-id and x-algolia-api-key from the request headers
    //   4. Copy the indexName from the request body (e.g. "wttj_jobs_production_fr")
    //   5. Add to k8s secret: WTTJ_ALGOLIA_APP_ID, WTTJ_ALGOLIA_API_KEY, WTTJ_ALGOLIA_INDEX
    wttj: {
      name: 'Welcome to the Jungle',
      algoliaAppId:  process.env.WTTJ_ALGOLIA_APP_ID,
      algoliaApiKey: process.env.WTTJ_ALGOLIA_API_KEY,
      algoliaIndex:  process.env.WTTJ_ALGOLIA_INDEX || 'wttj_jobs_production_fr',
      rateLimit: { requestsPerSecond: 1, dailyLimit: 500 },
      features: { pagination: true, dateFiltering: false, locationFiltering: false },
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
    // Arbeitnow: page numbers (no keyword search — fetches all tech jobs)
    arbeitnow: ['1', '2', '3', '4', '5'],
    // Remotive: category slugs
    remotive: ['software-dev', 'devops-sysadmin'],
    // APEC: French keywords work best (also accepts English tech terms)
    apec: [
      'DevOps',
      'Cloud Infrastructure',
      'SRE Kubernetes',
      'systèmes embarqués',
      'ingénieur backend',
    ],
    // WTTJ: English keywords (international jobs listed in English on WTTJ)
    wttj: [
      'devops',
      'cloud infrastructure',
      'site reliability',
      'embedded firmware',
      'platform engineer',
    ],
  },

  notifications: {
    enableDigest: true,
    minRelevanceScore: 65,
    digestTime: process.env.NOTIFY_JOB_DIGEST_TIME || '08:15', // HH:MM Europe/Paris
  },
};
