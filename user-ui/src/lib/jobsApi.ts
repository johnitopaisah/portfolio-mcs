/**
 * Job Aggregation API Client
 * Frontend SDK for consuming job API endpoints
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface Job {
  id: string;
  external_id: string;
  company_name: string;
  title: string;
  location: string;
  job_type: string;
  description: string;
  requirements?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  posted_at: string;
  apply_url: string;
  source_api: string;
  relevance_score: number;
  ai_decision: string;
  tech_stack: string[];
  seniority_level?: string;
  visa_sponsored?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobsResponse {
  data: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface UserPreferences {
  id: string;
  user_id: string;
  desired_roles: string[];
  desired_locations: string[];
  min_salary?: number;
  required_tech_stack: string[];
  avoid_tech_stack: string[];
  preferred_seniority?: string[];
  visa_requirement?: string;
  min_relevance_score: number;
  alert_email?: string;
  telegram_chat_id?: string;
  slack_webhook_url?: string;
}

/**
 * Get paginated list of jobs with filters
 */
export async function getJobs(
  page: number = 1,
  limit: number = 20,
  filters?: {
    location?: string;
    company?: string;
    tech?: string | string[];
    minScore?: number;
    search?: string;
    sortBy?: 'posted_at' | 'relevance_score' | 'title' | 'company_name';
    order?: 'ASC' | 'DESC';
  }
): Promise<JobsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(filters?.location && { location: filters.location }),
    ...(filters?.company && { company: filters.company }),
    ...(filters?.tech && { tech: Array.isArray(filters.tech) ? filters.tech.join(',') : filters.tech }),
    ...(filters?.minScore && { minScore: String(filters.minScore) }),
    ...(filters?.search && { search: filters.search }),
    ...(filters?.sortBy && { sortBy: filters.sortBy }),
    ...(filters?.order && { order: filters.order }),
  });

  const response = await fetch(`${API_BASE}/jobs?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) throw new Error('Failed to fetch jobs');
  return response.json();
}

/**
 * Get latest jobs
 */
export async function getLatestJobs(limit: number = 10): Promise<Job[]> {
  const response = await fetch(`${API_BASE}/jobs/latest?limit=${limit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) throw new Error('Failed to fetch latest jobs');
  return response.json();
}

/**
 * Get single job by ID
 */
export async function getJobById(id: string): Promise<Job> {
  const response = await fetch(`${API_BASE}/jobs/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) throw new Error('Failed to fetch job');
  return response.json();
}

/**
 * Get personalized recommendations (requires auth token)
 */
export async function getRecommendations(token: string, limit: number = 10): Promise<Job[]> {
  const response = await fetch(`${API_BASE}/jobs/recommendations?limit=${limit}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error('Failed to fetch recommendations');
  return response.json();
}

/**
 * Get user preferences
 */
export async function getUserPreferences(token: string): Promise<UserPreferences | null> {
  const response = await fetch(`${API_BASE}/jobs/user-preferences`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to fetch preferences');
  return response.json();
}

/**
 * Save user preferences
 */
export async function saveUserPreferences(token: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE}/jobs/user-preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(prefs),
  });

  if (!response.ok) throw new Error('Failed to save preferences');
  return response.json();
}

/**
 * Save a job
 */
export async function saveJob(token: string, jobId: string, notes?: string): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ notes }),
  });

  if (!response.ok) throw new Error('Failed to save job');
  return response.json();
}

/**
 * Unsave a job
 */
export async function unsaveJob(token: string, jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}/save`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error('Failed to unsave job');
}

/**
 * Get saved jobs
 */
export async function getSavedJobs(token: string): Promise<Job[]> {
  const response = await fetch(`${API_BASE}/jobs/saved`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error('Failed to fetch saved jobs');
  return response.json();
}
