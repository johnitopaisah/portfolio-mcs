// Admin-side API client — attaches JWT from localStorage on every request
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
    throw new Error('Unauthorised');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Multipart request (for file uploads)
async function upload(path: string, formData: FormData, method = 'POST') {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/login';
    throw new Error('Unauthorised');
  }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const adminApi = {
  // Auth
  login: (username: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // Profile
  getProfile: () => request('/api/profile'),
  updateProfile: (fd: FormData) => upload('/api/profile', fd, 'PUT'),

  // Projects
  getProjects: () => request('/api/projects/all'),
  createProject: (fd: FormData) => upload('/api/projects', fd),
  updateProject: (id: string, fd: FormData) => upload(`/api/projects/${id}`, fd, 'PUT'),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  // Skills
  getSkills: () => request('/api/skills'),
  createSkill: (fd: FormData) => upload('/api/skills', fd),
  updateSkill: (id: string, fd: FormData) => upload(`/api/skills/${id}`, fd, 'PUT'),
  deleteSkill: (id: string) => request(`/api/skills/${id}`, { method: 'DELETE' }),

  // Experiences
  getExperiences: () => request('/api/experiences'),
  createExperience: (fd: FormData) => upload('/api/experiences', fd),
  updateExperience: (id: string, fd: FormData) => upload(`/api/experiences/${id}`, fd, 'PUT'),
  deleteExperience: (id: string) => request(`/api/experiences/${id}`, { method: 'DELETE' }),

  // Certifications
  getCertifications: () => request('/api/certifications'),
  createCertification: (fd: FormData) => upload('/api/certifications', fd),
  updateCertification: (id: string, fd: FormData) => upload(`/api/certifications/${id}`, fd, 'PUT'),
  deleteCertification: (id: string) => request(`/api/certifications/${id}`, { method: 'DELETE' }),

  // Messages
  getMessages: () => request('/api/contact'),
  markRead: (id: string) => request(`/api/contact/${id}/read`, { method: 'PATCH' }),
  deleteMessage: (id: string) => request(`/api/contact/${id}`, { method: 'DELETE' }),

  // Binary asset URLs — RELATIVE paths, proxied through Next.js (same-origin).
  // This avoids CORS/CORP issues for <img> tags in the admin UI.
  avatarUrl:   '/api/profile/avatar',
  projectImg:  (id: string) => `/api/projects/${id}/image`,
  skillIcon:   (id: string) => `/api/skills/${id}/icon`,
  expLogo:     (id: string) => `/api/experiences/${id}/logo`,
  certImg:     (id: string) => `/api/certifications/${id}/image`,
};
