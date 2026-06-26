// Admin-side API client — attaches JWT from localStorage on every request.
// NEXT_PUBLIC_API_URL must be set — no localhost fallback.
// In local dev, create admin-ui/.env.local with:

function getApiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  return url.replace(/\/$/, '');
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${getApiBase()}${path}`, {
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
  const res = await fetch(`${getApiBase()}${path}`, {
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
  setAvailabilityStatus: (status: 'active' | 'passive' | 'not_open') =>
    request('/api/profile/availability', { method: 'PUT', body: JSON.stringify({ status }) }),
  setOrbitBadges: (ids: string[]) =>
    request('/api/profile/orbit-badges', { method: 'PUT', body: JSON.stringify({ ids }) }),

  // Projects
  getProjects: () => request('/api/projects/all'),
  createProject: (fd: FormData) => upload('/api/projects', fd),
  updateProject: (id: string, fd: FormData) => upload(`/api/projects/${id}`, fd, 'PUT'),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  // Project demo images (slideshow)
  getProjectImages: (projectId: string) =>
    request(`/api/projects/${projectId}/images`),
  uploadProjectImages: (projectId: string, fd: FormData) =>
    upload(`/api/projects/${projectId}/images`, fd),
  updateProjectImage: (projectId: string, imgId: string, data: { caption?: string; order_index?: number }) =>
    request(`/api/projects/${projectId}/images/${imgId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProjectImage: (projectId: string, imgId: string) =>
    request(`/api/projects/${projectId}/images/${imgId}`, { method: 'DELETE' }),

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

  // AI management
  getAiStatus:         () => request('/api/admin/ai/status'),
  saveAiStatus:        (data: Record<string, unknown>) =>
    request('/api/admin/ai/status', { method: 'PUT', body: JSON.stringify(data) }),
  getAiPatternConfig:  () => request('/api/admin/ai/pattern-config'),
  saveAiPatternConfig: (data: Record<string, unknown>) =>
    request('/api/admin/ai/pattern-config', { method: 'PUT', body: JSON.stringify(data) }),
  testAiScore:         (job: Record<string, string>) =>
    request('/api/admin/ai/test-score', { method: 'POST', body: JSON.stringify(job) }),
  getAiCalibration:    () => request('/api/admin/ai/calibration'),

  // Jobs pipeline (admin triage view)
  getJobsPipeline: (params: Record<string, string>) =>
    request(`/api/admin/jobs/pipeline?${new URLSearchParams(params)}`),
  getJobsProgress: () =>
    request('/api/admin/jobs/pipeline/progress'),
  getSourcesStatus: () =>
    request('/api/admin/jobs/sources-status'),
  jobFeedback: (id: string, action: string) =>
    request(`/api/jobs/${id}/feedback`, { method: 'POST', body: JSON.stringify({ action }) }),
  createApplication: (jobId: string) =>
    request('/api/applications', { method: 'POST', body: JSON.stringify({ job_id: jobId }) }),
  getApplications: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/applications${qs ? `?${qs}` : ''}`);
  },
  archiveApplication: (id: number) =>
    request(`/api/applications/${id}`, { method: 'DELETE' }),
  getApplication: (id: number | string) =>
    request(`/api/applications/${id}`),
  patchApplicationStatus: (id: number | string, status: string, description?: string) =>
    request(`/api/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, description }),
    }),
  addNote: (id: number | string, note: string) =>
    request(`/api/applications/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  generateCv: (id: number | string, body: {
    force?:       boolean;
    language?:    string;
    sections?:    string[];
    userHints?:   string;
    hintChips?:   string[];
    intensity?:   string;
    templateId?:  string;
    colorScheme?: string;
    accentColor?: string;
    fontFamily?:  string;
    fontSize?:    string;
    lineDensity?: string;
  }) =>
    request(`/api/applications/${id}/generate-cv`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateCoverLetter: (id: number | string, body: {
    language?:           string;
    tone?:               string;
    length?:             string;
    format?:             string;
    userHints?:          string;
    accentColor?:        string;
    colorScheme?:        string;
    linkedCvDocumentId?: number | null;
  }) =>
    request(`/api/applications/${id}/generate-cover-letter`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCvTemplates: (jd?: string) => {
    const qs = jd ? `?jd=${encodeURIComponent(jd.slice(0, 500))}` : '';
    return request(`/api/applications/cv-templates${qs}`);
  },

  getProfileSectionsStatus: (): Promise<Record<string, boolean>> =>
    request('/api/applications/profile-sections-status'),

  refreshBaseCv: () =>
    request('/api/admin/ai/refresh-base-cv', { method: 'POST' }),

  getDocumentSourceHtml: async (appId: number | string, docId: number): Promise<string> => {
    const token = getToken();
    const res = await fetch(
      `${getApiBase()}/api/applications/${appId}/documents/${docId}/preview`,
      { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },

  reformatDocument: async (
    appId: number | string,
    docId: number,
    config: {
      templateId?: string; colorScheme?: string; accentColor?: string;
      fontFamily?: string; fontSize?: string; lineDensity?: string; sections?: string[];
    }
  ): Promise<string> => {
    const token = getToken();
    const res = await fetch(
      `${getApiBase()}/api/applications/${appId}/documents/${docId}/reformat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(config),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  },
  deleteDocument: (appId: number | string, docId: number) =>
    request(`/api/applications/${appId}/documents/${docId}`, { method: 'DELETE' }),

  generateBundle: (id: number | string, body: {
    force?: boolean; language?: string; sections?: string[]; userHints?: string;
    hintChips?: string[]; intensity?: string; templateId?: string; colorScheme?: string;
    accentColor?: string; fontFamily?: string; fontSize?: string; lineDensity?: string;
    tone?: string; clLength?: string; clFormat?: string; generateCl?: boolean;
  }) =>
    request(`/api/applications/${id}/generate-bundle`, { method: 'POST', body: JSON.stringify(body) }),

  // Events
  getEvents: (appId: number | string) =>
    request(`/api/applications/${appId}/events`),
  addEvent: (appId: number | string, body: { event_type?: string; description: string; event_date?: string }) =>
    request(`/api/applications/${appId}/events`, { method: 'POST', body: JSON.stringify(body) }),

  // Contacts
  getContacts: (appId: number | string) =>
    request(`/api/applications/${appId}/contacts`),
  addContact: (appId: number | string, data: { name: string; title?: string; email?: string; linkedin_url?: string; role?: string; notes?: string }) =>
    request(`/api/applications/${appId}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (appId: number | string, cid: number, data: Record<string, unknown>) =>
    request(`/api/applications/${appId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContact: (appId: number | string, cid: number) =>
    request(`/api/applications/${appId}/contacts/${cid}`, { method: 'DELETE' }),

  // Reminders
  getReminders: (appId: number | string) =>
    request(`/api/applications/${appId}/reminders`),
  addReminder: (appId: number | string, data: { title: string; remind_at: string; reminder_type?: string }) =>
    request(`/api/applications/${appId}/reminders`, { method: 'POST', body: JSON.stringify(data) }),
  patchReminder: (appId: number | string, rid: number, data: { is_done?: boolean; title?: string; remind_at?: string }) =>
    request(`/api/applications/${appId}/reminders/${rid}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteReminder: (appId: number | string, rid: number) =>
    request(`/api/applications/${appId}/reminders/${rid}`, { method: 'DELETE' }),
  getDueReminders: () =>
    request('/api/applications/reminders/due'),

  // Submitted doc + interview prep
  setSubmittedDoc: (appId: number | string, docId: number | null) =>
    request(`/api/applications/${appId}/submitted-doc`, { method: 'PATCH', body: JSON.stringify({ doc_id: docId }) }),
  updateInterviewPrep: (appId: number | string, prep: Record<string, unknown>) =>
    request(`/api/applications/${appId}/interview-prep`, { method: 'PATCH', body: JSON.stringify({ interview_prep: prep }) }),

  // Analytics
  getApplicationAnalytics: () =>
    request('/api/applications/analytics/funnel'),

  previewDocument: async (appId: number | string, docId: number): Promise<string> => {
    const token = getToken();
    const res = await fetch(
      `${getApiBase()}/api/applications/${appId}/documents/${docId}/preview`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  },

  refineDocument: (appId: number | string, docId: number, refinementHints: string, discardEdits = false) =>
    request(`/api/applications/${appId}/documents/${docId}/refine`, {
      method: 'POST',
      body: JSON.stringify({ refinementHints, discardEdits }),
    }),

  saveDocumentEdit: (appId: number | string, docId: number, html: string) =>
    request(`/api/applications/${appId}/documents/${docId}/content`, {
      method: 'PATCH',
      body: JSON.stringify({ html }),
    }),

  autosaveDocumentEdit: (appId: number | string, docId: number, html: string) =>
    request(`/api/applications/${appId}/documents/${docId}/autosave`, {
      method: 'PATCH',
      body: JSON.stringify({ html }),
    }),

  shrinkText: (appId: number | string, docId: number, blocks: string[], intensity: 'light' | 'aggressive' = 'light'): Promise<{ blocks: string[] }> =>
    request(`/api/applications/${appId}/documents/${docId}/shrink-text`, {
      method: 'POST',
      body: JSON.stringify({ blocks, intensity }),
    }),

  getAiOriginalDocument: async (appId: number | string, docId: number): Promise<string> => {
    const token = getToken();
    const res = await fetch(
      `${getApiBase()}/api/applications/${appId}/documents/${docId}/ai-original`,
      { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  },

  downloadCvDocument: async (appId: number | string, docId: number, filename: string): Promise<void> => {
    const token = getToken();
    const res = await fetch(
      `${getApiBase()}/api/applications/${appId}/documents/${docId}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  getCvLibrary: (type?: string) => {
    const qs = type ? `?type=${encodeURIComponent(type)}` : '';
    return request(`/api/applications/cv-library${qs}`);
  },

  // Email tracking
  getEmailResponses: (filters: Record<string, string | number | boolean | undefined> = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    return request(`/api/applications/email-responses?${params.toString()}`);
  },
  getAppEmailResponses: (applicationId: number | string) =>
    request(`/api/applications/email-responses?application_id=${applicationId}&limit=20`),
  getEmailSyncStatus: () => request('/api/applications/email-sync-status'),
  linkEmailResponse: (id: number, application_id: number) =>
    request(`/api/applications/email-responses/${id}/link`, {
      method: 'PATCH',
      body: JSON.stringify({ application_id }),
    }),
  reclassifyEmailResponse: (id: number, classification: string) =>
    request(`/api/applications/email-responses/${id}/reclassify`, {
      method: 'PATCH',
      body: JSON.stringify({ classification }),
    }),
  submitEmailFeedback: (id: number, correct: boolean) =>
    request(`/api/applications/email-responses/${id}/feedback`, {
      method: 'PATCH',
      body: JSON.stringify({ correct }),
    }),
  getJob: (id: string) => request(`/api/jobs/${id}`),

  // Manual job import
  parseJob: (rawText: string, sourceUrl?: string) =>
    request('/api/jobs/parse', { method: 'POST', body: JSON.stringify({ rawText, sourceUrl }) }),

  importJob: (body: {
    job: Record<string, unknown>;
    sourcePlatform?: string;
    sourceUrl?: string;
    entryMethod?: string;
    createApplication?: boolean;
    referralFrom?: string;
  }) => request('/api/jobs/import', { method: 'POST', body: JSON.stringify(body) }),

  // Referee invitations
  getInvitations: () => request('/api/referee-invitations'),
  createInvitation: (data: { note: string; days: number; referee_email?: string }) =>
    request('/api/referee-invitations', { method: 'POST', body: JSON.stringify(data) }),
  createModifyLink: (refereeId: string, data: { note?: string; days: number; referee_email?: string }) =>
    request(`/api/referee-invitations/for-referee/${refereeId}`, { method: 'POST', body: JSON.stringify(data) }),
  revokeInvitation: (id: string) =>
    request(`/api/referee-invitations/${id}`, { method: 'DELETE' }),
  toggleRefereeVisibility: (id: string, visible: boolean) =>
    upload(`/api/referees/${id}`, (() => { const fd = new FormData(); fd.append('visible', String(visible)); return fd; })(), 'PUT'),

  // Education
  getEducation: () => request('/api/education'),
  createEducation: (fd: FormData) => upload('/api/education', fd),
  updateEducation: (id: string, fd: FormData) => upload(`/api/education/${id}`, fd, 'PUT'),
  deleteEducation: (id: string) => request(`/api/education/${id}`, { method: 'DELETE' }),

  // Referees
  getReferees: () => request('/api/referees/all'),
  createReferee: (fd: FormData) => upload('/api/referees', fd),
  updateReferee: (id: string, fd: FormData) => upload(`/api/referees/${id}`, fd, 'PUT'),
  deleteReferee: (id: string) => request(`/api/referees/${id}`, { method: 'DELETE' }),
  saveStarConfig: (id: string, config: Record<string, unknown>) =>
    request(`/api/referees/${id}/star-config`, { method: 'PUT', body: JSON.stringify(config) }),

  // Social links
  getSocialLinks: () => request('/api/social-links/all'),
  createSocialLink: (data: Record<string, unknown>) =>
    request('/api/social-links', { method: 'POST', body: JSON.stringify(data) }),
  updateSocialLink: (id: string, data: Record<string, unknown>) =>
    request(`/api/social-links/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSocialLink: (id: string) =>
    request(`/api/social-links/${id}`, { method: 'DELETE' }),

  // Messages
  getMessages: () => request('/api/contact'),
  markRead: (id: string) => request(`/api/contact/${id}/read`, { method: 'PATCH' }),
  deleteMessage: (id: string) => request(`/api/contact/${id}`, { method: 'DELETE' }),

  // Referee contact requests
  getContactRequests: () => request('/api/referee-contact-requests'),
  approveContactRequest: (id: string) =>
    request(`/api/referee-contact-requests/${id}/approve`, { method: 'POST' }),
  rejectContactRequest: (id: string) =>
    request(`/api/referee-contact-requests/${id}/reject`, { method: 'POST' }),
  requestConsent: (id: string, data: { admin_note?: string; expires_days?: number }) =>
    request(`/api/referee-contact-requests/${id}/request-consent`, { method: 'POST', body: JSON.stringify(data) }),
  resendConsent: (id: string, data: { resend_note: string; expires_days?: number }) =>
    request(`/api/referee-contact-requests/${id}/resend-consent`, { method: 'POST', body: JSON.stringify(data) }),
  fulfillContactRequest: (id: string, data: { admin_note?: string }) =>
    request(`/api/referee-contact-requests/${id}/fulfill`, { method: 'POST', body: JSON.stringify(data) }),
  declineContactRequest: (id: string) =>
    request(`/api/referee-contact-requests/${id}/decline`, { method: 'POST' }),
  deleteContactRequest: (id: string) =>
    request(`/api/referee-contact-requests/${id}`, { method: 'DELETE' }),

  // ── User Settings & Automation ──────────────────────────────
  getUserSettings: () => request('/api/user-settings'),
  updateUserSettings: (data: Record<string, unknown>) =>
    request('/api/user-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  getAutomationRules: () => request('/api/user-settings/automation-rules'),
  toggleAutomationRule: (key: string, is_enabled: boolean) =>
    request(`/api/user-settings/automation-rules/${key}`, { method: 'PATCH', body: JSON.stringify({ is_enabled }) }),
  runAutomation: () => request('/api/dashboard/run-automation', { method: 'POST' }),

  // ── Dashboard ────────────────────────────────────────────────
  getDashboardStats: () => request('/api/dashboard/stats'),

  // ── CV Identity ──────────────────────────────────────────────
  getCvIdentity: () => request('/api/cv-identity'),
  updateCvIdentity: (data: Record<string, unknown>) =>
    request('/api/cv-identity', { method: 'PATCH', body: JSON.stringify(data) }),
  buildContactFields: () => request('/api/cv-identity/build-contact-fields', { method: 'POST' }),

  // ── Portfolio Items ──────────────────────────────────────────
  getPortfolioItems: () => request('/api/portfolio-items'),
  createPortfolioItem: (data: Record<string, unknown>) =>
    request('/api/portfolio-items', { method: 'POST', body: JSON.stringify(data) }),
  updatePortfolioItem: (id: number, data: Record<string, unknown>) =>
    request(`/api/portfolio-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePortfolioItem: (id: number) =>
    request(`/api/portfolio-items/${id}`, { method: 'DELETE' }),
  getAppPortfolio: (appId: number) => request(`/api/portfolio-items/application/${appId}`),
  linkPortfolioItem: (appId: number, portfolioItemId: number, note?: string) =>
    request(`/api/portfolio-items/application/${appId}`, { method: 'POST', body: JSON.stringify({ portfolio_item_id: portfolioItemId, note }) }),
  unlinkPortfolioItem: (appId: number, linkId: number) =>
    request(`/api/portfolio-items/application/${appId}/${linkId}`, { method: 'DELETE' }),

  // ── Company Research ─────────────────────────────────────────
  getCompanyResearch: (appId: number) => request(`/api/company-research/${appId}`),
  saveCompanyResearch: (appId: number, data: Record<string, unknown>) =>
    request(`/api/company-research/${appId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAppReferences: (appId: number) => request(`/api/company-research/${appId}/references`),
  addAppReference: (appId: number, data: Record<string, unknown>) =>
    request(`/api/company-research/${appId}/references`, { method: 'POST', body: JSON.stringify(data) }),
  updateAppReference: (appId: number, id: number, data: Record<string, unknown>) =>
    request(`/api/company-research/${appId}/references/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppReference: (appId: number, id: number) =>
    request(`/api/company-research/${appId}/references/${id}`, { method: 'DELETE' }),

  // ── STAR Stories ─────────────────────────────────────────────
  getStarStories: () => request('/api/star-stories'),
  getStarStoriesForApp: (appId: number) => request(`/api/star-stories/for-application/${appId}`),
  createStarStory: (data: Record<string, unknown>) =>
    request('/api/star-stories', { method: 'POST', body: JSON.stringify(data) }),
  updateStarStory: (id: number, data: Record<string, unknown>) =>
    request(`/api/star-stories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStarStory: (id: number) =>
    request(`/api/star-stories/${id}`, { method: 'DELETE' }),

  // ── Interview Prep ───────────────────────────────────────────
  getInterviewQuestions: (appId: number) => request(`/api/interview-prep/${appId}/questions`),
  generateInterviewQuestions: (appId: number) =>
    request(`/api/interview-prep/${appId}/generate`, { method: 'POST' }),
  updateInterviewQuestion: (appId: number, qId: number, data: Record<string, unknown>) =>
    request(`/api/interview-prep/${appId}/questions/${qId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInterviewQuestion: (appId: number, qId: number) =>
    request(`/api/interview-prep/${appId}/questions/${qId}`, { method: 'DELETE' }),
  saveInterviewDebrief: (appId: number, data: Record<string, unknown>) =>
    request(`/api/interview-prep/${appId}/debrief`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Email Templates ──────────────────────────────────────────
  getEmailTemplates: (category?: string) =>
    request(category ? `/api/email-templates?category=${category}` : '/api/email-templates'),
  getEmailTemplate: (id: number) => request(`/api/email-templates/${id}`),
  createEmailTemplate: (data: Record<string, unknown>) =>
    request('/api/email-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateEmailTemplate: (id: number, data: Record<string, unknown>) =>
    request(`/api/email-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmailTemplate: (id: number) =>
    request(`/api/email-templates/${id}`, { method: 'DELETE' }),
  duplicateEmailTemplate: (id: number) =>
    request(`/api/email-templates/${id}/duplicate`, { method: 'POST' }),
  generateEmailDraft: (templateId: number, applicationId: number) =>
    request(`/api/email-templates/${templateId}/draft?application=${applicationId}`, { method: 'POST' }),

  // ── Application Communications ───────────────────────────────
  getAppCommunications: (appId: number) => request(`/api/email-templates/communications/${appId}`),
  addAppCommunication: (appId: number, data: Record<string, unknown>) =>
    request(`/api/email-templates/communications/${appId}`, { method: 'POST', body: JSON.stringify(data) }),
  getLinkedInOutreach: (appId: number) => request(`/api/email-templates/linkedin/${appId}`),
  addLinkedInOutreach: (appId: number, data: Record<string, unknown>) =>
    request(`/api/email-templates/linkedin/${appId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateLinkedInOutreach: (appId: number, id: number, data: Record<string, unknown>) =>
    request(`/api/email-templates/linkedin/${appId}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLinkedInOutreach: (appId: number, id: number) =>
    request(`/api/email-templates/linkedin/${appId}/${id}`, { method: 'DELETE' }),

  // Binary asset URLs — RELATIVE paths, proxied through Next.js (same-origin).
  avatarUrl:       '/api/profile/avatar',
  projectImg:      (id: string) => `/api/projects/${id}/image`,
  projectSlideImg: (projectId: string, imgId: string) => `/api/projects/${projectId}/images/${imgId}/file`,
  skillIcon:       (id: string) => `/api/skills/${id}/icon`,
  expLogo:         (id: string) => `/api/experiences/${id}/logo`,
  certImg:         (id: string) => `/api/certifications/${id}/image`,
  educationLogo:   (id: string) => `/api/education/${id}/logo`,
  refereePhoto:    (id: string) => `/api/referees/${id}/photo`,
  refereeOrgLogo:  (id: string) => `/api/referees/${id}/org-logo`,
};
