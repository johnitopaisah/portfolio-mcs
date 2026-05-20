'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────
interface Application {
  id: number;
  company_name: string;
  job_title: string;
  match_score: string | number | null;
  status: string;
  applied_at: string | null;
  last_response_at: string | null;
  source_platform: string | null;
}

// ── Constants ────────────────────────────────────────────────
const VALID_STATUSES = [
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'REJECTED', 'NO_RESPONSE', 'ARCHIVED',
];

const PLATFORMS = [
  { value: 'adzuna',    label: 'Adzuna' },
  { value: 'joobleApi', label: 'Jooble' },
  { value: 'remoteOk',  label: 'RemoteOK' },
  { value: 'arbeitnow', label: 'Arbeitnow' },
  { value: 'remotive',  label: 'Remotive' },
  { value: 'apec',      label: 'APEC' },
  { value: 'wttj',      label: 'Welcome to the Jungle' },
];

// ── Helpers ──────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function scoreBadgeClass(score: string | number | null): string {
  const s = score !== null ? parseFloat(String(score)) : 0;
  if (s >= 80) return 'bg-green-100 text-green-700';
  if (s >= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'DRAFT':                return 'bg-gray-100 text-gray-600';
    case 'CV_GENERATED':         return 'bg-blue-100 text-blue-700';
    case 'READY_TO_APPLY':       return 'bg-indigo-100 text-indigo-700';
    case 'APPLIED':              return 'bg-purple-100 text-purple-700';
    case 'EMAIL_RECEIVED':
    case 'HR_CONTACTED':         return 'bg-yellow-100 text-yellow-700';
    case 'INTERVIEW_INVITE':
    case 'INTERVIEW_SCHEDULED':
    case 'FINAL_INTERVIEW':
    case 'TECHNICAL_TEST':       return 'bg-orange-100 text-orange-700';
    case 'OFFER':                return 'bg-green-100 text-green-700';
    case 'REJECTED':
    case 'NO_RESPONSE':          return 'bg-red-100 text-red-600';
    case 'ARCHIVED':             return 'bg-gray-200 text-gray-400';
    default:                     return 'bg-gray-100 text-gray-600';
  }
}

// ── Skeleton row ─────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800">
      {[40, 48, 16, 24, 24, 24, 20].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-4 rounded bg-gray-800 animate-pulse w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function ApplicationsPage() {
  const [applications,  setApplications]  = useState<Application[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [platformFilter,setPlatformFilter] = useState('');
  const [needsAction,   setNeedsAction]   = useState(false);
  const [archiving,     setArchiving]     = useState<number | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter)   params.status       = statusFilter;
      if (platformFilter) params.platform     = platformFilter;
      if (needsAction)    params.needs_action = 'true';
      const data = await adminApi.getApplications(params);
      setApplications(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter, needsAction]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  async function handleArchive(id: number, company: string) {
    if (!window.confirm(`Archive application for ${company}?`)) return;
    setArchiving(id);
    try {
      await adminApi.archiveApplication(id);
      setApplications(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to archive application');
    } finally {
      setArchiving(null);
    }
  }

  const selectClass =
    'text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500';

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Applications</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track and manage your job applications</p>
        </div>
        <button
          onClick={fetchApplications}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg
            bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {VALID_STATUSES.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {/* Platform */}
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All platforms</option>
          {PLATFORMS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        {/* Needs action toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={needsAction}
            onChange={e => setNeedsAction(e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-500"
          />
          <span className="text-xs text-gray-400">Needs action</span>
        </label>

        {/* Clear filters */}
        {(statusFilter || platformFilter || needsAction) && (
          <button
            onClick={() => { setStatusFilter(''); setPlatformFilter(''); setNeedsAction(false); }}
            className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300
              bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 transition-colors"
          >
            Clear filters
          </button>
        )}

        {!loading && !error && (
          <span className="text-xs text-gray-600 ml-auto">
            {applications.length} application{applications.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Title</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applied</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Response</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : applications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-gray-500 text-sm">
                  No applications found.
                </td>
              </tr>
            ) : (
              applications.map(app => (
                <tr
                  key={app.id}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                >
                  {/* Company */}
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                    {app.company_name}
                  </td>

                  {/* Job title — truncated at 50 chars */}
                  <td className="px-4 py-3 text-gray-300 max-w-xs">
                    <span title={app.job_title}>
                      {app.job_title.length > 50
                        ? app.job_title.slice(0, 50) + '…'
                        : app.job_title}
                    </span>
                  </td>

                  {/* Match score badge */}
                  <td className="px-4 py-3">
                    {app.match_score !== null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${scoreBadgeClass(app.match_score)}`}>
                        {Math.round(parseFloat(String(app.match_score)))}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(app.status)}`}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Applied date */}
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                    {formatDate(app.applied_at)}
                  </td>

                  {/* Last response */}
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                    {formatDate(app.last_response_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500
                          text-white font-medium transition-colors"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleArchive(app.id, app.company_name)}
                        disabled={archiving === app.id}
                        className="px-3 py-1 text-xs rounded-lg bg-gray-800 hover:bg-red-900/40
                          text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-800/50
                          disabled:opacity-40 transition-colors"
                      >
                        {archiving === app.id ? '…' : 'Archive'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
