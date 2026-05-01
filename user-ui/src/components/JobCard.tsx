/**
 * JobCard Component
 * Displays a job with all relevant information
 */

'use client';

import React, { useState } from 'react';
import { Job, saveJob, unsaveJob } from '@/lib/jobsApi';
import clsx from 'clsx';

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  token?: string;
  onSaveToggle?: (jobId: string, isSaved: boolean) => void;
}

export default function JobCard({ job, isSaved = false, token, onSaveToggle }: JobCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(isSaved);

  const handleSaveClick = async () => {
    if (!token) {
      alert('Please log in to save jobs');
      return;
    }

    setIsLoading(true);
    try {
      if (saved) {
        await unsaveJob(token, job.id);
        setSaved(false);
        onSaveToggle?.(job.id, false);
      } else {
        await saveJob(token, job.id);
        setSaved(true);
        onSaveToggle?.(job.id, true);
      }
    } catch (error) {
      console.error('Failed to toggle save:', error);
      alert('Failed to save job');
    } finally {
      setIsLoading(false);
    }
  };

  const getRelevanceColor = (score: number): string => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-blue-100 text-blue-800';
    if (score >= 40) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getSeniorityColor = (level?: string): string => {
    switch (level?.toLowerCase()) {
      case 'senior':
      case 'lead':
        return 'bg-purple-100 text-purple-800';
      case 'mid':
        return 'bg-blue-100 text-blue-800';
      case 'junior':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{job.title}</h3>
          <p className="text-sm text-gray-600">{job.company_name}</p>
        </div>
        <button
          onClick={handleSaveClick}
          disabled={isLoading}
          className={clsx(
            'ml-4 p-2 rounded-full transition-colors',
            saved
              ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
          title={saved ? 'Unsave job' : 'Save job'}
        >
          <svg
            className="w-5 h-5"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z"
            />
          </svg>
        </button>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Location */}
        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
          </svg>
          {job.location}
        </span>

        {/* Job Type */}
        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {job.job_type}
        </span>

        {/* Posted Date */}
        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(job.posted_at)}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Relevance Score */}
        <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', getRelevanceColor(job.relevance_score))}>
          Relevance {job.relevance_score}%
        </span>

        {/* Seniority */}
        {job.seniority_level && (
          <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', getSeniorityColor(job.seniority_level))}>
            {job.seniority_level}
          </span>
        )}

        {/* Visa Sponsorship */}
        {job.visa_sponsored === true && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ Visa Sponsored
          </span>
        )}

        {job.visa_sponsored === false && (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            No Visa
          </span>
        )}
      </div>

      {/* Tech Stack */}
      {job.tech_stack && job.tech_stack.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-2">
            {job.tech_stack.slice(0, 6).map((tech) => (
              <span key={tech} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                {tech}
              </span>
            ))}
            {job.tech_stack.length > 6 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                +{job.tech_stack.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Salary Range */}
      {(job.salary_min || job.salary_max) && (
        <div className="mb-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Salary: </span>
            {job.salary_min && `${job.salary_min.toLocaleString()}`}
            {job.salary_min && job.salary_max && ' - '}
            {job.salary_max && `${job.salary_max.toLocaleString()}`}
            {job.salary_currency && ` ${job.salary_currency}`}
          </p>
        </div>
      )}

      {/* Description Preview */}
      <div className="mb-4 line-clamp-2 text-sm text-gray-700">
        {job.description.substring(0, 200)}...
      </div>

      {/* Apply Button */}
      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        View & Apply →
      </a>
    </div>
  );
}
