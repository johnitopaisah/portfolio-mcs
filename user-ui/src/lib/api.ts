// Server-side fetches use INTERNAL_API_URL (http://api:4000 inside Docker).
// The URL is read INSIDE the function — never as a module-level constant —
// so it is always resolved at request time, not frozen during build.
// Browser asset URLs use relative paths → proxied through Next.js (same-origin).

function serverApi() {
  const url =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error("API URL is not defined");
  }

  return url;
}

// function serverApi() {
//   return (
//     process.env.INTERNAL_API_URL ||
//     process.env.NEXT_PUBLIC_API_URL ||
//     // 'http://localhost:4000'
//   );
// }

async function get(path: string) {
  const res = await fetch(`${serverApi()}${path}`, {
    cache: 'no-store', // always fresh — avoids build-time cached failures
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

  // Binary asset URLs — relative paths, proxied through Next.js (same-origin).
  // Never cross-origin from the browser's perspective.
  avatarUrl:       '/api/profile/avatar',
  resumeUrl:       '/api/profile/resume',
  projectImageUrl: (id: string) => `/api/projects/${id}/image`,
  skillIconUrl:    (id: string) => `/api/skills/${id}/icon`,
  expLogoUrl:      (id: string) => `/api/experiences/${id}/logo`,
  certImageUrl:    (id: string) => `/api/certifications/${id}/image`,
};
