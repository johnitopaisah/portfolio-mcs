/**
 * Blog click tracking tests
 */

const assert = require('assert');
const { normalizeSourcePage, visitorHash, sessionIdFromCookie } = require('../src/services/blogClickService');
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

  describe('sessionIdFromCookie', () => {
    it('finds the session cookie among others', () => {
      assert.strictEqual(sessionIdFromCookie('a=1; portfolio-sid=abc-123; b=2'), 'abc-123');
      assert.strictEqual(sessionIdFromCookie('portfolio-sid=abc-123'), 'abc-123');
    });

    it('returns null when absent', () => {
      assert.strictEqual(sessionIdFromCookie('not-portfolio-sid=1'), null);
      assert.strictEqual(sessionIdFromCookie(undefined), null);
    });
  });
});
