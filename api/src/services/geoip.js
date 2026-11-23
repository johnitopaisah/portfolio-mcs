'use strict';
// ============================================================
//  Approximate visitor location — from Cloudflare's request headers.
//
//  Cloudflare already knows where each request comes from and adds:
//    cf-ipcountry  (always)                  e.g. "FR"
//    cf-region, cf-ipcity                    when the zone has the
//      "Add visitor location headers" Managed Transform enabled
//      (Cloudflare → Rules → Transform Rules → Managed Transforms).
//
//  No IP address leaves this server and no third-party lookup is made.
//  (Until Nov 2026 every visitor IP was sent to ip-api.com over plain HTTP.)
// ============================================================

const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

function header(headers, name) {
  const v = headers?.[name];
  const s = (Array.isArray(v) ? v[0] : v || '').toString().trim();
  if (!s || s === 'XX' || s === 'T1') return '';          // XX = unknown, T1 = Tor
  let out = s;
  try { out = decodeURIComponent(s); } catch { /* not percent-encoded */ }
  // Raw UTF-8 header bytes read as Latin-1 ("Ã\x8Ele-de-France") → re-decode.
  if (/[ÃÂ][\x80-\xBF]/.test(out)) {
    const fixed = Buffer.from(out, 'latin1').toString('utf8');
    if (!fixed.includes('�')) out = fixed;
  }
  return out;
}

/** @returns {{ country: string, country_code: string, region: string, city: string }} */
function geoFromHeaders(headers = {}) {
  const code = header(headers, 'cf-ipcountry').toUpperCase().slice(0, 2);
  let country = '';
  if (/^[A-Z]{2}$/.test(code)) {
    try { country = regionNames?.of(code) || ''; } catch { country = ''; }
  }
  return {
    country,
    country_code: /^[A-Z]{2}$/.test(code) ? code : '',
    region: header(headers, 'cf-region').slice(0, 80),
    city:   header(headers, 'cf-ipcity').slice(0, 80),
  };
}

module.exports = { geoFromHeaders };
