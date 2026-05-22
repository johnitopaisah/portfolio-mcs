# Database

PostgreSQL 16 service for the Portfolio MCS platform. The Docker image bundles the schema, seed script, and all migrations so the database is fully initialised on first start.

---

## Files

```
db/
├── Dockerfile              Extends postgres:16-alpine, copies init scripts
├── schema.sql              Master schema — auto-runs on first container start
├── seed.sh                 Seeds admin user from env vars — auto-runs on first start
└── migrations/             Manual migrations applied in order after initial setup
    ├── 001_project_images.sql       Add project_images table (multi-image gallery)
    ├── 001_add_visitor_logs.sql     Add visitor_logs table (analytics)
    ├── 002_job_system.sql           Add job_listings + ai_pattern_config tables
    ├── 002_add_job_feedback.sql     Add job_feedback table (thumbs up/down)
    ├── 003_ai_pattern_config.sql    Extend AI pattern config (keywords, weights)
    ├── 004_notification_log.sql     Add notification_log table (digest tracking)
    ├── 005-application-crm.sql      Add applications + application_emails tables
    └── 006-resume-languages.sql     Add resume_languages table (EN/FR CV support)
```

---

## Schema

### Core portfolio tables

| Table | Description |
|---|---|
| `profile` | Single-row owner profile — name, bio, avatar (BYTEA), resume (BYTEA), social links, hero tags |
| `projects` | Portfolio projects — title, description, tech_stack[], live_url, repo_url, featured, published, order_index |
| `project_images` | Gallery images per project (multiple per project, ordered) |
| `skills` | Technical skills — name, category, proficiency (1–5), icon (BYTEA), order_index |
| `experiences` | Work history — company, role, description, date range, tech_stack[], logo (BYTEA) |
| `certifications` | Professional credentials — name, issuer, dates, credential_id, credential_url, image (BYTEA) |
| `contact_messages` | Contact form submissions — name, email, subject, message, read flag |
| `admin_user` | Single admin account — username, bcrypt password hash, reset token + expiry |

### Job intelligence tables

| Table | Description |
|---|---|
| `job_listings` | AI-scored job listings from Jooble, RemoteOK, and Adzuna — title, company, location, url, relevance_score, provider, status |
| `job_feedback` | Per-job thumbs up/down feedback to improve future scoring |
| `ai_pattern_config` | Configurable keywords, must-have/must-not-have patterns, and scoring weights used by Claude Haiku |
| `notification_log` | Tracks per-run digest notifications to avoid duplicate emails |

### Application CRM tables

| Table | Description |
|---|---|
| `applications` | Job applications — company, role, status (applied/interview/offer/rejected/withdrawn), notes, applied_at |
| `application_emails` | Gmail threads linked to applications — subject, snippet, classification, received_at |

### Analytics

| Table | Description |
|---|---|
| `visitor_logs` | Visitor events — IP (hashed), country, city, user-agent, referrer, page, timestamp |
| `resume_languages` | Tracks which resume languages (EN/FR) have been uploaded |

---

## How initialisation works

PostgreSQL runs scripts in `docker-entrypoint-initdb.d/` on first start (when the data volume is empty):

1. `schema.sql` — creates all tables and extensions (`pgcrypto`)
2. `seed.sh` — inserts the admin user using `ADMIN_PASSWORD_HASH` and profile data from env vars

These only run **once**. If the volume already has data, they are skipped.

---

## Applying migrations

Migrations in `db/migrations/` are **not** applied automatically. Apply them manually after the container is running:

```bash
# From the repo root (docker-compose)
docker exec -i portfolio-db psql -U portfolio_user -d portfolio_db \
  < db/migrations/002_job_system.sql

# On Kubernetes
kubectl exec -it -n portfolio statefulset/portfolio-db -- \
  psql -U portfolio_user -d portfolio_db \
  -f /path/to/migration.sql
```

Apply in numeric order. Each migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

---

## Local access

```bash
# Via docker-compose
docker exec -it portfolio-db psql -U portfolio_user -d portfolio_db

# Direct port (mapped to 5432)
psql postgres://portfolio_user:YOUR_PASSWORD@localhost:5432/portfolio_db
```

---

## Backup and restore

See [scripts/README.md](../scripts/README.md) and [k8s/backup/README.md](../k8s/backup/README.md) for automated backup strategies.

Manual backup:

```bash
pg_dump postgres://portfolio_user:PASS@localhost:5432/portfolio_db \
  | gzip > backup_$(date +%Y%m%d).sql.gz
```

Manual restore:

```bash
gunzip -c backup_20260101.sql.gz | \
  psql postgres://portfolio_user:PASS@localhost:5432/portfolio_db
```
