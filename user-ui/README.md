# User UI

Public-facing portfolio website. Built with Next.js 14 (App Router) and TypeScript, server-side rendered for SEO.

- **Local:** http://localhost:3000
- **Production:** https://johnisah.com

---

## Tech stack

| Dependency | Purpose |
|---|---|
| Next.js 14 (App Router) | React SSR framework |
| React 18 + TypeScript | UI layer |
| Tailwind CSS | Utility-first styling |
| clsx | Conditional class merging |

All portfolio data is fetched server-side from the API on each request (with Next.js cache revalidation), so the page always reflects the latest published content without a client-side loading state.

---

## Directory structure

```
user-ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx              Root layout — fonts, global metadata
│   │   ├── page.tsx                Homepage — all portfolio sections (SSR)
│   │   ├── globals.css
│   │   ├── icon.tsx                Favicon
│   │   ├── opengraph-image.tsx     Dynamic OG image generation
│   │   └── jobs/
│   │       └── page.tsx            Public job listings page (AI-curated)
├── public/
├── Dockerfile
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Pages

### Homepage (`/`)

Single-page portfolio layout with these sections, all populated from the API:

| Section | Data source |
|---|---|
| Hero | `GET /api/profile` — name, headline, bio, avatar, hero tags |
| Projects | `GET /api/projects` — published projects with tech stacks and links |
| Skills | `GET /api/skills` — categorised skills with proficiency levels |
| Experience | `GET /api/experiences` — work history |
| Certifications | `GET /api/certifications` — credentials with issuer links |
| Contact | `POST /api/contact` — form submission (client-side) |

### Jobs (`/jobs`)

Displays AI-curated job listings sourced from Jooble, RemoteOK, and Adzuna. Jobs are scored for relevance by Claude Haiku and filtered to show only matches above the configured threshold.

---

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL for browser-side fetch (baked at build time) |
| `INTERNAL_API_URL` | API URL for Next.js server-side fetch inside Docker/K8s |
| `PORT` | Default `3000` |

For local dev, create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
INTERNAL_API_URL=http://localhost:4000
```

---

## Local development

```bash
cd user-ui
npm install
# Create .env.local with the variables above
npm run dev     # Next.js dev server on port 3000
```

---

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.johnisah.com \
  --build-arg INTERNAL_API_URL=http://api:4000 \
  -t portfolio-user-ui ./user-ui
```

`NEXT_PUBLIC_API_URL` is baked into the client bundle at build time. `INTERNAL_API_URL` is read at runtime by Next.js server components when making requests from inside the cluster.
