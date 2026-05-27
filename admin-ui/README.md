# Admin UI

Private CMS dashboard for managing all portfolio content. Built with Next.js 14 (App Router) and TypeScript.

- **Local:** http://localhost:3001
- **Production:** https://admin.johnisah.com

---

## Tech stack

| Dependency | Purpose |
|---|---|
| Next.js 14 (App Router) | React framework with SSR |
| React 18 + TypeScript | UI layer |
| Tailwind CSS | Utility-first styling |
| clsx | Conditional class merging |

Auth is stateless JWT — the token is stored in a cookie and verified by Next.js middleware on every protected route. No external auth library is used.

---

## Directory structure

```
admin-ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx              Root layout (fonts, global CSS)
│   │   ├── page.tsx                Root redirect → /login
│   │   ├── globals.css
│   │   ├── icon.tsx                Favicon
│   │   ├── login/
│   │   │   └── page.tsx            Login form — POST /api/auth/login
│   │   ├── forgot-password/
│   │   │   └── page.tsx            Trigger password-reset email
│   │   ├── reset-password/
│   │   │   └── page.tsx            Consume reset token, set new password
│   │   └── dashboard/
│   │       ├── layout.tsx          Sidebar shell (wraps all dashboard pages)
│   │       ├── page.tsx            Dashboard home — stats overview
│   │       ├── profile/            Edit name, headline, bio, avatar, resume
│   │       ├── projects/           CRUD projects + gallery image management
│   │       ├── skills/             CRUD skills with category + proficiency
│   │       ├── experience/         CRUD work experience entries
│   │       ├── certifications/     CRUD certifications
│   │       ├── messages/           View and mark-read contact messages
│   │       ├── jobs/               Browse AI-curated job listings + give feedback
│   │       ├── applications/       Job application CRM — track status, notes
│   │       ├── cv-library/         Download AI-tailored CV PDFs (EN/FR)
│   │       ├── email-tracking/     Gmail inbox sync — classify application emails
│   │       └── ai/                 AI Engine config — keywords, weights, providers
│   ├── components/
│   │   ├── Sidebar.tsx             Navigation sidebar with all dashboard links
│   │   └── Icons.tsx               SVG icon set
│   ├── lib/
│   │   └── api.ts                  Typed API client (wraps fetch → API service)
│   └── middleware.ts               JWT cookie check — redirects unauthenticated requests
├── public/
│   └── robots.txt
├── Dockerfile
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Dashboard sections

| Section | Route | Description |
|---|---|---|
| Overview | `/dashboard` | Live stats: project count, message count, job count |
| Profile | `/dashboard/profile` | Edit all profile fields, upload avatar and resume |
| Projects | `/dashboard/projects` | Create/edit/delete projects, manage gallery images |
| Skills | `/dashboard/skills` | Categorised skills with 1–5 proficiency rating |
| Experience | `/dashboard/experience` | Work history entries with date ranges and tech stacks |
| Certifications | `/dashboard/certifications` | Certifications with credential links |
| Messages | `/dashboard/messages` | Contact form submissions, mark as read |
| Jobs | `/dashboard/jobs` | AI-curated job listings, thumbs up/down feedback |
| Applications | `/dashboard/applications` | Full CRM: track applied/interview/offer/rejected |
| CV Library | `/dashboard/cv-library` | Download AI-tailored CVs in English or French |
| Email Tracking | `/dashboard/email-tracking` | Synced Gmail threads classified by application status |
| AI Engine | `/dashboard/ai` | Configure AI scoring: keywords, patterns, weights |

---

## Authentication flow

1. User submits credentials at `/login`
2. API returns a JWT on success
3. Token is stored as an `httpOnly` cookie named `auth-token`
4. `src/middleware.ts` intercepts every `/dashboard/*` request and verifies the cookie
5. Expired or missing token redirects to `/login`

---

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL used by browser-side fetch (baked at build time) |
| `INTERNAL_API_URL` | API URL used by Next.js server-side fetch inside Docker/K8s |
| `PORT` | Default `3001` |

These are set via Docker build args and docker-compose environment. For local dev, create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
INTERNAL_API_URL=http://localhost:4000
```

---

## Local development

```bash
cd admin-ui
npm install
# Create .env.local with the variables above
npm run dev     # Next.js dev server on port 3001
```

The API must be running at `NEXT_PUBLIC_API_URL` for login and data fetching to work.

---

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.johnisah.com \
  --build-arg INTERNAL_API_URL=http://api:4000 \
  -t portfolio-admin-ui ./admin-ui
```

The Dockerfile uses a multi-stage build: `node:20-alpine` builder → slim `node:20-alpine` runtime with a non-root user. `NEXT_PUBLIC_API_URL` must be provided at build time because Next.js bakes it into the client bundle.
