'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Portfolio MCS API',
      version: '1.0.0',
      description: [
        'REST API powering **johnisah.com** — a production-grade cloud-native portfolio platform.',
        '',
        '### Authentication',
        'Admin endpoints are protected by **JWT Bearer** tokens.',
        'Obtain a token via `POST /api/auth/login`, then click the **Authorize** button',
        'at the top of this page and paste the token.',
        '',
        '### Public vs Admin',
        '- **Public** endpoints require no authentication.',
        '- **🔒 Admin** endpoints require a valid `Authorization: Bearer <token>` header.',
        '',
        '### Rate limits',
        '`POST /api/contact` is limited to **5 requests per 15 minutes** per IP.',
      ].join('\n'),
      contact: {
        name: 'John Itopa ISAH',
        url: 'https://johnisah.com',
        email: 'connect@johnisah.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://api.johnisah.com',
        description: 'Production',
      },
      {
        url: 'http://localhost:4000',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Obtain a token from `POST /api/auth/login` and paste it here.',
        },
      },
      schemas: {
        // ── Common ──────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Resource not found' },
          },
        },
        // ── Profile ─────────────────────────────────────────────
        Profile: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            name:        { type: 'string', example: 'John Itopa ISAH' },
            headline:    { type: 'string', example: 'DevOps & Cloud Engineer' },
            bio:         { type: 'string', example: 'Engineering graduate specialising in cloud infrastructure…' },
            email:       { type: 'string', format: 'email', example: 'connect@johnisah.com' },
            github_url:  { type: 'string', format: 'uri', example: 'https://github.com/johnitopaisah' },
            linkedin_url:{ type: 'string', format: 'uri', example: 'https://linkedin.com/in/johnitopaisah' },
            hero_tags:   { type: 'array', items: { type: 'string' }, example: ['Kubernetes', 'Docker', 'AWS'] },
            has_avatar:  { type: 'boolean' },
            has_resume:  { type: 'boolean' },
            updated_at:  { type: 'string', format: 'date-time' },
          },
        },
        // ── Project ─────────────────────────────────────────────
        Project: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            title:       { type: 'string', example: 'Portfolio MCS' },
            description: { type: 'string' },
            tech_stack:  { type: 'array', items: { type: 'string' }, example: ['Next.js', 'Kubernetes'] },
            live_url:    { type: 'string', format: 'uri', nullable: true },
            repo_url:    { type: 'string', format: 'uri', nullable: true },
            featured:    { type: 'boolean' },
            published:   { type: 'boolean' },
            order_index: { type: 'integer' },
            start_date:  { type: 'string', format: 'date', nullable: true },
            end_date:    { type: 'string', format: 'date', nullable: true },
            ongoing:     { type: 'boolean' },
            has_image:   { type: 'boolean' },
            created_at:  { type: 'string', format: 'date-time' },
          },
        },
        // ── Skill ───────────────────────────────────────────────
        Skill: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            name:        { type: 'string', example: 'Kubernetes' },
            category:    { type: 'string', example: 'DevOps' },
            proficiency: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
            order_index: { type: 'integer' },
            has_icon:    { type: 'boolean' },
          },
        },
        // ── Experience ──────────────────────────────────────────
        Experience: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            company:     { type: 'string', example: 'ALX Africa' },
            role:        { type: 'string', example: 'DevOps Engineer' },
            description: { type: 'string' },
            start_date:  { type: 'string', format: 'date' },
            end_date:    { type: 'string', format: 'date', nullable: true },
            ongoing:     { type: 'boolean' },
            tech_stack:  { type: 'array', items: { type: 'string' }, example: ['Kubernetes', 'Docker'] },
            order_index: { type: 'integer' },
            has_logo:    { type: 'boolean' },
          },
        },
        // ── Certification ────────────────────────────────────────
        Certification: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            name:           { type: 'string', example: 'Certified Kubernetes Administrator' },
            issuer:         { type: 'string', example: 'CNCF' },
            issue_date:     { type: 'string', format: 'date' },
            expiry_date:    { type: 'string', format: 'date', nullable: true },
            credential_id:  { type: 'string', nullable: true },
            credential_url: { type: 'string', format: 'uri', nullable: true },
            order_index:    { type: 'integer' },
            has_image:      { type: 'boolean' },
          },
        },
        // ── Contact message ──────────────────────────────────────
        ContactMessage: {
          type: 'object',
          properties: {
            id:         { type: 'string', format: 'uuid' },
            name:       { type: 'string', example: 'Jane Recruiter' },
            email:      { type: 'string', format: 'email' },
            subject:    { type: 'string', example: 'Job opportunity' },
            message:    { type: 'string' },
            read:       { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        // ── Star animation config ─────────────────────────────────
        StarConfig: {
          type: 'object',
          nullable: true,
          description: 'Per-referee star animation configuration. null means defaults apply.',
          properties: {
            enabled:       { type: 'boolean', example: true },
            count:         { type: 'integer', minimum: 10, maximum: 60, example: 32 },
            size:          { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], example: 'md' },
            speed:         { type: 'string', enum: ['slow', 'normal', 'fast'], example: 'normal' },
            sparkle_ratio: { type: 'number', minimum: 0, maximum: 1, example: 0.55, description: 'Fraction of stars that are ✦ sparkles vs glow dots' },
            mask_start:    { type: 'integer', minimum: 10, maximum: 60, example: 28, description: 'Percentage from centre where stars begin appearing' },
            colors:        { type: 'array', items: { type: 'string' }, example: ['#a78bfa', '#67e8f9', '#fcd34d'] },
          },
        },
        // ── Referee ───────────────────────────────────────────────
        Referee: {
          type: 'object',
          properties: {
            id:                   { type: 'string', format: 'uuid' },
            name:                 { type: 'string', example: 'Mario Valdivia' },
            title:                { type: 'string', example: 'Software Engineering Lead' },
            organization:         { type: 'string', example: 'Quandela' },
            relationship:         { type: 'string', example: 'Team Lead' },
            review:               { type: 'string', nullable: true },
            linkedin_url:         { type: 'string', format: 'uri', nullable: true },
            available_on_request: { type: 'boolean', description: 'When true, email and phone are hidden from public responses' },
            email:                { type: 'string', format: 'email', nullable: true, description: 'null in public responses when available_on_request is true' },
            phone:                { type: 'string', nullable: true, description: 'null in public responses when available_on_request is true' },
            has_photo:            { type: 'boolean' },
            has_org_logo:         { type: 'boolean' },
            order_index:          { type: 'integer' },
            star_config:          { '$ref': '#/components/schemas/StarConfig', nullable: true },
          },
        },
        // ── Job ──────────────────────────────────────────────────
        Job: {
          type: 'object',
          properties: {
            id:              { type: 'string', format: 'uuid' },
            company_name:    { type: 'string', example: 'Acme Corp' },
            title:           { type: 'string', example: 'Platform Engineer' },
            location:        { type: 'string', example: 'Paris, France' },
            job_type:        { type: 'string', example: 'Full-time' },
            description:     { type: 'string' },
            requirements:    { type: 'string' },
            apply_url:       { type: 'string', format: 'uri' },
            source_api:      { type: 'string', example: 'joobleApi' },
            relevance_score: { type: 'integer', minimum: 0, maximum: 100, example: 82 },
            ai_decision:     { type: 'string', enum: ['KEEP', 'REVIEW', 'DROP'], example: 'KEEP' },
            ai_reasoning:    { type: 'string', nullable: true },
            tech_stack:      { type: 'array', items: { type: 'string' }, example: ['Kubernetes', 'Terraform'] },
            seniority_level: { type: 'string', nullable: true, example: 'Senior' },
            visa_sponsored:  { type: 'boolean' },
            salary_min:      { type: 'number', nullable: true },
            salary_max:      { type: 'number', nullable: true },
            salary_currency: { type: 'string', nullable: true, example: 'EUR' },
            posted_at:       { type: 'string', format: 'date-time' },
            is_active:       { type: 'boolean' },
            created_at:      { type: 'string', format: 'date-time' },
          },
        },
        // ── Application ───────────────────────────────────────────
        Application: {
          type: 'object',
          properties: {
            id:              { type: 'integer' },
            job_id:          { type: 'string', format: 'uuid', nullable: true },
            company_name:    { type: 'string', example: 'Acme Corp' },
            job_title:       { type: 'string', example: 'Platform Engineer' },
            job_url:         { type: 'string', format: 'uri', nullable: true },
            source_platform: { type: 'string', example: 'joobleApi' },
            match_score:     { type: 'integer', nullable: true },
            status: {
              type: 'string',
              enum: ['DRAFT','CV_GENERATED','READY_TO_APPLY','APPLIED','EMAIL_RECEIVED',
                     'HR_CONTACTED','INTERVIEW_INVITE','TECHNICAL_TEST','INTERVIEW_SCHEDULED',
                     'FINAL_INTERVIEW','OFFER','REJECTED','NO_RESPONSE','ARCHIVED'],
              example: 'APPLIED',
            },
            notes:      { type: 'string', nullable: true },
            applied_at: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        // ── Application document ──────────────────────────────────
        ApplicationDocument: {
          type: 'object',
          properties: {
            id:               { type: 'integer' },
            application_id:   { type: 'integer' },
            document_type:    { type: 'string', enum: ['cv', 'cover_letter'], example: 'cv' },
            version:          { type: 'integer', example: 1 },
            base_cv_version:  { type: 'integer', nullable: true },
            ai_model:         { type: 'string', nullable: true, example: 'claude-haiku-4-5' },
            prompt_version:   { type: 'string', nullable: true },
            generated_by_ai:  { type: 'boolean' },
            created_at:       { type: 'string', format: 'date-time' },
          },
        },
        // ── Education ─────────────────────────────────────────────
        Education: {
          type: 'object',
          properties: {
            id:              { type: 'string', format: 'uuid' },
            institution:     { type: 'string', example: 'École Polytechnique' },
            institution_url: { type: 'string', format: 'uri', nullable: true },
            degree:          { type: 'string', example: 'Master of Science' },
            field_of_study:  { type: 'string', example: 'Computer Science' },
            description:     { type: 'string', nullable: true },
            grade:           { type: 'string', nullable: true, example: 'First Class Honours' },
            activities:      { type: 'string', nullable: true },
            start_date:      { type: 'string', format: 'date' },
            end_date:        { type: 'string', format: 'date', nullable: true },
            ongoing:         { type: 'boolean' },
            has_logo:        { type: 'boolean' },
            order_index:     { type: 'integer' },
          },
        },
        // ── Social link ───────────────────────────────────────────
        SocialLink: {
          type: 'object',
          properties: {
            id:          { type: 'string', format: 'uuid' },
            platform:    { type: 'string', example: 'GitHub' },
            label:       { type: 'string', example: 'GitHub' },
            url:         { type: 'string', format: 'uri', example: 'https://github.com/johnitopaisah' },
            order_index: { type: 'integer' },
          },
        },
        // ── Referee invitation ────────────────────────────────────
        RefereeInvitation: {
          type: 'object',
          properties: {
            id:            { type: 'string', format: 'uuid' },
            note:          { type: 'string', nullable: true, example: 'For Mario Valdivia - Quandela' },
            type:          { type: 'string', enum: ['create', 'modify'], example: 'create' },
            referee_id:    { type: 'string', format: 'uuid', nullable: true },
            referee_name:  { type: 'string', nullable: true, example: 'Mario Valdivia' },
            expires_at:    { type: 'string', format: 'date-time' },
            used:          { type: 'boolean' },
            used_at:       { type: 'string', format: 'date-time', nullable: true },
            created_at:    { type: 'string', format: 'date-time' },
            link:          { type: 'string', format: 'uri', example: 'https://johnisah.com/referee-form?token=abc123' },
            expired:       { type: 'boolean' },
          },
        },
      },
    },
    tags: [
      { name: 'Health',               description: 'API liveness check' },
      { name: 'Auth',                 description: 'Authentication and password management' },
      { name: 'Profile',              description: 'Public portfolio profile' },
      { name: 'Projects',             description: 'Portfolio projects' },
      { name: 'Skills',               description: 'Technical skills' },
      { name: 'Experiences',          description: 'Work experience history' },
      { name: 'Certifications',       description: 'Professional certifications' },
      { name: 'Contact',              description: 'Contact form messages' },
      { name: 'Referees',             description: 'Professional references with per-referee star animation config' },
      { name: 'Referee Invitations',  description: 'Time-limited invitation and modification links for referees' },
      { name: 'Jobs',                 description: 'AI-curated public job listings and feedback' },
      { name: 'Education',            description: 'Education history' },
      { name: 'Social Links',         description: 'Social media and contact links' },
      { name: 'Applications',         description: 'Job application CRM — pipeline, documents, email tracking' },
      { name: 'Admin: AI Engine',     description: 'AI scoring engine configuration, pattern editing, live tester, calibration' },
      { name: 'Admin: Job Pipeline',  description: 'Job ingestion control, pipeline browsing, monitoring, and admin feedback' },
    ],
  },
  // Glob picks up all route files including admin/ subdirectory
  apis: ['./src/index.js', './src/routes/**/*.js'],
};

module.exports = swaggerJsdoc(options);
