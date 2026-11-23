/**
 * Blog click tracking tests
 */

const assert = require('assert');
const { normalizeSourcePage, visitorHash } = require('../src/services/blogClickService');
const { refererOrigin } = require('../src/services/visitorHash');
const { geoFromHeaders } = require('../src/services/geoip');
const { parseOs, parseDevice, parseLanguage } = require('../src/services/parseVisitor');

describe('Blog click tracking', () => {
  describe('visitor parsing', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

    it('reports iPhones as iOS, not macOS', () => {
      assert.strictEqual(parseOs(iphone), 'iOS');
      assert.strictEqual(parseDevice(iphone), 'mobile');
    });

    it('still reports Macs as macOS', () => {
      assert.strictEqual(parseOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), 'macOS');
    });

    it('ignores the wildcard language a proxy adds', () => {
      assert.strictEqual(parseLanguage('*'), '');
      assert.strictEqual(parseLanguage('fr-FR,fr;q=0.9'), 'fr-FR');
    });
  });

  describe('normalizeSourcePage', () => {
    it('keeps the known pages', () => {
      assert.strictEqual(normalizeSourcePage('home'), 'home');
      assert.strictEqual(normalizeSourcePage('blog'), 'blog');
    });

    it('collapses anything else so arbitrary query values are never stored', () => {
      assert.strictEqual(normalizeSourcePage(undefined), 'other');
      assert.strictEqual(normalizeSourcePage('<script>'), 'other');
      assert.strictEqual(normalizeSourcePage(['home']), 'other');
    });
  });

  describe('visitorHash', () => {
    const day1 = new Date('2026-10-30T10:00:00Z');

    it('is stable for one visitor within a UTC day', () => {
      assert.strictEqual(
        visitorHash('1.2.3.4', 'UA', day1),
        visitorHash('1.2.3.4', 'UA', new Date('2026-10-30T23:59:00Z'))
      );
    });

    it('changes the next day, so visitors cannot be followed across days', () => {
      assert.notStrictEqual(visitorHash('1.2.3.4', 'UA', day1), visitorHash('1.2.3.4', 'UA', new Date('2026-10-31T00:00:00Z')));
    });

    it('differs between visitors', () => {
      assert.notStrictEqual(visitorHash('1.2.3.4', 'UA', day1), visitorHash('1.2.3.5', 'UA', day1));
      assert.notStrictEqual(visitorHash('1.2.3.4', 'UA', day1), visitorHash('1.2.3.4', 'Other', day1));
    });

    it('does not contain the IP address', () => {
      assert(!visitorHash('1.2.3.4', 'UA', day1).includes('1.2.3.4'));
    });
  });

  describe('privacy helpers', () => {
    it('keeps only the site a visitor came from, never the full URL', () => {
      assert.strictEqual(refererOrigin('https://www.google.com/search?q=john+isah+email'), 'https://www.google.com');
      assert.strictEqual(refererOrigin('android-app://com.linkedin.android/'), null);
      assert.strictEqual(refererOrigin(''), null);
    });

    it('reads location from Cloudflare headers only (no IP lookup)', () => {
      assert.deepStrictEqual(geoFromHeaders({ 'cf-ipcountry': 'FR', 'cf-region': '%C3%8Ele-de-France', 'cf-ipcity': 'Paris' }),
        { country: 'France', country_code: 'FR', region: 'Île-de-France', city: 'Paris' });
      assert.deepStrictEqual(geoFromHeaders({ 'cf-ipcountry': 'XX' }), { country: '', country_code: '', region: '', city: '' });
      assert.deepStrictEqual(geoFromHeaders({}), { country: '', country_code: '', region: '', city: '' });
    });
  });
});
