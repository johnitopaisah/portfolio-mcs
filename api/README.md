# API Service

Node.js/Express REST API powering the Portfolio MCS platform. Handles portfolio content, authentication, job intelligence, application CRM, CV generation, email tracking, visitor analytics, and Prometheus metrics.

- **Local:** http://localhost:4000
- **Production:** https://api.johnisah.com
- **Swagger docs:** https://api.johnisah.com/api/docs

---

## Tech stack

| Dependency | Purpose |
|---|---|
| Express 4 | HTTP framework |
| jsonwebtoken + bcryptjs | JWT auth + password hashing |
| pg | PostgreSQL connection pooling |
| prom-client | Prometheus metrics |
| multer | File uploads (avatar, resume, project images) |
| puppeteer | PDF CV generation (headless Chromium) |
| googleapis | Gmail OAuth for email tracking |
| nodemailer | SMTP notifications (Zoho) |
| twilio | SMS notifications |
| @anthropic-ai/sdk | AI job relevance scoring (Claude Haiku) |
| swagger-jsdoc + swagger-ui-express | Auto-generated API docs |
| helmet + cors + express-rate-limit | Security middleware |
| compression + morgan | Performance + logging |

---

## Directory structure

```
api/
├── src/
│   ├── index.js                    Entry point — Express app, middleware, route wiring
│   ├── swagger.js                  OpenAPI spec definition
│   ├── metrics.js                  Prometheus counter/histogram definitions
│   ├── metricsMiddleware.js        HTTP request instrumentation
│   ├── db/
│   │   └── client.js               PostgreSQL pool (DATABASE_URL)
│   ├── middleware/
│   │   ├── auth.js                 JWT verification middleware
│   │   └── errorHandler.js         Central error handler
│   ├── routes/
│   │   ├── auth.js                 POST /api/auth/login, /forgot-password, /reset-password
│   │   ├── profile.js              GET/PUT /api/profile (avatar, resume upload)
│   │   ├── projects.js             CRUD /api/projects
│   │   ├── projectImages.js        GET/POST/DELETE /api/projects/:id/images
│   │   ├── skills.js               CRUD /api/skills
│   │   ├── experiences.js          CRUD /api/experiences
│   │   ├── certifications.js       CRUD /api/certifications
│   │   ├── contact.js              POST /api/contact, GET/PATCH (admin)
│   │   ├── visitors.js             POST /api/visitors (analytics ingestion)
│   │   ├── jobs.js                 GET /api/jobs (public job listings)
│   │   ├── applications.js         CRUD /api/applications (CRM)
│   │   └── admin/
│   │       ├── jobs.js             GET/POST /api/admin/jobs (ingestion control + feedback)
│   │       └── ai.js               GET/PUT /api/admin/ai (AI pattern configuration)
│   ├── services/
│   │   ├── notify.js               Email (SMTP) + SMS (Twilio) notifications
│   │   ├── geoip.js                IP → country/city lookup
│   │   ├── parseVisitor.js         User-agent + referrer parsing
│   │   ├── visitorDigest.js        Daily visitor analytics email (08:00 Paris)
│   │   ├── jobIngestion/
│   │   │   ├── jobIngestionService.js   Fetches from Jooble, RemoteOK, Adzuna
│   │   │   ├── aiFilteringService.js    Claude Haiku relevance scoring
│   │   │   ├── deduplicationService.js  URL-hash dedup before DB insert
│   │   │   ├── notificationService.js   Daily job digest email (08:15 Paris)
│   │   │   ├── ingestionLogsService.js  Per-run stats logging
│   │   │   └── config.js               Provider API keys + scoring thresholds
│   │   ├── cvGeneration/
│   │   │   ├── baseCvService.js         Fetch profile data from DB
│   │   │   ├── cvTailoringService.js    AI-tailored CV generation
│   │   │   └── pdfService.js            Puppeteer HTML → PDF rendering
│   │   └── emailTracking/
│   │       ├── gmailService.js          Gmail OAuth token management + fetch
│   │       └── emailClassificationService.js  Classify emails by application status
│   ├── templates/
│   │   ├── cv-template-en.html     English CV HTML template (Puppeteer)
│   │   └── cv-template-fr.html     French CV HTML template (Puppeteer)
│   └── workers/
│       ├── jobWorker.js            One-shot job ingestion + AI scoring run
│       ├── emailWorker.js          One-shot Gmail inbox sync
│       ├── followUpWorker.js       One-shot application follow-up check
│       └── cvWorker.js             One-shot CV generation run
├── scripts/
│   └── gmail-oauth-setup.js       Interactive script to generate Gmail OAuth tokens
├── test/
│   ├── jobIngestion.test.js        Integration tests for job ingestion pipeline
│   └── aiFiltering.test.js         Unit tests for AI scoring service
├── Dockerfile
├── .dockerignore
├── .env.example
└── package.json
```

---

## API endpoints

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service health check |
| GET | `/api/profile` | Portfolio owner profile |
| GET | `/api/projects` | Published projects |
| GET | `/api/skills` | Skills list |
| GET | `/api/experiences` | Work experience |
| GET | `/api/certifications` | Certifications |
| POST | `/api/contact` | Submit contact message |
| GET | `/api/jobs` | AI-curated public job listings |
| GET | `/api/docs` | Swagger UI |
| GET | `/metrics` | Prometheus metrics (internal scrape only) |

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Returns JWT |
| POST | `/api/auth/forgot-password` | Sends password reset email |
| POST | `/api/auth/reset-password` | Consumes reset token, sets new password |

### Admin (JWT required)

| Method | Path | Description |
|---|---|---|
| GET/PUT | `/api/profile` | Manage profile, upload avatar/resume |
| GET/POST/PUT/DELETE | `/api/projects` | CRUD projects |
| GET/POST/DELETE | `/api/projects/:id/images` | Project gallery images |
| GET/POST/PUT/DELETE | `/api/skills` | CRUD skills |
| GET/POST/PUT/DELETE | `/api/experiences` | CRUD experiences |
| GET/POST/PUT/DELETE | `/api/certifications` | CRUD certifications |
| GET/PATCH | `/api/contact` | View/mark-read contact messages |
| GET/POST/PUT/DELETE | `/api/applications` | Job application CRM |
| GET | `/api/admin/jobs` | Browse ingested jobs + ingestion logs |
| POST | `/api/admin/jobs/:id/feedback` | Thumbs up/down on a job |
| GET/PUT | `/api/admin/ai` | AI pattern config (keywords, weights) |

---

## Background workers

Workers are run as Kubernetes CronJobs on a schedule, or triggered manually:

```bash
# Run job ingestion + AI scoring once
node src/workers/jobWorker.js

# Sync Gmail inbox
node src/workers/emailWorker.js

# Check application follow-ups
node src/workers/followUpWorker.js

# Generate CV PDFs
node src/workers/cvWorker.js
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgres://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Yes | 64+ char random string |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins |
| `NODE_ENV` | No | `development` or `production` |
| `PORT` | No | Default `4000` |
| `ADMIN_URL` | Yes | Base URL for password reset links |
| `NOTIFY_EMAIL_USER` | No | Gmail address for SMTP notifications |
| `NOTIFY_EMAIL_PASS` | No | Gmail App Password (16 chars) |
| `NOTIFY_EMAIL_TO` | No | Recipient inbox for digests/alerts |
| `TWILIO_ACCOUNT_SID` | No | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token |
| `TWILIO_FROM` | No | Twilio sender number |
| `TWILIO_TO` | No | SMS recipient number |
| `ANTHROPIC_API_KEY` | No | Claude Haiku job scoring (disables if absent) |
| `GROQ_API_KEY` | No | Groq alternative AI provider |
| `GEMINI_API_KEY` | No | Gemini alternative AI provider |
| `GMAIL_CLIENT_ID` | No | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | No | Gmail OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | No | Gmail OAuth refresh token |
| `PUPPETEER_EXECUTABLE_PATH` | No | Path to Chromium binary in containers |

Copy `api/.env.example` → `api/.env` and fill in values.

---

## Local development

```bash
cd api
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET at minimum
npm run dev            # nodemon — hot reload on port 4000
```

Run tests:

```bash
npm test               # mocha — all test files
npm run test:watch     # watch mode
```

---

## Docker

```bash
# Build
docker build -t portfolio-api ./api

# Run (requires a running Postgres)
docker run -p 4000:4000 \
  -e DATABASE_URL=postgres://... \
  -e JWT_SECRET=... \
  portfolio-api
```

The Dockerfile uses a multi-stage build: `node:20-alpine` builder → lean production image with a non-root user.

---

## Prometheus metrics

Exposed at `GET /metrics` (Prometheus text format). Key metrics:

| Metric | Type | Description |
|---|---|---|
| `portfolio_http_requests_total` | Counter | Request count by method, route, status |
| `portfolio_http_request_duration_seconds` | Histogram | Latency by method, route, status |
| `portfolio_jobs_ingested_total` | Counter | Jobs ingested per provider per run |
| `portfolio_jobs_ai_scored_total` | Counter | Jobs AI-scored per run |

Scraped by Prometheus in the `monitoring` namespace via the `portfolio-api` ServiceMonitor.
