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

async function get(path: string) {
  const res = await fetch(`${serverApi()}${path}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  // Server-side data fetches — resolved at request time via serverApi()
  getProfile:        () => get('/api/profile'),
  getProjects:       () => get('/api/projects'),
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
