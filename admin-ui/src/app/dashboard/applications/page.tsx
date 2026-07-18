'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import ImportJobDrawer from '@/components/ImportJobDrawer';

// ── Types ────────────────────────────────────────────────────────────────────
interface Application {
  id: number;
  company_name: string;
  job_title: string;
  match_score: string | number | null;
  status: string;
  applied_at: string | null;
  last_response_at: string | null;
  source_platform: string | null;
  entry_method: string | null;
  follow_up_at: string | null;
  submitted_doc_id: number | null;
  created_at: string;
  updated_at: string;
}

// ── Status pipeline ──────────────────────────────────────────────────────────
const STATUS_PIPELINE = [
  { value: 'DRAFT',               label: 'Draft',             group: 'prep' },
  { value: 'CV_GENERATED',        label: 'CV Ready',          group: 'prep' },
  { value: 'READY_TO_APPLY',      label: 'Ready to Apply',    group: 'prep' },
  { value: 'APPLIED',             label: 'Applied',           group: 'active' },
  { value: 'EMAIL_RECEIVED',      label: 'Email Received',    group: 'active' },
  { value: 'HR_CONTACTED',        label: 'HR Contacted',      group: 'active' },
  { value: 'INTERVIEW_INVITE',    label: 'Interview Invite',  group: 'interview' },
  { value: 'INTERVIEW_SCHEDULED', label: 'Interview Scheduled', group: 'interview' },
  { value: 'TECHNICAL_TEST',      label: 'Technical Test',    group: 'interview' },
  { value: 'FINAL_INTERVIEW',     label: 'Final Interview',   group: 'interview' },
  { value: 'OFFER',               label: 'Offer',             group: 'outcome' },
  { value: 'NEGOTIATING',         label: 'Negotiating',       group: 'outcome' },
  { value: 'ACCEPTED',            label: 'Accepted',          group: 'outcome' },
  { value: 'DECLINED_OFFER',      label: 'Declined Offer',    group: 'outcome' },
  { value: 'REJECTED',            label: 'Rejected',          group: 'closed' },
  { value: 'NO_RESPONSE',         label: 'No Response',       group: 'closed' },
  { value: 'WITHDRAWN',           label: 'Withdrawn',         group: 'closed' },
  { value: 'GHOSTED',             label: 'Ghosted',           group: 'closed' },
  { value: 'ARCHIVED',            label: 'Archived',          group: 'closed' },
];

// Kanban: only active columns
const KANBAN_COLUMNS = [
  { value: 'DRAFT',               label: 'Prep',            statuses: ['DRAFT','CV_GENERATED','READY_TO_APPLY'] },
  { value: 'APPLIED',             label: 'Applied',         statuses: ['APPLIED','EMAIL_RECEIVED','HR_CONTACTED'] },
  { value: 'INTERVIEWING',        label: 'Interviewing',    statuses: ['INTERVIEW_INVITE','INTERVIEW_SCHEDULED','TECHNICAL_TEST','FINAL_INTERVIEW'] },
  { value: 'OFFER',               label: 'Offer / Closing', statuses: ['OFFER','NEGOTIATING','ACCEPTED','DECLINED_OFFER'] },
  { value: 'CLOSED',              label: 'Closed',          statuses: ['REJECTED','NO_RESPONSE','WITHDRAWN','GHOSTED','ARCHIVED'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string | null, short = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (short) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function scoreBadgeClass(score: string | number | null) {
  const s = score !== null ? parseFloat(String(score)) : 0;
  if (s >= 80) return 'bg-green-900/40 text-green-400 border border-green-700/40';
  if (s >= 60) return 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40';
  return 'bg-gray-800 text-gray-500 border border-gray-700/50';
}

function statusBadgeClass(status: string) {
  const s = STATUS_PIPELINE.find(x => x.value === status);
  const g = s?.group;
  if (g === 'prep')      return 'bg-gray-700 text-gray-300';
  if (g === 'active')    return 'bg-blue-900/60 text-blue-300';
  if (g === 'interview') return 'bg-orange-900/60 text-orange-300';
  if (g === 'outcome' && ['OFFER','NEGOTIATING'].includes(status)) return 'bg-green-900/60 text-green-300';
  if (g === 'outcome' && status === 'ACCEPTED') return 'bg-emerald-900/60 text-emerald-300';
  if (g === 'outcome' && status === 'DECLINED_OFFER') return 'bg-gray-700 text-gray-400';
  if (g === 'closed' && status === 'REJECTED') return 'bg-red-900/50 text-red-400';
  if (g === 'closed') return 'bg-gray-800 text-gray-500';
  return 'bg-gray-700 text-gray-400';
}

function platformLabel(p: string | null) {
  if (!p) return null;
  const map: Record<string, string> = {
    linkedin: 'LinkedIn', indeed: 'Indeed', glassdoor: 'Glassdoor',
    seek: 'Seek', otta: 'Otta', remoteok: 'RemoteOK',
    company_website: 'Direct', recruiter_email: 'Recruiter',
    referral: 'Referral', adzuna: 'Adzuna', arbeitnow: 'Arbeitnow',
    weworkremotely: 'WWR', wellfound: 'Wellfound',
  };
  return map[p] || p;
}

function HealthBadge({ app }: { app: Application }) {
  const warnings: string[] = [];
  const days = daysSince(app.updated_at);
  if (app.status === 'APPLIED' && !app.submitted_doc_id) warnings.push('No submitted doc tracked');
  if (app.follow_up_at && new Date(app.follow_up_at) < new Date() && app.status === 'APPLIED') warnings.push('Follow-up overdue');
  if (days !== null && days > 14 && ['APPLIED','EMAIL_RECEIVED'].includes(app.status)) warnings.push(`${days}d no activity`);
  if (!warnings.length) return null;
  return (
    <span title={warnings.join(' • ')}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 cursor-help">
      ⚠ {warnings.length}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800">
      {[40, 48, 16, 24, 24, 20].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-4 rounded bg-gray-800 animate-pulse w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({ app }: { app: Application }) {
  const score = app.match_score !== null ? parseFloat(String(app.match_score)) : null;
  return (
    <Link href={`/dashboard/applications/${app.id}`}
      className="block bg-gray-800 border border-gray-700/60 rounded-xl p-3 hover:border-indigo-600/50 hover:bg-gray-750 transition-all cursor-pointer group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors leading-tight">
          {app.company_name}
        </div>
        {score !== null && (
          <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${scoreBadgeClass(score)}`}>
            {Math.round(score)}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed">{app.job_title}</p>
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(app.status)}`}>
          {STATUS_PIPELINE.find(s => s.value === app.status)?.label || app.status}
        </span>
        {app.source_platform && (
          <span className="text-xs text-gray-600">{platformLabel(app.source_platform)}</span>
        )}
      </div>
      <HealthBadge app={app} />
    </Link>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ApplicationsPage() {
  const [applications,  setApplications]  = useState<Application[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [platformFilter,setPlatformFilter] = useState('');
  const [needsAction,   setNeedsAction]   = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [viewMode,      setViewMode]      = useState<'list' | 'kanban'>('list');
  const [showImport,    setShowImport]    = useState(false);
  const [archiving,     setArchiving]     = useState<number | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (statusFilter)   params.status       = statusFilter;
      if (platformFilter) params.platform     = platformFilter;
      if (needsAction)    params.needs_action = 'true';
      if (searchQuery)    params.search       = searchQuery;
      const data = await adminApi.getApplications(params);
      setApplications(data);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter, needsAction, searchQuery]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  async function handleArchive(id: number, company: string) {
    if (!window.confirm(`Archive application for ${company}?`)) return;
    setArchiving(id);
    try {
      await adminApi.archiveApplication(id);
      setApplications(prev => prev.filter(a => a.id !== id));
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to archive');
    } finally {
      setArchiving(null);
    }
  }

  const filterCount = applications.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!platformFilter || a.source_platform === platformFilter)
  );

  const selectCls = 'text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500';

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Applications</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? '…' : `${applications.length} application${applications.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            {(['list', 'kanban'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium capitalize
                  ${viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {v === 'list' ? '≡ List' : '⊟ Kanban'}
              </button>
            ))}
          </div>
          <Link href="/dashboard/applications/analytics"
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors">
            Analytics →
          </Link>
          <button onClick={fetchApplications}
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors">
            ↺
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-900/30">
            <span className="text-base leading-none">+</span> Import Job
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search company or title…"
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-48"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          {STATUS_PIPELINE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className={selectCls}>
          <option value="">All sources</option>
          {['linkedin','indeed','glassdoor','seek','otta','remoteok','company_website','recruiter_email','referral','adzuna','arbeitnow','other'].map(p => (
            <option key={p} value={p}>{platformLabel(p)}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={needsAction} onChange={e => setNeedsAction(e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-500" />
          <span className="text-xs text-gray-400">Needs action</span>
        </label>
        {(statusFilter || platformFilter || needsAction || searchQuery) && (
          <button onClick={() => { setStatusFilter(''); setPlatformFilter(''); setNeedsAction(false); setSearchQuery(''); }}
            className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 transition-colors">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">{error}</div>
      )}

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                {['Company', 'Role', 'Score', 'Status', 'Source', 'Applied', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-20 text-center">
                    <div className="text-gray-500 text-sm mb-3">No applications found.</div>
                    <button onClick={() => setShowImport(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">
                      + Import your first job
                    </button>
                  </td>
                </tr>
              ) : (
                applications.map(app => (
                  <tr key={app.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {app.company_name}
                        <HealthBadge app={app} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-xs">
                      <span title={app.job_title}>
                        {app.job_title.length > 48 ? app.job_title.slice(0, 48) + '…' : app.job_title}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {app.match_score !== null ? (
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${scoreBadgeClass(app.match_score)}`}>
                          {Math.round(parseFloat(String(app.match_score)))}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(app.status)}`}>
                        {STATUS_PIPELINE.find(s => s.value === app.status)?.label || app.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {app.source_platform ? (
                        <span className={`text-xs px-2 py-0.5 rounded-md
                          ${app.entry_method === 'paste' || app.entry_method === 'manual'
                            ? 'bg-indigo-900/40 text-indigo-400'
                            : 'bg-gray-800 text-gray-500'}`}>
                          {platformLabel(app.source_platform)}
                        </span>
                      ) : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {formatDate(app.applied_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/applications/${app.id}`}
                          className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors">
                          View
                        </Link>
                        <button onClick={() => handleArchive(app.id, app.company_name)} disabled={archiving === app.id}
                          className="px-3 py-1 text-xs rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400
                            border border-gray-700 hover:border-red-800/50 disabled:opacity-40 transition-colors">
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
      )}

      {/* ── Kanban view ── */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map(col => {
            const colApps = applications.filter(a => col.statuses.includes(a.status));
            return (
              <div key={col.value} className="flex-shrink-0 w-60">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{col.label}</h3>
                  <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{colApps.length}</span>
                </div>
                <div className="space-y-2">
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />
                    ))
                  ) : colApps.length === 0 ? (
                    <div className="h-16 rounded-xl border border-dashed border-gray-800 flex items-center justify-center text-xs text-gray-700">
                      Empty
                    </div>
                  ) : (
                    colApps.map(app => <KanbanCard key={app.id} app={app} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import drawer */}
      {showImport && <ImportJobDrawer onClose={() => { setShowImport(false); fetchApplications(); }} />}
    </div>
  );
}
