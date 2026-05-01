/**
 * Jobs Feed Page
 * Main page for browsing and filtering jobs
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getJobs, Job } from '@/lib/jobsApi';
import JobCard from '@/components/JobCard';
import JobFilters from '@/components/JobFilters';

export default function JobsFeedPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);

  const [filters, setFilters] = useState({
    location: '',
    company: '',
    tech: [] as string[],
    minScore: 0,
    search: '',
    sortBy: 'posted_at' as const,
    order: 'DESC' as const,
  });

  const limit = 20;

  useEffect(() => {
    loadJobs();
  }, [page, filters]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const response = await getJobs(page, limit, filters);
      setJobs(response.data);
      setTotalPages(response.pagination.pages);
      setTotalJobs(response.pagination.total);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      // Show error toast
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Job Feed</h1>
          <p className="text-lg text-gray-600">
            Discover {totalJobs.toLocaleString()} curated job opportunities
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Filters */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <JobFilters filters={filters} onFilterChange={handleFilterChange} />
            </div>
          </div>

          {/* Jobs List */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your filters</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-8">
                  {jobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                    >
                      ← Previous
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={clsx(
                              'px-3 py-2 rounded-lg font-medium',
                              page === pageNum
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                    >
                      Next →
                    </button>
                  </div>
                )}

                {/* Results Info */}
                <p className="text-center text-sm text-gray-600 mt-4">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalJobs)} of {totalJobs} jobs
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Utility function
function clsx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
