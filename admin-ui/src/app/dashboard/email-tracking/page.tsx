'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────
interface EmailResponse {
  id: number;
  application_id: number | null;
  gmail_message_id: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  ai_classification: string;
  confidence_score: number | null;
  raw_label: string;
  company_name: string | null;
  job_title: string | null;
}

interface AppOption {
  id: number;
  company_name: string;
  job_title: string;
}

const CLASSIFICATIONS = [
  'INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST',
  'OFFER', 'FOLLOW_UP_NEEDED', 'GENERAL_RESPONSE', 'UNKNOWN',
] as const;

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

// ── Main page ─────────────────────────────────────────────────
export default function EmailTrackingPage() {
  const [emails,  setEmails]  = useState<EmailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const LIMIT = 50;

  const fetchEmails = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await adminApi.getEmailResponses(p, LIMIT);
      setEmails(data.emails);
      setTotal(data.total);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmails(page); }, [fetchEmails, page]);

  async function handleReclassify(id: number, classification: string) {
    // Optimistic update
    setEmails(prev => prev.map(e =>
      e.id === id ? { ...e, ai_classification: classification } : e
    ));
    try {
      await adminApi.reclassifyEmailResponse(id, classification);
    } catch {
      // Revert on failure
      fetchEmails(page);
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
          <p className="text-gray-500 text-sm">Inbound recruitment emails classified by AI</p>
        </div>
        <button
          onClick={() => fetchEmails(page)}
          className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
            text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton />
      ) : emails.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-500 text-sm">
            No emails tracked yet. Run the email worker to fetch and classify inbound emails.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Sender', 'Company', 'Subject', 'Classification', 'Confidence', 'Linked Application', 'Received'].map(h => (
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
                    return (
                      <tr
                        key={email.id}
                        className={`transition-colors hover:bg-gray-800/40 ${!isLast ? 'border-b border-gray-800/50' : ''}`}
                      >
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
                              href={`/dashboard/applications/${email.application_id}`}
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
