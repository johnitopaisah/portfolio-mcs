'use client';
/**
 * JobCard Component
 * Displays a single job listing.
 * Save/unsave removed — single-user portfolio, no auth on user-ui.
 */

import React from 'react';
import { Job } from '@/lib/jobsApi';
import clsx from 'clsx';

interface JobCardProps {
  job: Job;
}

function getRelevanceColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800';
  if (score >= 60) return 'bg-blue-100 text-blue-800';
  if (score >= 40) return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

function getSeniorityColor(level?: string): string {
  switch (level?.toLowerCase()) {
    case 'senior': case 'lead': return 'bg-purple-100 text-purple-800';
    case 'mid':                  return 'bg-blue-100 text-blue-800';
    case 'junior':               return 'bg-green-100 text-green-800';
    default:                     return 'bg-gray-100 text-gray-800';
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return date.toLocaleDateString();
}

export default function JobCard({ job }: JobCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{job.title}</h3>
        <p className="text-sm text-gray-600">{job.company_name}</p>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-3 mb-4 text-sm text-gray-600">
        <span>📍 {job.location}</span>
        {job.job_type && <span>💼 {job.job_type}</span>}
        <span>🕐 {formatDate(job.posted_at)}</span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', getRelevanceColor(job.relevance_score))}>
          Score {job.relevance_score}/100
        </span>
        {job.seniority_level && (
          <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', getSeniorityColor(job.seniority_level))}>
            {job.seniority_level}
          </span>
        )}
        {job.visa_sponsored === true && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            🛂 Visa Sponsored
          </span>
        )}
      </div>

      {/* Tech stack */}
      {job.tech_stack.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.tech_stack.slice(0, 8).map(tech => (
            <span key={tech} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded font-mono">
              {tech}
            </span>
          ))}
          {job.tech_stack.length > 8 && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
              +{job.tech_stack.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* Salary */}
      {(job.salary_min || job.salary_max) && (
        <p className="text-sm text-gray-700 mb-4">
          <span className="font-semibold">Salary: </span>
          {job.salary_min ? job.salary_min.toLocaleString() : ''}
          {job.salary_min && job.salary_max ? ' – ' : ''}
          {job.salary_max ? job.salary_max.toLocaleString() : ''}
          {job.salary_currency ? ` ${job.salary_currency}` : ''}
        </p>
      )}

      {/* Description preview */}
      {job.description && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
          {job.description.substring(0, 220)}
        </p>
      )}

      {/* AI reasoning */}
      {job.ai_reasoning && (
        <p className="text-xs text-gray-400 italic mb-4">
          AI: {job.ai_reasoning}
        </p>
      )}

      {/* Apply */}
      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        View &amp; Apply →
      </a>
    </div>
  );
}
