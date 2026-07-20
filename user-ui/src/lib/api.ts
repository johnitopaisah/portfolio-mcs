// Server-side fetches use INTERNAL_API_URL (injected at runtime from the K8s ConfigMap).
// The URL is read INSIDE the function — never as a module-level constant —
// so it is always resolved at request time, not frozen during build.
// Binary asset URLs use relative paths → proxied through middleware (same-origin).
//
// For local dev, set INTERNAL_API_URL in .env.local pointing to your local API.

function serverApi(): string {
  const url = process.env.INTERNAL_API_URL;

  if (!url) {
    throw new Error(
      'INTERNAL_API_URL is not set. ' +
      'In Kubernetes this comes from the portfolio-config ConfigMap. ' +
      'For local dev, add it to .env.local'
    );
  }

  return url;
}

// A timeout is required here, not optional: this runs during SSR of the
// homepage, which is also what the k8s liveness/readiness probes hit
// (GET /, 3-5s timeout). If the API Service has zero backing pods, a
// bare fetch() can hang far longer than that waiting on a connection
// that will never complete — the page then never responds in time,
// kubelet kills the pod for being "unresponsive", and it crash-loops
// forever without ever getting the chance to render the down state
// Promise.allSettled/BackendStatusSeed are there to show.
// Kept comfortably under the readiness probe's own 3s timeout (see
// k8s/user-ui/deployment.yaml) — the probe hits GET / directly, so this
// budget has to leave headroom for React's render + Node overhead on
// top of the abort itself, not consume the whole 3s.
const SSR_FETCH_TIMEOUT_MS = 2000;

// isBot is passed in explicitly, computed once by the caller (page.tsx) via
// next/headers — that import can't live in this module at all, since
// client components (e.g. HeroSection.tsx) import from `api` too, and
// next/headers only works in a Server Component.
async function get(path: string, isBot = false) {
  const res = await fetch(`${serverApi()}${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
    headers: { 'x-portfolio-is-bot': isBot ? '1' : '0' },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  // Server-side data fetches — resolved at request time via serverApi()
  getProfile:        (isBot?: boolean) => get('/api/profile', isBot),
  getProjects:       (isBot?: boolean) => get('/api/projects', isBot),
  getSkills:         () => get('/api/skills'),
  getExperiences:    () => get('/api/experiences'),
  getCertifications: () => get('/api/certifications'),
  getSocialLinks:    () => get('/api/social-links'),
  getEducation:      () => get('/api/education'),
  getReferies:       () => get('/api/referees'),
  getBlogPosts:      () => get('/api/blog'),

  // Binary asset URLs — relative paths, proxied through middleware (same-origin).
  // Never cross-origin from the browser's perspective.
  avatarUrl:       '/api/profile/avatar',
  resumeUrl:       '/api/profile/resume',
  projectImageUrl: (id: string) => `/api/projects/${id}/image`,
  skillIconUrl:    (id: string) => `/api/skills/${id}/icon`,
  expLogoUrl:      (id: string) => `/api/experiences/${id}/logo`,
  certImageUrl:    (id: string) => `/api/certifications/${id}/image`,
  educationLogoUrl: (id: string) => `/api/education/${id}/logo`,
  refereePhotoUrl:  (id: string) => `/api/referees/${id}/photo`,
  refereeOrgLogoUrl: (id: string) => `/api/referees/${id}/org-logo`,
};
