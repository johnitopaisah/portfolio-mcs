'use client';
/**
 * Jobs Feed Page — user-ui
 * Public browsing of AI-scored job listings.
 * useCallback wraps loadJobs so the useEffect dep array is stable.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getJobs, Job } from '@/lib/jobsApi';
import JobCard from '@/components/JobCard';
import JobFilters from '@/components/JobFilters';
import clsx from 'clsx';

const LIMIT = 20;

type SortBy = 'posted_at' | 'relevance_score' | 'title' | 'company_name';
type Order  = 'ASC' | 'DESC';

interface Filters {
  location: string;
  company:  string;
  tech:     string[];
  minScore: number;
  search:   string;
  sortBy:   SortBy;
  order:    Order;
}

const DEFAULT_FILTERS: Filters = {
  location: '', company: '', tech: [], minScore: 60,
  search: '', sortBy: 'relevance_score', order: 'DESC',
};

export default function JobsFeedPage() {
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs,  setTotalJobs]  = useState(0);
  const [filters,    setFilters]    = useState<Filters>(DEFAULT_FILTERS);

  // Stable reference so useEffect dep array doesn't change on every render
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getJobs(page, LIMIT, filters);
      setJobs(response.data);
      setTotalPages(response.pagination.pages);
      setTotalJobs(response.pagination.total);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="min-h-screen py-12" style={{ background: 'var(--bg-page,#09090b)', color: 'var(--text-1,#f4f4f5)' }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Job Feed</h1>
          <p className="text-lg" style={{ color: 'var(--text-2)' }}>
            {totalJobs.toLocaleString()} curated opportunities · scored by Claude AI
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <JobFilters filters={filters} onFilterChange={handleFilterChange} />
            </div>
          </div>

          {/* Job list */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
                <p className="text-lg font-medium mb-2">No jobs found</p>
                <p className="text-sm">Try lowering the minimum score or adjusting your filters.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-8">
                  {jobs.map(job => <JobCard key={job.id} job={job} />)}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mb-4">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 disabled:opacity-40 hover:bg-zinc-700 transition-colors">
                      ← Prev
                    </button>

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = totalPages <= 5 ? i + 1
                        : page <= 3 ? i + 1
                        : page >= totalPages - 2 ? totalPages - 4 + i
                        : page - 2 + i;
                      return (
                        <button key={p} onClick={() => setPage(p)}
                          className={clsx(
                            'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            page === p ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          )}>
                          {p}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 disabled:opacity-40 hover:bg-zinc-700 transition-colors">
                      Next →
                    </button>
                  </div>
                )}

                <p className="text-center text-xs" style={{ color: 'var(--text-4)' }}>
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, totalJobs)} of {totalJobs}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
