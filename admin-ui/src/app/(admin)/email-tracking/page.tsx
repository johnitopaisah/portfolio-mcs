'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────
interface EmailResponse {
  id: number;
  application_id: number | null;
  gmail_message_id: string;
  source_account: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  ai_classification: string;
  confidence_score: number | null;
  reviewed_correct: boolean | null;
  raw_label: string;
  company_name: string | null;
  job_title: string | null;
}

interface AppOption {
  id: number;
  company_name: string;
  job_title: string;
}

interface SyncStatus {
  source_account: string;
  status: 'SUCCESS' | 'FAILED';
  emails_fetched: number;
  emails_new: number;
  error_message: string | null;
  created_at: string;
}

const CLASSIFICATIONS = [
  'INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST',
  'OFFER', 'FOLLOW_UP_NEEDED', 'GENERAL_RESPONSE', 'UNKNOWN',
] as const;

const SOURCES = [
  { value: '',       label: 'All mailboxes' },
  { value: 'gmail',  label: 'Gmail' },
  { value: 'imap',   label: 'Professional' },
];

// ── Helpers ───────────────────────────────────────────────────
function classBadge(cls: string): { label: string; bg: string } {
  const map: Record<string, { label: string; bg: string }> = {
    INTERVIEW_INVITE: { label: 'Interview Invite', bg: 'bg-green-900/40 text-green-400 border border-green-700/40'     },
    OFFER:            { label: 'Offer',            bg: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40' },
    TECHNICAL_TEST:   { label: 'Technical Test',   bg: 'bg-blue-900/40 text-blue-400 border border-blue-700/40'        },
    REJECTION:        { label: 'Rejection',        bg: 'bg-red-900/40 text-red-400 border border-red-700/40'           },
    FOLLOW_UP_NEEDED: { label: 'Follow Up Needed', bg: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40'  },
    GENERAL_RESPONSE: { label: 'General Response', bg: 'bg-gray-800 text-gray-400 border border-gray-700/50'           },
    UNKNOWN:          { label: 'Unknown',          bg: 'bg-gray-800 text-gray-500 border border-gray-700/40'           },
  };
  return map[cls] ?? map['UNKNOWN'];
}

function sourceBadge(source: string): { label: string; bg: string } {
  return source === 'imap'
    ? { label: 'Professional', bg: 'bg-purple-900/40 text-purple-300 border border-purple-700/40' }
    : { label: 'Gmail',        bg: 'bg-sky-900/40 text-sky-300 border border-sky-700/40' };
}

function confidenceColor(score: number | null): string {
  if (score === null) return 'text-gray-500';
  if (score >= 0.8)   return 'text-green-400';
  if (score >= 0.6)   return 'text-yellow-400';
  return 'text-red-400';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf  = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const mins  = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days  = Math.round(diff / 86400000);
  if (mins < 60)   return rtf.format(-mins, 'minute');
  if (hours < 24)  return rtf.format(-hours, 'hour');
  return rtf.format(-days, 'day');
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── Skeleton ──────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="animate-pulse bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="border-b border-gray-800 px-4 py-3 flex gap-4">
        {[140, 120, 180, 120, 60, 160, 80].map((w, i) => (
          <div key={i} className="h-3 bg-gray-800 rounded" style={{ width: w }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="border-b border-gray-800/50 px-4 py-4 flex gap-4 items-center">
          {[140, 120, 180, 120, 60, 160, 80].map((w, j) => (
            <div key={j} className="h-3 bg-gray-800 rounded" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Sync health badges ──────────────────────────────────────────
function SyncHealthBar() {
  const [statuses, setStatuses] = useState<SyncStatus[]>([]);

  useEffect(() => {
    adminApi.getEmailSyncStatus()
      .then((data: { sources: SyncStatus[] }) => setStatuses(data.sources || []))
      .catch(() => setStatuses([]));
  }, []);

  if (statuses.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map(s => {
        const ok = s.status === 'SUCCESS';
        const label = s.source_account === 'imap' ? 'Professional' : 'Gmail';
        return (
          <div
            key={s.source_account}
            title={ok ? `${s.emails_new} new of ${s.emails_fetched} fetched` : (s.error_message || 'Sync failed')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${
              ok ? 'bg-gray-900 border-gray-800 text-gray-400' : 'bg-red-950/40 border-red-800/50 text-red-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
            {label} · {ok ? `synced ${relativeTime(s.created_at)}` : 'sync failed'}
          </div>
        );
      })}
    </div>
  );
}

// ── Link-to-Application inline search ────────────────────────
function LinkAppCell({
  emailId, onLinked,
}: {
  emailId: number;
  onLinked: (appId: number, companyName: string, jobTitle: string) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await adminApi.getApplications({ search: query });
        setResults(data.slice(0, 8));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function selectApp(app: AppOption) {
    try {
      await adminApi.linkEmailResponse(emailId, app.id);
      onLinked(app.id, app.company_name, app.job_title);
      setOpen(false);
      setQuery('');
    } catch { /* silent */ }
  }

  return (
    <div className="relative" ref={ref}>
      {open ? (
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search company or role…"
            className="w-48 px-2 py-1 text-xs rounded-md bg-gray-800 border border-gray-600
              text-white placeholder-gray-500 outline-none focus:border-indigo-500"
          />
          {(results.length > 0 || loading) && (
            <div className="absolute top-8 left-0 z-20 w-64 bg-gray-900 border border-gray-700
              rounded-lg shadow-xl overflow-hidden">
              {loading ? (
                <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
              ) : results.map(app => (
                <button
                  key={app.id}
                  onClick={() => selectApp(app)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors"
                >
                  <span className="text-white font-medium">{app.company_name}</span>
                  <span className="text-gray-500 ml-1">— {app.job_title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="px-2 py-1 text-xs rounded-md bg-gray-800 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Link
        </button>
      )}
    </div>
  );
}

// ── Filter bar ──────────────────────────────────────────────────
interface Filters {
  source_account: string;
  classification: string[];
  matched: '' | 'true' | 'false';
  search: string;
  date_from: string;
  date_to: string;
  domain: string;
  confidence_min: string;
  confidence_max: string;
}

const EMPTY_FILTERS: Filters = {
  source_account: '', classification: [], matched: '',
  search: '', date_from: '', date_to: '', domain: '',
  confidence_min: '', confidence_max: '',
};

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [showMore, setShowMore] = useState(false);

  function toggleClassification(c: string) {
    const next = filters.classification.includes(c)
      ? filters.classification.filter(x => x !== c)
      : [...filters.classification, c];
    onChange({ ...filters, classification: next });
  }

  const activeCount = Object.entries(filters).filter(([k, v]) =>
    k === 'classification' ? (v as string[]).length > 0 : v !== ''
  ).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search subject, sender, body…"
          className="flex-1 min-w-48 px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
            text-white placeholder-gray-500 outline-none focus:border-indigo-500"
        />
        <select
          value={filters.source_account}
          onChange={e => onChange({ ...filters, source_account: e.target.value })}
          className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 cursor-pointer"
        >
          {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={filters.matched}
          onChange={e => onChange({ ...filters, matched: e.target.value as Filters['matched'] })}
          className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 cursor-pointer"
        >
          <option value="">All match status</option>
          <option value="true">Matched</option>
          <option value="false">Unmatched</option>
        </select>
        <button
          onClick={() => setShowMore(s => !s)}
          className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
        >
          {showMore ? 'Less filters' : 'More filters'}
        </button>
        {activeCount > 0 && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="px-2 py-1.5 text-xs rounded-lg text-red-400 hover:text-red-300"
          >
            Clear ({activeCount})
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CLASSIFICATIONS.map(c => {
          const active = filters.classification.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggleClassification(c)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                active
                  ? 'bg-indigo-900/50 border-indigo-600 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              {c.replace(/_/g, ' ')}
            </button>
          );
        })}
      </div>

      {showMore && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={filters.date_from}
            onChange={e => onChange({ ...filters, date_from: e.target.value })}
            className="px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300" />
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={filters.date_to}
            onChange={e => onChange({ ...filters, date_to: e.target.value })}
            className="px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300" />
          <label className="text-xs text-gray-500">Domain</label>
          <input value={filters.domain} placeholder="greenhouse.io"
            onChange={e => onChange({ ...filters, domain: e.target.value })}
            className="w-36 px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 placeholder-gray-600" />
          <label className="text-xs text-gray-500">Confidence</label>
          <input type="number" min={0} max={1} step={0.05} value={filters.confidence_min} placeholder="min"
            onChange={e => onChange({ ...filters, confidence_min: e.target.value })}
            className="w-16 px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 placeholder-gray-600" />
          <span className="text-xs text-gray-600">–</span>
          <input type="number" min={0} max={1} step={0.05} value={filters.confidence_max} placeholder="max"
            onChange={e => onChange({ ...filters, confidence_max: e.target.value })}
            className="w-16 px-2 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 placeholder-gray-600" />
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function EmailTrackingPage() {
  const [emails,  setEmails]  = useState<EmailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const LIMIT = 50;

  const fetchEmails = useCallback(async (p: number, f: Filters) => {
    setLoading(true);
    try {
      const data = await adminApi.getEmailResponses({
        page: p, limit: LIMIT,
        source_account: f.source_account || undefined,
        classification: f.classification.length ? f.classification.join(',') : undefined,
        matched: f.matched || undefined,
        search: f.search || undefined,
        date_from: f.date_from || undefined,
        date_to: f.date_to || undefined,
        domain: f.domain || undefined,
        confidence_min: f.confidence_min || undefined,
        confidence_max: f.confidence_max || undefined,
      });
      setEmails(data.emails);
      setTotal(data.total);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmails(page, filters); }, [fetchEmails, page, filters]);

  function handleFilterChange(f: Filters) {
    setFilters(f);
    setPage(1);
  }

  async function handleReclassify(id: number, classification: string) {
    setEmails(prev => prev.map(e =>
      e.id === id ? { ...e, ai_classification: classification } : e
    ));
    try {
      await adminApi.reclassifyEmailResponse(id, classification);
    } catch {
      fetchEmails(page, filters);
    }
  }

  async function handleFeedback(id: number, correct: boolean) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, reviewed_correct: correct } : e));
    try {
      await adminApi.submitEmailFeedback(id, correct);
    } catch {
      fetchEmails(page, filters);
    }
  }

  function handleLinked(emailId: number, appId: number, companyName: string, jobTitle: string) {
    setEmails(prev => prev.map(e =>
      e.id === emailId
        ? { ...e, application_id: appId, company_name: companyName, job_title: jobTitle }
        : e
    ));
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Email Tracking</h1>
          <p className="text-gray-500 text-sm">Inbound recruitment emails classified by AI, across all mailboxes</p>
        </div>
        <button
          onClick={() => fetchEmails(page, filters)}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <SyncHealthBar />
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Content */}
      {loading ? (
        <TableSkeleton />
      ) : emails.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">
            No emails match these filters. Try clearing some filters, or run the email worker to fetch new mail.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Mailbox', 'Sender', 'Company', 'Subject', 'Classification', 'Confidence', 'Linked Application', 'Received', 'Accurate?'].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emails.map((email, idx) => {
                    const isLast = idx === emails.length - 1;
                    const badge  = classBadge(email.ai_classification);
                    const srcBadge = sourceBadge(email.source_account);
                    return (
                      <tr
                        key={email.id}
                        className={`transition-colors hover:bg-gray-800/40 ${!isLast ? 'border-b border-gray-800/50' : ''}`}
                      >
                        {/* Mailbox source */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${srcBadge.bg}`}>
                            {srcBadge.label}
                          </span>
                        </td>

                        {/* Sender */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-gray-200 font-medium text-xs">
                            {email.sender_name || '—'}
                          </div>
                          <div className="text-gray-500 text-xs">{email.sender_email}</div>
                        </td>

                        {/* Company (from joined application) */}
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap max-w-[120px] truncate">
                          {email.company_name ?? '—'}
                        </td>

                        {/* Subject */}
                        <td className="px-4 py-3.5 text-gray-300 text-xs max-w-[220px] truncate">
                          {truncate(email.subject || '', 60)}
                        </td>

                        {/* Classification badge + reclassify select */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <select
                              value={email.ai_classification}
                              onChange={e => handleReclassify(email.id, e.target.value)}
                              className="text-xs bg-gray-800 border border-gray-700 text-gray-400
                                rounded px-1 py-0.5 cursor-pointer hover:border-gray-600
                                focus:outline-none focus:border-indigo-500"
                            >
                              {CLASSIFICATIONS.map(c => (
                                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                          </div>
                        </td>

                        {/* Confidence */}
                        <td className={`px-4 py-3.5 whitespace-nowrap text-xs font-mono font-medium ${confidenceColor(email.confidence_score)}`}>
                          {email.confidence_score != null
                            ? `${Math.round(email.confidence_score * 100)}%`
                            : '—'}
                        </td>

                        {/* Linked Application */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          {email.application_id ? (
                            <Link
                              href={`/applications/${email.application_id}`}
                              className="text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              <span className="font-medium">{email.company_name}</span>
                              {email.job_title && (
                                <span className="text-gray-500 ml-1">— {truncate(email.job_title, 30)}</span>
                              )}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600">Unlinked</span>
                              <LinkAppCell
                                emailId={email.id}
                                onLinked={(appId, companyName, jobTitle) =>
                                  handleLinked(email.id, appId, companyName, jobTitle)
                                }
                              />
                            </div>
                          )}
                        </td>

                        {/* Received */}
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                          {email.received_at ? relativeTime(email.received_at) : '—'}
                        </td>

                        {/* Feedback */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleFeedback(email.id, true)}
                              title="Classification was correct"
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                email.reviewed_correct === true ? 'bg-green-900/50 text-green-400' : 'text-gray-600 hover:text-green-400'
                              }`}
                            >
                              👍
                            </button>
                            <button
                              onClick={() => handleFeedback(email.id, false)}
                              title="Classification was wrong"
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                email.reviewed_correct === false ? 'bg-red-900/50 text-red-400' : 'text-gray-600 hover:text-red-400'
                              }`}
                            >
                              👎
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: row count */}
            <div className="px-4 py-2.5 border-t border-gray-800/50 flex items-center justify-between">
              <p className="text-xs text-gray-600">
                {total} email{total !== 1 ? 's' : ''} total
                {totalPages > 1 && ` · page ${page} of ${totalPages}`}
              </p>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700
                  text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40
                  disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700
                  text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40
                  disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
