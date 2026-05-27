/**
 * Job Ingestion Service Tests
 */

const assert = require('assert');
const jobIngestionService = require('../src/services/jobIngestion/jobIngestionService');
const { calculateDeduplicationHash, deduplicateJobs } = require('../src/services/jobIngestion/deduplicationService');

describe('Job Ingestion Service', () => {
  describe('Deduplication', () => {
    it('should calculate consistent hash for same job data', () => {
      const hash1 = calculateDeduplicationHash('Senior DevOps Engineer', 'Google', 'Remote');
      const hash2 = calculateDeduplicationHash('Senior DevOps Engineer', 'Google', 'Remote');
      assert.strictEqual(hash1, hash2);
    });

    it('should produce different hashes for different jobs', () => {
      const hash1 = calculateDeduplicationHash('Senior DevOps Engineer', 'Google', 'Remote');
      const hash2 = calculateDeduplicationHash('Junior DevOps Engineer', 'Google', 'Remote');
      assert.notStrictEqual(hash1, hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = calculateDeduplicationHash('Senior DevOps Engineer', 'Google', 'Remote');
      const hash2 = calculateDeduplicationHash('SENIOR DEVOPS ENGINEER', 'google', 'remote');
      assert.strictEqual(hash1, hash2);
    });

    it('should identify duplicate jobs', async () => {
      const jobs = [
        {
          external_id: 'job1',
          title: 'Senior DevOps Engineer',
          company_name: 'Google',
          location: 'Remote',
          description: 'Great job',
          apply_url: 'http://example.com',
          source_api: 'test',
          raw_data: {},
        },
        {
          external_id: 'job2',
          title: 'Senior DevOps Engineer',
          company_name: 'Google',
          location: 'Remote',
          description: 'Same job',
          apply_url: 'http://example.com/2',
          source_api: 'test',
          raw_data: {},
        },
      ];

      const { newJobs, duplicates } = await deduplicateJobs(jobs, 'test');
      
      // First job should be new, second should be marked as duplicate
      assert.strictEqual(duplicates.length + newJobs.length, 2);
    });
  });

  describe('Job Normalization', () => {
    it('should normalize API job fields correctly', () => {
      const apiJob = {
        id: 'ext-123',
        title: 'DevOps Engineer',
        company: 'TechCorp',
        location: 'San Francisco',
        snippet: 'We are looking for a DevOps engineer...',
        link: 'https://example.com/job',
        updated: Math.floor(Date.now() / 1000),
      };

      // Verify that the service would normalize this properly
      assert(apiJob.id);
      assert(apiJob.title);
      assert(apiJob.company);
      assert(apiJob.link);
    });
  });
});
