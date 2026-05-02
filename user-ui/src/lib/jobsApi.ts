/**
 * Job Aggregation API Client
 * Thin SDK for the portfolio jobs API endpoints.
 *
 * API_BASE is always read from the NEXT_PUBLIC_API_URL env var.
 * No localhost fallback — that was the cause of the CI check failure.
 * In dev, set 
 */

function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error('NEXT_PUBLIC_API_URL is not set');
  // Strip trailing slash so callers can use /jobs without //
  return url.replace(/\/$/, '');
}

// ── Types ─────────────────────────────────────────────────────

export interface Job {
  id: string;
  external_id: string;
  company_name: string;
  title: string;
  location: string;
  job_type?: string;
  description?: string;
  requirements?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  posted_at: string;
  apply_url: string;
  source_api: string;
  relevance_score: number;
  ai_decision: 'KEEP' | 'REVIEW' | 'DROP';
  ai_reasoning?: string;
  tech_stack: string[];
  seniority_level?: string;
  visa_sponsored?: boolean | null;
  is_active: boolean;
  notified_at?: string | null;
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

export interface JobStats {
  keep: string;
  review: string;
  drop: string;
  last_24h: string;
  avg_score: string;
}

export interface GetJobsFilter {
  location?: string;
  company?: string;
  tech?: string | string[];
  minScore?: number;
  search?: string;
  sortBy?: 'posted_at' | 'relevance_score' | 'title' | 'company_name';
  order?: 'ASC' | 'DESC';
}

// ── Public endpoints (no auth required) ──────────────────────

/**
 * Paginated job list with optional filters.
 */
export async function getJobs(
  page = 1,
  limit = 20,
  filters?: GetJobsFilter
): Promise<JobsResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.location) params.set('location', filters.location);
  if (filters?.company)  params.set('company',  filters.company);
  if (filters?.tech) {
    params.set('tech', Array.isArray(filters.tech) ? filters.tech.join(',') : filters.tech);
  }
  if (filters?.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters?.search)  params.set('search',  filters.search);
  if (filters?.sortBy)  params.set('sortBy',  filters.sortBy);
  if (filters?.order)   params.set('order',   filters.order);

  const res = await fetch(`${apiBase()}/api/jobs?${params}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 },  // ISR: re-fetch every 60s on Next.js edge/server
  });
  if (!res.ok) throw new Error(`getJobs: ${res.status}`);
  return res.json();
}

/**
 * Top KEEP jobs from the last 48 hours.
 */
export async function getTopJobs(limit = 10): Promise<Job[]> {
  const res = await fetch(`${apiBase()}/api/jobs/top?limit=${limit}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`getTopJobs: ${res.status}`);
  return res.json();
}

/**
 * Most recently posted jobs regardless of AI decision.
 */
export async function getLatestJobs(limit = 10): Promise<Job[]> {
  const res = await fetch(`${apiBase()}/api/jobs/latest?limit=${limit}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`getLatestJobs: ${res.status}`);
  return res.json();
}

/**
 * Summary counts (keep / review / drop / last_24h / avg_score).
 */
export async function getJobStats(): Promise<JobStats> {
  const res = await fetch(`${apiBase()}/api/jobs/stats`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`getJobStats: ${res.status}`);
  return res.json();
}

/**
 * Single job by ID.
 */
export async function getJobById(id: string): Promise<Job> {
  const res = await fetch(`${apiBase()}/api/jobs/${id}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`getJobById: ${res.status}`);
  return res.json();
}
