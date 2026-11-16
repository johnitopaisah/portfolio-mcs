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
│   │   ├── jobIngestion/                  (raw discovery lives in scraper/)
│   │   │   ├── jobIngestionService.js   Expiry + purge lifecycle for scored jobs
│   │   │   ├── aiFilteringService.js    Claude Haiku relevance scoring
│   │   │   ├── notificationService.js   Daily job digest email (08:15 Paris)
│   │   │   ├── ingestionLogsService.js  Per-run stats logging
│   │   │   └── config.js               Max job age + scoring thresholds
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
| GET | `/api/education` | Education history |
| GET | `/api/social-links` | Social / contact links |
| GET | `/api/referees` | Visible referees (email/phone hidden when available on request) |
| GET | `/api/referees/:id/photo` | Referee headshot binary |
| GET | `/api/referees/:id/org-logo` | Referee organisation logo binary |
| GET | `/api/referee-invitations/validate` | Validate a one-time invitation token |
| POST | `/api/referee-invitations/:token/submit` | Submit referee form (multipart, consumes token) |
| POST | `/api/referee-invitations/:token/request-modification` | Flag a submitted reference for modification |
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
| GET/POST/PUT/DELETE | `/api/education` | CRUD education entries |
| GET/POST/PUT/DELETE | `/api/social-links` | CRUD social/contact links |
| GET/PATCH | `/api/contact` | View/mark-read contact messages |
| GET/POST/PUT/DELETE | `/api/applications` | Job application CRM |
| GET | `/api/referees/all` | All referees including hidden ones + star_config |
| POST | `/api/referees` | Create referee (multipart) |
| PUT | `/api/referees/:id` | Update referee fields and images (multipart) |
| PUT | `/api/referees/:id/star-config` | Replace referee star animation config (JSON) |
| DELETE | `/api/referees/:id` | Delete referee |
| GET | `/api/referee-invitations` | List all invitation links |
| POST | `/api/referee-invitations` | Create a new `create` invitation link |
| POST | `/api/referee-invitations/for-referee/:id` | Create a `modify` link for an existing referee |
| DELETE | `/api/referee-invitations/:id` | Revoke an unused invitation link |
| GET | `/api/admin/jobs` | Browse ingested jobs + ingestion logs |
| POST | `/api/admin/jobs/:id/feedback` | Thumbs up/down on a job |
| GET/PUT | `/api/admin/ai` | AI pattern config (keywords, weights) |

---

## Background workers

Workers are run as Kubernetes CronJobs on a schedule, or triggered manually:

```bash
# Run job ingestion + AI scoring once
node src/workers/jobWorker.js

# Sync Gmail + the professional (IMAP) mailbox — every IMAP folder except
# Sent/Drafts/Trash; job mail found in Spam is held for review on the dashboard
node src/workers/emailWorker.js

# Re-scan the last 45 days of every IMAP folder (safe to repeat — de-duplicated by Message-ID)
node src/workers/emailWorker.js --only=imap --backfill-days=45

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
| `IMAP_HOST` | No | Professional mailbox IMAP host (enables IMAP sync); auth reuses `NOTIFY_EMAIL_USER/PASS` unless `IMAP_USER/IMAP_PASSWORD` are set |
| `IMAP_LOOKBACK_DAYS` | No | Days scanned for a folder with no saved position yet. Default `3` |
| `IMAP_EXCLUDE_FOLDERS` | No | Extra comma-separated folders to skip (Sent/Drafts/Trash/Templates/Snoozed always are) |
| `EMAIL_IGNORE_SENDER_DOMAINS` | No | Sender domains never captured. Default: the mailbox's own domain (own alerts/digests) |
| `REDIS_HOST` | No | Enables the shared content cache + shared rate-limit counters. Unset → per-pod memory |
| `REDIS_PORT` | No | Default `6379` |
| `REDIS_PASSWORD` | With `REDIS_HOST` | Redis `requirepass` (hex — `openssl rand -hex 32`) |
| `MIGRATE_BASELINE_THROUGH` | No | Migration runner: on a populated DB with no history, mark files up to this one as applied |
| `MIGRATE_BACKUP_DIR` | No | Migration runner: `pg_dump` here before applying anything |

---

## Database migrations

SQL files in `db/migrations/` are applied **automatically** — never by hand:

- They are bundled into the API image (`--build-context migrations=../db/migrations`).
- Before every rollout, ArgoCD runs `k8s/api/migrate-job.yaml` (PreSync hook) with the
  new image: it backs up the DB (only if something is pending), then applies each new
  file once, in order, recording it in `schema_migrations`. If a migration fails, the
  sync stops and the current version keeps running.
- CronJob workers check `schema_migrations` at start and skip a run if the database is
  behind their image.

Rules for new migrations:

1. Add a new file with the next number (`036_…sql`). **Never edit a file that has been
   applied** — the runner refuses to continue if a checksum changes.
2. A file runs in a transaction unless it contains its own `BEGIN;`, or a
   `-- migrate:no-transaction` line (needed for `CREATE INDEX CONCURRENTLY`).
   No-transaction files are sent one statement at a time and must be
   re-runnable (`IF NOT EXISTS`, guarded `DO` blocks): if one fails part-way,
   the next rollout runs the whole file again. See `037_repair_indexes.sql`.
4. `db/schema.sql` is generated (schema-only `pg_dump` + migration history) and
   is only used to initialise a brand-new database.
3. No psql meta-commands (`\connect`, `\i`, …) — CI rejects them.

```bash
npm run migrate:status                 # what is applied / pending (changes nothing)
node scripts/migrate.js --dry-run      # what would run
npm run migrate                        # apply pending (local dev)
```
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
