/**
 * Email → application matching tests (role-aware)
 */

const assert = require('assert');
const { roleSimilarity, isPlaceholderTitle, ROLE_MATCH, ROLE_DIFFERENT, PLACEHOLDER_TITLE } =
  require('../src/services/emailTracking/roleSimilarity');
const { decide } = require('../src/services/emailTracking/applicationMatchingService');

const NOW = new Date('2026-10-10T12:00:00Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86400000);

function app(overrides) {
  return {
    id: 1, company_name: 'Candela', job_title: 'DevOps Engineer', status: 'APPLIED',
    company_sim: 1, domain_match: false,
    applied_at: daysAgo(10), created_at: daysAgo(10), last_response_at: null,
    ...overrides,
  };
}

describe('Role similarity', () => {
  const same = [
    ['DevOps Engineer', 'Junior DevOps Engineer'],
    ['DevOps Engineer', 'DevOps Engineer (m/w/d)'],
    ['Ingénieur DevOps junior (H/F/X)', 'Junior DevOps Engineer'],
    ['Stage de fin d\'études - Ingénieur.e DevOps H/F', 'DevOps Intern'],
    ['Junior SRE', 'Junior Site Reliability Engineer'],
    ['(Junior) Cloud Engineer', 'Cloud Engineer'],
  ];
  for (const [a, b] of same) {
    it(`treats "${a}" and "${b}" as the same role`, () => {
      assert(roleSimilarity(a, b) >= ROLE_MATCH, `got ${roleSimilarity(a, b)}`);
    });
  }

  const different = [
    ['DevOps Engineer', 'Site Reliability Engineer'],
    ['DevOps Engineer', 'Cloud Engineer'],
    ['Cloud Architect', 'Docker Developer'],
    ['Platform Engineer H/F', 'Ingénieur Cloud SRE H/F'],
  ];
  for (const [a, b] of different) {
    it(`treats "${a}" and "${b}" as different roles`, () => {
      assert(roleSimilarity(a, b) < ROLE_DIFFERENT, `got ${roleSimilarity(a, b)}`);
    });
  }

  it('is symmetric', () => {
    assert.strictEqual(
      roleSimilarity('Junior DevOps Engineer', 'Cloud Engineer'),
      roleSimilarity('Cloud Engineer', 'Junior DevOps Engineer')
    );
  });

  it('does not call junior and senior variants a confident match', () => {
    assert(roleSimilarity('Junior DevOps Engineer', 'Senior DevOps Engineer') < ROLE_MATCH);
  });

  it('recognises placeholder titles', () => {
    assert(isPlaceholderTitle(PLACEHOLDER_TITLE));
    assert(isPlaceholderTitle(''));
    assert(!isPlaceholderTitle('DevOps Engineer'));
  });
});

describe('Application matching — decide()', () => {
  describe('application confirmations', () => {
    it('records a second role at a company already on file as a new application', () => {
      const r = decide({
        isConfirmation: true, extractedRole: 'Site Reliability Engineer',
        candidates: [app()], receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'new');
      assert.strictEqual(r.companyName, 'Candela');
    });

    it('links to the application already logged for that same role', () => {
      const r = decide({
        isConfirmation: true, extractedRole: 'DevOps Engineer',
        candidates: [app({ id: 7, status: 'CV_GENERATED' }), app({ id: 8, job_title: 'Cloud Engineer' })],
        receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.application.id, 7);
    });

    it('creates a new application when the role is not named and nothing is recent or in prep', () => {
      const r = decide({ isConfirmation: true, extractedRole: '', candidates: [app()], receivedAt: NOW });
      assert.strictEqual(r.status, 'new');
    });

    it('confirms the single application still in prep when no role is named', () => {
      const r = decide({
        isConfirmation: true, extractedRole: '',
        candidates: [app({ id: 3, status: 'READY_TO_APPLY' }), app({ id: 4, job_title: 'Cloud Engineer' })],
        receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.application.id, 3);
    });

    it('counts a second role-less confirmation within 24h once', () => {
      const r = decide({
        isConfirmation: true, extractedRole: '',
        candidates: [app({ id: 5, applied_at: new Date(NOW.getTime() - 3600000) })],
        receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.method, 'duplicate_confirmation');
    });

    it('fills in a just-created role-less application instead of duplicating it', () => {
      const r = decide({
        isConfirmation: true, extractedRole: 'SRE',
        candidates: [app({ id: 6, job_title: PLACEHOLDER_TITLE, applied_at: new Date(NOW.getTime() - 60000) })],
        receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.application.id, 6);
    });

    it('is never held back as a suggestion on a vague company resemblance', () => {
      const r = decide({
        isConfirmation: true, extractedRole: 'DevOps Engineer',
        candidates: [app({ company_sim: 0.35 })], receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'none');
    });
  });

  describe('replies about an existing application', () => {
    const two = [
      app({ id: 1, job_title: 'DevOps Engineer' }),
      app({ id: 2, job_title: 'Site Reliability Engineer' }),
    ];

    it('routes a reply to the application for the role it names', () => {
      const r = decide({ isConfirmation: false, extractedRole: 'Site Reliability Engineer', candidates: two, receivedAt: NOW });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.application.id, 2);
    });

    it('only suggests when no role is named and several applications are open', () => {
      const r = decide({ isConfirmation: false, extractedRole: '', candidates: two, receivedAt: NOW });
      assert.strictEqual(r.status, 'suggested');
    });

    it('matches the one open application when the others are closed', () => {
      const r = decide({
        isConfirmation: false, extractedRole: '',
        candidates: [app({ id: 1, status: 'REJECTED' }), app({ id: 2, job_title: 'Cloud Engineer' })],
        receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.application.id, 2);
    });

    it('matches the only application at a company when no role is named', () => {
      const r = decide({ isConfirmation: false, extractedRole: '', candidates: [app()], receivedAt: NOW });
      assert.strictEqual(r.status, 'matched');
    });

    it('treats a clearly different role at a known company as a new application', () => {
      const r = decide({ isConfirmation: false, extractedRole: 'Data Analyst', candidates: two, receivedAt: NOW });
      assert.strictEqual(r.status, 'new');
    });

    it('suggests rather than matches on a borderline role', () => {
      const r = decide({
        isConfirmation: false, extractedRole: 'Senior DevOps Engineer',
        candidates: [app({ job_title: 'Junior DevOps Engineer' })], receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'suggested');
    });

    it('suggests a weak company resemblance and reports none below it', () => {
      assert.strictEqual(
        decide({ isConfirmation: false, extractedRole: '', candidates: [app({ company_sim: 0.35 })], receivedAt: NOW }).status,
        'suggested'
      );
      assert.strictEqual(
        decide({ isConfirmation: false, extractedRole: '', candidates: [], receivedAt: NOW }).status,
        'none'
      );
    });

    it('trusts a sender-domain match even when the names differ', () => {
      const r = decide({
        isConfirmation: false, extractedRole: '',
        candidates: [app({ company_sim: 0.1, domain_match: true })], receivedAt: NOW,
      });
      assert.strictEqual(r.status, 'matched');
      assert.strictEqual(r.method, 'domain');
    });
  });
});
