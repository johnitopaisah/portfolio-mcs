'use strict';
/**
 * Job Ingestion Service
 * Providers: Jooble, RemoteOK, Adzuna (free official API — cleaner signal than aggregators)
 * Uses native fetch (Node 20+) — no axios dependency needed here.
 */

const https  = require('https');
const pool   = require('../../db/client');
const config = require('./config');
const { deduplicateJobs, calculateDeduplicationHash } = require('./deduplicationService');
const { recordIngestionLog } = require('./ingestionLogsService');

// ── HTTP helpers ─────────────────────────────────────────────
async function httpGet(url, opts = {}) {
  const res = await fetch(url, {
    signal:  AbortSignal.timeout(opts.timeout || 12_000),
    headers: opts.headers || {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function httpPost(url, body, opts = {}) {
  const res = await fetch(url, {
    method:  'POST',
    signal:  AbortSignal.timeout(opts.timeout || 12_000),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// Jooble's server doesn't send its full intermediate CA chain (Sectigo), so
// Alpine's root-only CA bundle can't verify it. rejectUnauthorized: false is
// scoped strictly to this function — all other providers use standard fetch.
async function httpGetText(url, opts = {}) {
  const res = await fetch(url, {
    signal:  AbortSignal.timeout(opts.timeout || 12_000),
    headers: opts.headers || {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}

async function httpPostJooble(url, body) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname,
      path:     pathname + search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      rejectUnauthorized: false,
      timeout:  12_000,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Jooble request timed out')); });
    req.write(data);
    req.end();
  });
}

// ── WTTJ Algolia auto-discovery ───────────────────────────────
// Extracts public Algolia search credentials from WTTJ's JS bundle.
// These are intentionally public read-only keys embedded in their frontend.
// Cached for 6 hours; naturally resets between CronJob runs.
let   _wttjCache   = null;
let   _wttjCacheTs = 0;
const WTTJ_TTL     = 6 * 60 * 60 * 1000;

async function discoverWttjAlgoliaConfig() {
  const now = Date.now();
  // Return cached result (including null = cached failure) within TTL
  if (_wttjCacheTs && now - _wttjCacheTs < WTTJ_TTL) return _wttjCache;

  console.log('[WTTJ] Discovering Algolia credentials from JS bundle…');
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

  try {
    const html = await httpGetText('https://www.welcometothejungle.com/fr/jobs', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      timeout: 15000,
    });

    const paths = [...new Set(
      [...html.matchAll(/["'](\/_next\/static\/chunks\/[^"']+\.js)["']/g)].map(m => m[1])
    )];

    // Patterns ordered from most specific to broadest
    const ID_PATS = [
      /algoliasearch\(["']([A-Z0-9]{8,12})["']/,                   // constructor call
      /applicationId:["']([A-Z0-9]{8,12})["']/,                    // object literal unquoted key
      /["']applicationId["']:["']([A-Z0-9]{8,12})["']/,            // quoted key
      /algoliaAppId["']?:["']([A-Z0-9]{8,12})["']/,                // custom var name
      /ALGOLIA_APP_ID["']?[,:]+"([A-Z0-9]{8,12})["']/i,            // env-style
    ];
    const KEY_PATS = [
      /algoliasearch\(["'][A-Z0-9]{8,12}["'],["']([a-zA-Z0-9]{20,50})["']/,  // constructor 2nd arg
      /apiKey:["']([a-zA-Z0-9]{20,50})["']/,
      /["']apiKey["']:["']([a-zA-Z0-9]{20,50})["']/,
      /algoliaApiKey["']?:["']([a-zA-Z0-9]{20,50})["']/,
      /searchApiKey["']?:["']([a-zA-Z0-9]{20,50})["']/,
      /ALGOLIA_API_KEY["']?[,:]+"([a-zA-Z0-9]{20,50})["']/i,
    ];
    const IDX_PATS = [
      /indexName:["'](wttj[^"']{3,60})["']/i,
      /["']indexName["']:["'](wttj[^"']{3,60})["']/i,
      /algoliaIndex["']?:["'](wttj[^"']{3,60})["']/i,
    ];

    for (const path of paths.slice(0, 25)) {
      try {
        const js = await httpGetText(`https://www.welcometothejungle.com${path}`, {
          headers: { 'User-Agent': UA }, timeout: 10000,
        });
        if (!js.toLowerCase().includes('algolia')) continue;

        let appId = null, apiKey = null, index = null;
        for (const p of ID_PATS)  { const m = js.match(p); if (m) { appId  = m[1]; break; } }
        for (const p of KEY_PATS) { const m = js.match(p); if (m) { apiKey = m[1]; break; } }
        for (const p of IDX_PATS) { const m = js.match(p); if (m) { index  = m[1]; break; } }

        if (appId && apiKey) {
          _wttjCache   = { algoliaAppId: appId, algoliaApiKey: apiKey,
                           algoliaIndex: index || 'wttj_jobs_production_fr' };
          _wttjCacheTs = now;
          console.log(`[WTTJ] Credentials found — App: ${appId}, Index: ${_wttjCache.algoliaIndex}`);
          return _wttjCache;
        }
      } catch { /* skip bad chunks */ }
    }
  } catch (err) {
    console.warn('[WTTJ] Auto-discovery failed:', err.message);
  }

  // Cache the failure for 30 min to avoid re-hammering on every query in the same run
  _wttjCacheTs = now;
  console.warn('[WTTJ] Could not extract Algolia credentials — skipping this run');
  return null;
}

// ── Indeed RSS helpers ────────────────────────────────────────
function parseIndeedRSS(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      return (chunk.match(r)?.[1] || '').trim();
    };
    const rawTitle  = get('title');
    const link      = get('link');
    const pubDate   = get('pubDate');
    const guid      = get('guid');
    const desc = get('description')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ').trim();

    if (!rawTitle || !link) continue;

    // Indeed title: "Job Title - Company Name"  (or "Job Title at Company")
    const splitAt = rawTitle.includes(' - ') ? ' - ' : ' at ';
    const [title, company = 'Unknown'] = rawTitle.split(splitAt);

    // Extract the unique job key (jk=xxx) from the guid/link for dedup
    const jkMatch = (guid || link).match(/jk=([a-z0-9]+)/i);
    const jobKey  = jkMatch ? jkMatch[1] : (guid || link).replace(/[^a-z0-9]/gi, '').slice(-20);

    items.push({ title: title.trim(), company: company.trim(), link, description: desc, pubDate, jobKey });
  }
  return items;
}

// Handles both Unix timestamp (number, old Jooble API) and ISO string (new Jooble API)
function safeDate(val) {
  if (!val) return new Date();
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

class JobIngestionService {

  async ingestAllJobs() {
    const t0 = Date.now();
    const results = {};
    console.log('[JobIngestion] Starting ingestion cycle…');

    for (const [key, provider] of Object.entries(config.providers)) {
      // Free providers need no credentials; Adzuna needs both appId + apiKey
      // wttj auto-discovers its own Algolia credentials — always attempt it
      const FREE = new Set(['remoteOk', 'arbeitnow', 'remotive', 'indeed', 'apec', 'wttj']);
      const ok = key === 'adzuna'
        ? (provider.appId && provider.apiKey)
        : FREE.has(key) ? true : !!provider.apiKey;

      if (!ok) {
        console.warn(`[JobIngestion] Skipping ${key} — credentials not set`);
        continue;
      }

      try {
        results[key] = await this.ingestFromProvider(key, provider);
      } catch (err) {
        console.error(`[JobIngestion:${key}] Failed:`, err.message);
        await recordIngestionLog(key, 'FAILED', 0, 0, 0, 0, err.message, Date.now() - t0);
      }
    }

    console.log('[JobIngestion] Complete:', results);
    return results;
  }

  async ingestFromProvider(key, provider) {
    const t0 = Date.now();
    let fetched = 0, newCount = 0, dupeCount = 0;

    const queries = config.searchQueries[key] || [];
    const allJobs = [];

    for (const query of queries) {
      try {
        let jobs = [];
        if      (key === 'joobleApi')  jobs = await this.fetchFromJooble(provider, query);
        else if (key === 'remoteOk')   jobs = await this.fetchFromRemoteOk(provider, query);
        else if (key === 'adzuna')     jobs = await this.fetchFromAdzuna(provider, query);
        else if (key === 'arbeitnow')  jobs = await this.fetchFromArbeitnow(provider, query);
        else if (key === 'remotive')   jobs = await this.fetchFromRemotive(provider, query);
        else if (key === 'apec')       jobs = await this.fetchFromApec(provider, query);
        else if (key === 'wttj')       jobs = await this.fetchFromWttj(provider, query);
        allJobs.push(...jobs);
        fetched += jobs.length;
      } catch (err) {
        console.error(`[JobIngestion:${key}] Query "${query}" failed:`, err.message);
      }
    }

    console.log(`[JobIngestion:${key}] Fetched ${fetched} across ${queries.length} queries`);

    const { newJobs, duplicates } = await deduplicateJobs(allJobs, key);
    newCount  = newJobs.length;
    dupeCount = duplicates.length;

    for (const job of newJobs) {
      try { await this.storeRawJob(job, key); }
      catch (err) { console.error(`[JobIngestion:${key}] Store error:`, err.message); }
    }

    const ms = Date.now() - t0;
    await recordIngestionLog(key, 'SUCCESS', fetched, newCount, dupeCount, 0, null, ms);
    console.log(`[JobIngestion:${key}] ${newCount} new, ${dupeCount} dupes — ${ms}ms`);

    return { fetched, newCount, dupeCount, ms };
  }

  // ── Jooble ─────────────────────────────────────────────────
  async fetchFromJooble(provider, query) {
    const all = [];
    // 3 pages × ~20 results = ~60 per query (down from 5 to reduce volume)
    for (let page = 0; page < 3; page++) {
      try {
        const data = await httpPostJooble(
          `${provider.baseUrl}/${provider.apiKey}`,
          { keywords: query, location: 'Remote', page }
        );
        const jobs = data.jobs || [];
        if (!jobs.length) break;

        all.push(...jobs.map(j => ({
          external_id:     String(j.id),
          company_name:    j.company            || 'Unknown',
          title:           j.title              || '',
          location:        j.location           || 'Remote',
          job_type:        j.type               || 'Full-time',
          description:     j.snippet || j.description || '',
          requirements:    j.requirements       || '',
          salary_min:      j.salary_min         || null,
          salary_max:      j.salary_max         || null,
          salary_currency: j.salary_currency    || 'USD',
          posted_at:       safeDate(j.updated),
          apply_url:       j.link               || '',
          source_api:      'joobleApi',
          raw_data:        j,
        })));
      } catch (err) {
        console.error(`[Jooble] Page ${page} error:`, err.message);
        if (page === 0) throw err;
        break;
      }
    }
    return all;
  }

  // ── RemoteOK ───────────────────────────────────────────────
  async fetchFromRemoteOk(provider, keyword) {
    const data = await httpGet(
      `${provider.baseUrl}?search=${encodeURIComponent(keyword)}`,
      { headers: { 'User-Agent': 'portfolio-mcs/1.0 (job aggregator)' } }
    );
    return (data || [])
      .filter(j => j.id && j.id !== 'api-ad')
      .map(j => ({
        external_id:     `remoteok_${j.id}`,
        company_name:    j.company   || 'Unknown',
        title:           j.title     || '',
        location:        j.location  || 'Remote',
        job_type:        'Remote',
        description:     j.description || j.title || '',
        requirements:    '',
        salary_min:      null, salary_max: null, salary_currency: null,
        posted_at:       j.date ? new Date(j.date) : new Date(),
        apply_url:       j.url       || '',
        source_api:      'remoteOk',
        raw_data:        j,
      }));
  }

  // ── Adzuna (new) ───────────────────────────────────────────
  // Free official API: https://developer.adzuna.com/
  // 250 req/day free. Returns higher quality job data than aggregators.
  async fetchFromAdzuna(provider, query) {
    const countries = provider.countries || ['gb', 'fr', 'de', 'nl'];
    const all = [];

    for (const country of countries) {
      try {
        const params = new URLSearchParams({
          app_id:           provider.appId,
          app_key:          provider.apiKey,
          results_per_page: '20',
          what:             query,
          sort_by:          'date',
          max_days_old:     '7',
          // 'where' omitted — Adzuna uses city/region, not a "Remote" tag.
          // Location filtering is handled by the AI scorer instead.
        });

        const data = await httpGet(
          `${provider.baseUrl}/${country}/search/1?${params}`
        );

        const currency = country === 'us' ? 'USD' : country === 'gb' ? 'GBP' : 'EUR';

        all.push(...(data.results || []).map(j => ({
          external_id:     `adzuna_${j.id}`,
          company_name:    j.company?.display_name || 'Unknown',
          title:           j.title                 || '',
          location:        j.location?.display_name || country.toUpperCase(),
          job_type:        j.contract_time          || 'Full-time',
          description:     j.description            || '',
          requirements:    '',
          salary_min:      j.salary_min             || null,
          salary_max:      j.salary_max             || null,
          salary_currency: currency,
          posted_at:       j.created ? new Date(j.created) : new Date(),
          apply_url:       j.redirect_url           || '',
          source_api:      'adzuna',
          raw_data:        j,
        })));
      } catch (err) {
        console.error(`[Adzuna:${country}] "${query}" failed:`, err.message);
      }

      // Respect 1 req/sec rate limit
      await new Promise(r => setTimeout(r, 1100));
    }

    return all;
  }

  // ── Arbeitnow ──────────────────────────────────────────────
  // Free public API — no key needed. Query is a page number string ('1'..'5').
  async fetchFromArbeitnow(provider, page) {
    const data = await httpGet(`${provider.baseUrl}?page=${page}`);
    if (!data.data?.length) return [];

    return data.data.map(j => ({
      external_id:     `arbeitnow_${j.slug}`,
      company_name:    j.company_name            || 'Unknown',
      title:           j.title                   || '',
      location:        j.location                || 'Remote',
      job_type:        j.job_types?.[0]?.replace('_', '-') || 'Full-time',
      description:     j.description             || '',
      requirements:    '',
      salary_min:      null,
      salary_max:      null,
      salary_currency: 'EUR',
      posted_at:       safeDate(j.created_at),   // Unix timestamp (seconds)
      apply_url:       j.url                     || '',
      source_api:      'arbeitnow',
      raw_data:        { slug: j.slug, tags: j.tags, remote: j.remote, visa: j.visa_sponsorship },
    }));
  }

  // ── Remotive ───────────────────────────────────────────────
  // Free public API — no key needed. Query is a Remotive category slug.
  async fetchFromRemotive(provider, category) {
    const data = await httpGet(
      `${provider.baseUrl}?category=${encodeURIComponent(category)}&limit=100`
    );
    if (!data.jobs?.length) return [];

    return data.jobs.map(j => ({
      external_id:     `remotive_${j.id}`,
      company_name:    j.company_name                      || 'Unknown',
      title:           j.title                             || '',
      location:        j.candidate_required_location       || 'Worldwide',
      job_type:        j.job_type?.replace('_', '-')       || 'Full-time',
      description:     (j.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      requirements:    '',
      salary_min:      null,
      salary_max:      null,
      salary_currency: 'USD',
      posted_at:       j.publication_date ? new Date(j.publication_date) : new Date(),
      apply_url:       j.url                               || '',
      source_api:      'remotive',
      raw_data:        { id: j.id, category: j.category, salary: j.salary },
    }));
  }

  // ── Indeed RSS ─────────────────────────────────────────────
  // Public RSS feed — no key needed. Query is passed as the `q` param.
  async fetchFromIndeed(provider, query) {
    const url = `${provider.baseUrl}?q=${encodeURIComponent(query)}&sort=date&radius=100`;
    const xml = await httpGetText(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobBot/1.0; +https://api.johnisah.com)' },
    });
    const items = parseIndeedRSS(xml);

    return items.map(item => ({
      external_id:     `indeed_${item.jobKey}`,
      company_name:    item.company                 || 'Unknown',
      title:           item.title                   || '',
      location:        'Remote',
      job_type:        'Full-time',
      description:     item.description             || '',
      requirements:    '',
      salary_min:      null,
      salary_max:      null,
      salary_currency: 'USD',
      posted_at:       item.pubDate ? new Date(item.pubDate) : new Date(),
      apply_url:       item.link                    || '',
      source_api:      'indeed',
      raw_data:        {},
    }));
  }

  // ── APEC ───────────────────────────────────────────────────
  // French executive job board — POST endpoint, no auth needed.
  async fetchFromApec(provider, query) {
    const PAGE_SIZE = 20;
    const all = [];

    for (let page = 0; page < 3; page++) {
      const data = await httpPost(
        provider.baseUrl,
        {
          motsCles:               query,
          typeClient:             'CADRE',
          activeFiltre:           true,
          pagination:             { range: PAGE_SIZE, startIndex: page * PAGE_SIZE },
          sorts:                  [{ type: 'DATE', direction: 'DESCENDING' }],
          typesContrat:           [],
          fonctions:              [],
          lieux:                  [],
          niveauxExperience:      [],
          secteursActivite:       [],
          salaireMinimum:         0,
          salaireMaximum:         0,
          pointGeolocDeReference: { distance: 0 },
        },
        {
          headers: {
            'Referer':    'https://www.apec.fr/candidat/recherche-emploi.html/emploi',
            'Origin':     'https://www.apec.fr',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept':     'application/json, text/plain, */*',
          },
        }
      );

      if (page === 0 && !data.resultats) {
        console.warn('[APEC] Unexpected response shape:', JSON.stringify(data).slice(0, 300));
        break;
      }

      const resultats = data.resultats || [];
      if (!resultats.length) break;

      all.push(...resultats.map(j => {
        const desc = (j.texteOffre || '')
          .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        return {
          external_id:     `apec_${j.numeroOffre}`,
          company_name:    j.nomCommercial             || 'Unknown',
          title:           j.intitule                  || '',
          location:        j.lieuTexte                 || 'France',
          job_type:        'CDI',
          description:     desc,
          requirements:    '',
          salary_min:      null,
          salary_max:      null,
          salary_currency: 'EUR',
          posted_at:       j.datePublication ? new Date(j.datePublication) : new Date(),
          apply_url:       `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${j.numeroOffre}`,
          source_api:      'apec',
          raw_data:        { numeroOffre: j.numeroOffre, salaireTexte: j.salaireTexte },
        };
      }));

      if (resultats.length < PAGE_SIZE) break; // last page
      await new Promise(r => setTimeout(r, 1000));
    }

    return all;
  }

  // ── Welcome to the Jungle ──────────────────────────────────
  // Uses Algolia search (public read-only keys auto-discovered from WTTJ JS bundle).
  // Env vars WTTJ_ALGOLIA_* can override auto-discovery if needed.
  async fetchFromWttj(provider, query) {
    // Prefer env-var overrides, fall back to auto-discovery
    let algoliaAppId  = provider.algoliaAppId;
    let algoliaApiKey = provider.algoliaApiKey;
    let algoliaIndex  = provider.algoliaIndex;

    if (!algoliaAppId || !algoliaApiKey) {
      const discovered = await discoverWttjAlgoliaConfig();
      if (!discovered) return [];
      algoliaAppId  = discovered.algoliaAppId;
      algoliaApiKey = discovered.algoliaApiKey;
      algoliaIndex  = discovered.algoliaIndex;
    }

    const data = await httpPost(
      `https://${algoliaAppId}-dsn.algolia.net/1/indexes/*/queries`,
      {
        requests: [{
          indexName:              algoliaIndex,
          query,
          page:                   0,
          hitsPerPage:            30,
          attributesToRetrieve:   [
            'name', 'contract_type', 'remote', 'published_at', 'slug',
            'office', 'organization', 'apply_url', 'profile', 'salary',
          ],
        }],
      },
      {
        headers: {
          'X-Algolia-Application-Id': algoliaAppId,
          'X-Algolia-API-Key':        algoliaApiKey,
          'X-Algolia-Agent':          'Algolia for JavaScript (4.x.x); Browser (lite)',
        },
      }
    );

    const hits = data.results?.[0]?.hits || [];

    return hits.map(j => {
      const city = j.office?.city || '';
      const country = j.office?.country || 'FR';
      const location = city ? `${city}, ${country}` : (j.remote ? 'Remote' : 'France');
      const applyUrl = j.apply_url
        || (j.organization?.slug && j.slug
          ? `https://www.welcometothejungle.com/fr/companies/${j.organization.slug}/jobs/${j.slug}`
          : '');

      return {
        external_id:     `wttj_${j.objectID || j.slug}`,
        company_name:    j.organization?.name || 'Unknown',
        title:           j.name               || '',
        location,
        job_type:        j.contract_type      || 'CDI',
        description:     (j.profile || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        requirements:    '',
        salary_min:      j.salary?.min        || null,
        salary_max:      j.salary?.max        || null,
        salary_currency: j.salary?.currency   || 'EUR',
        posted_at:       j.published_at ? safeDate(j.published_at) : new Date(),
        apply_url:       applyUrl,
        source_api:      'wttj',
        raw_data:        { slug: j.slug, contract_type: j.contract_type, remote: j.remote },
      };
    });
  }

  // ── Store raw job ──────────────────────────────────────────
  async storeRawJob(job, sourceApi) {
    const hash = calculateDeduplicationHash(job.title, job.company_name, job.location);
    await pool.query(
      `INSERT INTO jobs_raw (
         external_id, company_name, title, location, job_type,
         description, requirements, salary_min, salary_max, salary_currency,
         posted_at, apply_url, source_api, dedup_hash, raw_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (external_id) DO NOTHING`,
      [
        job.external_id, job.company_name, job.title, job.location, job.job_type,
        job.description, job.requirements, job.salary_min, job.salary_max, job.salary_currency,
        job.posted_at, job.apply_url, sourceApi, hash, JSON.stringify(job.raw_data || {}),
      ]
    );
  }

  // ── Expire old jobs ────────────────────────────────────────
  async markExpiredJobs() {
    const maxAge = config.jobFiltering.maxAgeHours;
    const result = await pool.query(
      `UPDATE jobs SET is_active = FALSE, expires_at = NOW()
       WHERE is_active = TRUE AND posted_at < NOW() - INTERVAL '1 hour' * $1`,
      [maxAge]
    );
    console.log(`[JobIngestion] Expired ${result.rowCount} old jobs`);
    return result.rowCount;
  }

  // ── Hard-delete jobs older than 14 days ────────────────────
  // Protects jobs with applied/interested feedback (user's history).
  // ON DELETE CASCADE on job_feedback means child rows are deleted automatically.
  async purgeOldJobs() {
    const deleteJobs = await pool.query(
      `DELETE FROM jobs
       WHERE posted_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM job_feedback jf
           WHERE jf.job_id = jobs.id
             AND jf.decision IN ('applied', 'interested')
         )
       RETURNING job_raw_id`
    );

    // Clean up jobs_raw rows that are now orphaned (no jobs row references them)
    const deleteRaw = await pool.query(
      `DELETE FROM jobs_raw
       WHERE created_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM jobs j WHERE j.job_raw_id = jobs_raw.id
         )`
    );

    console.log(`[JobIngestion] Purged ${deleteJobs.rowCount} old jobs, ${deleteRaw.rowCount} raw rows`);
    return { jobs: deleteJobs.rowCount, raw: deleteRaw.rowCount };
  }
}

module.exports = new JobIngestionService();
