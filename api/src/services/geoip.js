'use strict';
// ============================================================
//  IP Geolocation — ip-api.com (free, no key, 45 req/min)
//  Results are cached in-memory for 24h to stay well under limits.
//  Private/loopback IPs are detected locally — no HTTP call made.
// ============================================================

// Simple in-memory LRU-like cache: { ip -> { data, expiresAt } }
const cache = new Map();
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 500;

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd)/i;

function isPrivateIp(ip) {
  if (!ip || ip === '-') return true;
  return PRIVATE_IP_RE.test(ip);
}

async function geoip(ip) {
  if (!ip || isPrivateIp(ip)) {
    return { country: 'Local', city: 'Local', region: '', lat: null, lon: null };
  }

  // Cache hit
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon`,
      { signal: AbortSignal.timeout(3000) }  // 3s hard timeout
    );
    if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);

    const json = await res.json();
    if (json.status !== 'success') throw new Error(`ip-api fail: ${json.message}`);

    const data = {
      country:  json.country     || '',
      city:     json.city        || '',
      region:   json.regionName  || '',
      lat:      json.lat         || null,
      lon:      json.lon         || null,
    };

    // Evict oldest entry if cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(ip, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.warn(`[geoip] lookup failed for ${ip}:`, err.message);
    return { country: '', city: '', region: '', lat: null, lon: null };
  }
}

module.exports = { geoip };
