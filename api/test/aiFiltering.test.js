/**
 * AI Filtering Service Tests
 */

const assert = require('assert');
const aiFilteringService = require('../src/services/jobIngestion/aiFilteringService');

describe('AI Filtering Service', () => {
  describe('Pattern-Based Analysis', () => {
    it('should score DevOps jobs highly', () => {
      const job = {
        title: 'DevOps Engineer',
        description: 'We are looking for a DevOps engineer with Kubernetes and Docker experience',
        requirements: 'Kubernetes, Docker, Terraform, AWS',
        location: 'Remote',
      };

      const analysis = aiFilteringService.analyzeJobByPatterns(job);

      assert(analysis.relevance_score > 70, 'DevOps job should score > 70');
      assert.strictEqual(analysis.ai_decision, 'KEEP');
      assert(analysis.tech_stack.includes('kubernetes') || analysis.tech_stack.length > 0);
    });

    it('should score junior-only positions lower', () => {
      const job = {
        title: 'Junior Developer',
        description: 'Entry level position for fresh graduates',
        requirements: 'HTML, CSS, JavaScript',
        location: 'Remote',
      };

      const analysis = aiFilteringService.analyzeJobByPatterns(job);

      // Junior role without senior experience required
      assert(analysis.relevance_score < 70, 'Junior-only job should score < 70');
    });

    it('should detect seniority levels', () => {
      const juniorJob = {
        title: 'Junior Developer',
        description: 'Entry level position',
        requirements: 'Basic Python',
        location: 'Remote',
      };

      const seniorJob = {
        title: 'Senior DevOps Engineer',
        description: 'We need an experienced DevOps lead',
        requirements: 'Kubernetes, AWS, Terraform',
        location: 'Remote',
      };

      const juniorAnalysis = aiFilteringService.analyzeJobByPatterns(juniorJob);
      const seniorAnalysis = aiFilteringService.analyzeJobByPatterns(seniorJob);

      assert.strictEqual(juniorAnalysis.seniority_level, 'Junior');
      assert.strictEqual(seniorAnalysis.seniority_level, 'Senior');
    });

    it('should detect visa sponsorship hints', () => {
      const sponsoredJob = {
        title: 'DevOps Engineer',
        description: 'We offer visa sponsorship',
        requirements: 'Kubernetes',
        location: 'Remote',
      };

      const noSponsorJob = {
        title: 'DevOps Engineer',
        description: 'No visa sponsorship available',
        requirements: 'Kubernetes',
        location: 'Remote',
      };

      const sponsoredAnalysis = aiFilteringService.analyzeJobByPatterns(sponsoredJob);
      const noSponsorAnalysis = aiFilteringService.analyzeJobByPatterns(noSponsorJob);

      assert.strictEqual(sponsoredAnalysis.visa_sponsored, true);
      assert.strictEqual(noSponsorAnalysis.visa_sponsored, false);
    });

    it('should extract tech stack from descriptions', () => {
      const job = {
        title: 'Backend Engineer',
        description: 'We use Kubernetes, Docker, AWS, and Go for our microservices',
        requirements: 'Experience with Go, Rust, or Python',
        location: 'Remote',
      };

      const analysis = aiFilteringService.analyzeJobByPatterns(job);

      assert(analysis.tech_stack.length > 0, 'Should detect tech stack');
      // Should include detected technologies
    });

    it('should drop non-matching jobs', () => {
      const job = {
        title: 'Sales Manager',
        description: 'We are looking for a sales manager to lead our team',
        requirements: 'Sales experience, CRM',
        location: 'New York',
      };

      const analysis = aiFilteringService.analyzeJobByPatterns(job);

      assert(analysis.relevance_score < 50, 'Sales job should score low');
      assert.strictEqual(analysis.ai_decision, 'DROP');
    });

    it('should validate relevance score is within bounds', () => {
      const jobs = [
        { title: 'DevOps', description: 'k8s docker aws', requirements: '', location: 'Remote' },
        { title: 'Sales', description: 'sales', requirements: '', location: 'Remote' },
      ];

      jobs.forEach((job) => {
        const analysis = aiFilteringService.analyzeJobByPatterns(job);
        assert(analysis.relevance_score >= 0 && analysis.relevance_score <= 100);
      });
    });
  });

  describe('Job Decision Logic', () => {
    it('should make correct KEEP/REVIEW/DROP decisions', () => {
      const testCases = [
        {
          job: {
            title: 'Senior DevOps Engineer',
            description: 'Kubernetes, Docker, AWS, Terraform',
            requirements: 'Go, Python',
            location: 'Remote',
          },
          expectedDecision: 'KEEP',
        },
        {
          job: {
            title: 'Mid-Level Developer',
            description: 'Some DevOps experience needed',
            requirements: 'Basic Python',
            location: 'EU',
          },
          expectedDecision: 'REVIEW',
        },
        {
          job: {
            title: 'Retail Manager',
            description: 'Manage store operations',
            requirements: 'Retail experience',
            location: 'US',
          },
          expectedDecision: 'DROP',
        },
      ];

      testCases.forEach(({ job, expectedDecision }) => {
        const analysis = aiFilteringService.analyzeJobByPatterns(job);
        assert.strictEqual(
          analysis.ai_decision,
          expectedDecision,
          `Job "${job.title}" should have decision "${expectedDecision}"`
        );
      });
    });
  });
});
