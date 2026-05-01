/**
 * AI Job Filtering Service
 * Scores job relevance (0-100) and extracts metadata using pattern matching
 * Production: integrate with OpenAI GPT-4, Claude API, or Llama 2
 */

const pool = require('../../db/client');
const axios = require('axios');

class AIFilteringService {
  /**
   * Main entry point: filter and score jobs from jobs_raw
   */
  async filterUnprocessedJobs() {
    console.log('[AIFilter] Starting job filtering cycle...');

    // Get unprocessed raw jobs
    const rawJobs = await this.getUnprocessedRawJobs();
    console.log(`[AIFilter] Found ${rawJobs.length} raw jobs to process`);

    let processed = 0;
    let kept = 0;
    let dropped = 0;

    for (const rawJob of rawJobs) {
      try {
        const analysis = await this.analyzeJob(rawJob);
        await this.storeProcessedJob(rawJob, analysis);

        if (analysis.ai_decision === 'KEEP') kept++;
        else dropped++;

        processed++;

        // Rate limiting: 5 jobs per second to avoid API throttling
        if (processed % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[AIFilter] Failed to process job ${rawJob.id}:`, error.message);
      }
    }

    console.log(
      `[AIFilter] Complete: ${processed} processed, ${kept} kept, ${dropped} dropped`
    );
    return { processed, kept, dropped };
  }

  /**
   * Get raw jobs that haven't been processed yet
   */
  async getUnprocessedRawJobs(limit = 100) {
    const query = `
      SELECT jr.*
      FROM jobs_raw jr
      LEFT JOIN jobs j ON jr.id = j.job_raw_id
      WHERE j.id IS NULL
        AND jr.is_duplicate = FALSE
      ORDER BY jr.posted_at DESC
      LIMIT $1;
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Analyze a job using AI (hybrid approach: pattern matching + LLM)
   * Pattern matching: fast, deterministic, no API calls
   * LLM: accurate, but requires API calls and costs
   */
  async analyzeJob(rawJob) {
    // Start with pattern matching (fast, free)
    const patternAnalysis = this.analyzeJobByPatterns(rawJob);

    // Optionally augment with LLM for better accuracy
    let llmAnalysis = null;
    if (process.env.USE_LLM_FILTERING === 'true' && process.env.OPENAI_API_KEY) {
      try {
        llmAnalysis = await this.analyzeJobWithLLM(rawJob);
      } catch (error) {
        console.warn('[AIFilter] LLM analysis failed, falling back to pattern matching:', error.message);
      }
    }

    // Merge results (LLM overrides patterns if available)
    const finalAnalysis = llmAnalysis || patternAnalysis;

    return finalAnalysis;
  }

  /**
   * Pattern-based job analysis (fast, no API calls)
   * Suitable for real-time filtering and MVP
   */
  analyzeJobByPatterns(job) {
    const description = (job.description || '') + ' ' + (job.requirements || '');
    const lowerDesc = description.toLowerCase();

    // Define target tech stacks and keywords
    const targetKeywords = {
      devops: ['devops', 'ci/cd', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins'],
      cloud: ['aws', 'gcp', 'google cloud', 'azure', 'cloud', 'ec2', 's3', 'lambda'],
      infrastructure: ['infrastructure', 'network', 'linux', 'bash', 'shell', 'docker', 'container'],
      sre: ['sre', 'site reliability', 'monitoring', 'prometheus', 'grafana', 'observability'],
      embedded: ['embedded', 'firmware', 'microcontroller', 'arm', 'rtos', 'c language'],
      languages: {
        go: ['golang', 'go language', ' go '],
        rust: ['rust language', 'rustnpm', ' rust '],
        python: ['python', 'pytest', 'django', 'flask'],
        javascript: ['javascript', 'nodejs', 'typescript', 'react', 'vue', 'angular'],
        java: ['java', 'spring', 'gradle', 'maven'],
      },
    };

    // Score relevance (0-100)
    let relevanceScore = 50; // base score

    // Boost for target roles
    const roleKeywords = ['devops', 'sre', 'infrastructure', 'cloud', 'embedded', 'backend'];
    let roleMatches = 0;
    for (const role of roleKeywords) {
      if (lowerDesc.includes(role)) {
        roleMatches++;
      }
    }
    relevanceScore += Math.min(roleMatches * 5, 20); // max +20 for role match

    // Boost for tech stack matches
    const linkedTechs = new Set();
    for (const [category, keywords] of Object.entries(targetKeywords)) {
      if (typeof keywords[0] !== 'string') continue; // Skip nested objects
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          linkedTechs.add(category);
          relevanceScore += 3;
        }
      }
    }

    // Boost for programming languages
    let langMatches = 0;
    for (const [lang, keywords] of Object.entries(targetKeywords.languages)) {
      for (const keyword of keywords) {
        if (lowerDesc.includes(keyword)) {
          linkedTechs.add(lang);
          langMatches++;
          relevanceScore += 2;
        }
      }
    }

    // Penalty for junior-only positions (if seeking senior roles)
    if ((lowerDesc.includes('junior') || lowerDesc.includes('entry level')) && !lowerDesc.includes('senior')) {
      relevanceScore -= 10;
    }

    // Detect seniority level
    let seniority = 'Mid';
    if (lowerDesc.includes('senior') || lowerDesc.includes('lead') || lowerDesc.includes('principal')) {
      seniority = 'Senior';
    } else if (lowerDesc.includes('junior') || lowerDesc.includes('entry')) {
      seniority = 'Junior';
    }

    // Detect visa sponsorship
    let visaSponsored = null;
    if (lowerDesc.includes('visa') && lowerDesc.includes('sponsor')) {
      visaSponsored = true;
    }
    if (lowerDesc.includes('no visa') || lowerDesc.includes('not visa')) {
      visaSponsored = false;
    }

    // Final decision logic
    let decision = 'KEEP';
    if (relevanceScore < 40) {
      decision = 'DROP';
    } else if (relevanceScore < 60) {
      decision = 'REVIEW';
    }

    // Exclude locations with low match (if location filtering needed)
    const jobLocation = job.location || '';
    const acceptedLocations = ['remote', 'france', 'eu', 'europe'];
    if (
      !acceptedLocations.some((loc) => jobLocation.toLowerCase().includes(loc))
      && decision !== 'KEEP'
    ) {
      decision = 'DROP';
      relevanceScore = Math.max(0, relevanceScore - 20);
    }

    return {
      relevance_score: Math.min(100, Math.max(0, relevanceScore)),
      ai_decision: decision,
      ai_reasoning: `${roleMatches} role matches, ${langMatches} languages, ${linkedTechs.size} tech categories`,
      tech_stack: Array.from(linkedTechs),
      seniority_level: seniority,
      visa_sponsored: visaSponsored,
    };
  }

  /**
   * LLM-based job analysis (accurate, but requires API calls)
   * Integrates with OpenAI GPT-4 or Claude
   */
  async analyzeJobWithLLM(job) {
    const prompt = `
Analyze this job posting and return JSON:

Job Title: ${job.title}
Company: ${job.company_name}
Location: ${job.location}

Description: ${job.description}

Requirements: ${job.requirements}

Return JSON with:
- relevance_score: 0-100 (higher = better match for DevOps/Cloud/Embedded engineer role)
- ai_decision: "KEEP" | "REVIEW" | "DROP"
- ai_reasoning: brief reason (1-2 sentences)
- tech_stack: array of identified technologies
- seniority_level: "Junior" | "Mid" | "Senior"
- visa_sponsored: true | false | null

Focus on: DevOps, Cloud (AWS/GCP/Azure), Infrastructure, SRE, Kubernetes, Embedded systems.
Consider: Location (prefer Remote/EU), visa sponsorship, required languages (Go/Rust/Python/C).
    `.trim();

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a job market analyst. Return valid JSON only, no markdown.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const content = response.data.choices[0]?.message?.content;
      const analysis = JSON.parse(content);

      return {
        relevance_score: Math.min(100, Math.max(0, analysis.relevance_score || 0)),
        ai_decision: analysis.ai_decision || 'REVIEW',
        ai_reasoning: analysis.ai_reasoning || '',
        tech_stack: analysis.tech_stack || [],
        seniority_level: analysis.seniority_level || 'Mid',
        visa_sponsored: analysis.visa_sponsored,
      };
    } catch (error) {
      console.error('[AIFilter:LLM] API error:', error.message);
      throw error;
    }
  }

  /**
   * Store processed job in jobs table
   */
  async storeProcessedJob(rawJob, analysis) {
    const query = `
      INSERT INTO jobs (
        job_raw_id,
        external_id,
        company_name,
        title,
        location,
        job_type,
        description,
        requirements,
        salary_min,
        salary_max,
        salary_currency,
        posted_at,
        apply_url,
        source_api,
        relevance_score,
        ai_decision,
        ai_reasoning,
        tech_stack,
        seniority_level,
        visa_sponsored
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
      RETURNING id;
    `;

    const values = [
      rawJob.id,
      rawJob.external_id,
      rawJob.company_name,
      rawJob.title,
      rawJob.location,
      rawJob.job_type,
      rawJob.description,
      rawJob.requirements,
      rawJob.salary_min,
      rawJob.salary_max,
      rawJob.salary_currency,
      rawJob.posted_at,
      rawJob.apply_url,
      rawJob.source_api,
      analysis.relevance_score,
      analysis.ai_decision,
      analysis.ai_reasoning,
      analysis.tech_stack,
      analysis.seniority_level,
      analysis.visa_sponsored,
    ];

    const result = await pool.query(query, values);
    
    // Store tags for searchability
    if (analysis.tech_stack && analysis.tech_stack.length > 0) {
      await this.storeJobTags(result.rows[0].id, analysis.tech_stack, 'tech');
    }

    return result.rows[0]?.id;
  }

  /**
   * Store searchable tags for a job
   */
  async storeJobTags(jobId, tags, category) {
    const query = `
      INSERT INTO job_tags (job_id, tag, category)
      VALUES ${tags.map((_, i) => `($1, $${i + 2}, $${tags.length + 2})`).join(',')}
    `;

    const values = [jobId, ...tags, category];
    await pool.query(query, values);
  }

  /**
   * Get filtering statistics
   */
  async getFilteringStats(hoursBack = 24) {
    const query = `
      SELECT
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN ai_decision = 'KEEP' THEN 1 END) as kept,
        COUNT(CASE WHEN ai_decision = 'REVIEW' THEN 1 END) as review,
        COUNT(CASE WHEN ai_decision = 'DROP' THEN 1 END) as dropped,
        AVG(relevance_score) as avg_score,
        MAX(relevance_score) as max_score,
        MIN(relevance_score) as min_score
      FROM jobs
      WHERE created_at > NOW() - INTERVAL '1 hour' * $1;
    `;

    const result = await pool.query(query, [hoursBack]);
    return result.rows[0];
  }
}

module.exports = new AIFilteringService();
