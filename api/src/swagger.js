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
      },
    },
    tags: [
      { name: 'Health',         description: 'API liveness check' },
      { name: 'Auth',           description: 'Authentication and password management' },
      { name: 'Profile',        description: 'Public portfolio profile' },
      { name: 'Projects',       description: 'Portfolio projects' },
      { name: 'Skills',         description: 'Technical skills' },
      { name: 'Experiences',    description: 'Work experience history' },
      { name: 'Certifications', description: 'Professional certifications' },
      { name: 'Contact',        description: 'Contact form messages' },
    ],
  },
  // Glob pointing at every route file that contains @swagger JSDoc comments
  apis: ['./src/index.js', './src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
