'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────
interface AppEvent {
  id: number;
  application_id: number;
  event_type: string;
  description: string | null;
  event_date: string;
  created_at: string;
}

interface AppDocument {
  id: number;
  document_type: string;
  version: number;
  ai_model: string | null;
  generated_by_ai: boolean;
  created_at: string;
}

interface Application {
  id: number;
  job_id: string | null;
  company_name: string;
  job_title: string;
  job_url: string | null;
  source_platform: string | null;
  match_score: string | number | null;
  status: string;
  applied_at: string | null;
  last_response_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  events: AppEvent[];
  documents: AppDocument[];
}

interface Job {
  id: string;
  title: string;
  company_name: string;
  description: string | null;
  requirements: string | null;
  ai_reasoning: string | null;
  ai_decision: string | null;
  relevance_score: number | null;
  apply_url: string | null;
}

// ── Constants ────────────────────────────────────────────────
const PAST_APPLIED = new Set([
  'APPLIED', 'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'REJECTED', 'NO_RESPONSE', 'ARCHIVED',
]);

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec  = Math.floor(diffMs / 1000);
  const min  = Math.floor(sec / 60);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  const rtf  = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (day  > 0) return rtf.format(-day,  'day');
  if (hr   > 0) return rtf.format(-hr,   'hour');
  if (min  > 0) return rtf.format(-min,  'minute');
  return rtf.format(-sec, 'second');
}

function scoreBadgeClass(score: string | number | null): string {
  const s = score !== null ? parseFloat(String(score)) : 0;
  if (s >= 80) return 'bg-green-100 text-green-700';
  if (s >= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-500';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'DRAFT':               return 'bg-gray-100 text-gray-600';
    case 'CV_GENERATED':        return 'bg-blue-100 text-blue-700';
    case 'READY_TO_APPLY':      return 'bg-indigo-100 text-indigo-700';
    case 'APPLIED':             return 'bg-purple-100 text-purple-700';
    case 'EMAIL_RECEIVED':
    case 'HR_CONTACTED':        return 'bg-yellow-100 text-yellow-700';
    case 'INTERVIEW_INVITE':
    case 'INTERVIEW_SCHEDULED':
    case 'FINAL_INTERVIEW':
    case 'TECHNICAL_TEST':      return 'bg-orange-100 text-orange-700';
    case 'OFFER':               return 'bg-green-100 text-green-700';
    case 'REJECTED':
    case 'NO_RESPONSE':         return 'bg-red-100 text-red-600';
    case 'ARCHIVED':            return 'bg-gray-200 text-gray-400';
    default:                    return 'bg-gray-100 text-gray-600';
  }
}

function eventDotClass(type: string): string {
  switch (type) {
    case 'APPLICATION_CREATED': return 'bg-gray-400';
    case 'STATUS_CHANGED':      return 'bg-blue-500';
    case 'NOTE_ADDED':          return 'bg-yellow-400';
    case 'CV_GENERATED':        return 'bg-green-500';
    case 'EMAIL_RECEIVED':
    case 'INTERVIEW_INVITE':    return 'bg-orange-500';
    case 'REJECTION_RECEIVED':  return 'bg-red-500';
    case 'OFFER_RECEIVED':      return 'bg-emerald-400';
    default:                    return 'bg-gray-500';
  }
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────
function Skeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-7 bg-gray-800 rounded w-64" />
          <div className="h-4 bg-gray-800 rounded w-40" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 bg-gray-800 rounded-lg" />
          <div className="h-8 w-20 bg-gray-800 rounded-lg" />
          <div className="h-8 w-16 bg-gray-800 rounded-lg" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {[180, 120, 80, 80, 160].map((h, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="h-3 bg-gray-800 rounded w-24 mb-4" />
              <div className={`h-${Math.floor(h / 16)} bg-gray-800 rounded w-full`} />
            </div>
          ))}
        </div>
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="h-3 bg-gray-800 rounded w-24" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-800 mt-1 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-3 bg-gray-800 rounded w-32" />
                  <div className="h-3 bg-gray-800 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function ApplicationDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [app,          setApp]          = useState<Application | null>(null);
  const [job,          setJob]          = useState<Job | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [note,         setNote]         = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // CV generation state
  const [cvLang,       setCvLang]       = useState<'en' | 'fr'>('en');
  const [generating,   setGenerating]   = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const fetchApp = useCallback(async () => {
    try {
      const data: Application = await adminApi.getApplication(id);
      setApp(data);
      // Fetch job details separately if job_id is present
      if (data.job_id) {
        adminApi.getJob(data.job_id).then(setJob).catch(() => {});
      }
    } catch (err: any) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchApp(); }, [fetchApp]);

  async function handleMarkApplied() {
    if (!app) return;
    setActionBusy('applied');
    try {
      await adminApi.patchApplicationStatus(id, 'APPLIED');
      await fetchApp();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleArchive() {
    if (!app) return;
    if (!window.confirm(`Archive application for ${app.company_name}?`)) return;
    setActionBusy('archive');
    try {
      await adminApi.archiveApplication(app.id);
      router.push('/dashboard/applications');
    } catch (err: any) {
      alert(err.message || 'Failed to archive');
      setActionBusy(null);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setNoteSubmitting(true);
    try {
      await adminApi.addNote(id, note.trim());
      setNote('');
      await fetchApp();
    } catch (err: any) {
      alert(err.message || 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function handleGenerateCv(force: boolean) {
    setGenerating(true);
    setGenerateError(null);
    try {
      await adminApi.generateCv(id, { force, language: cvLang });
      await fetchApp();
    } catch (err: any) {
      setGenerateError(err.message || 'CV generation failed. Check API logs.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Loading state ────────────────────────────────────────────
  if (loading) return <Skeleton />;

  // ── 404 state ────────────────────────────────────────────────
  if (notFound || !app) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-gray-400 text-lg mb-4">Application not found.</p>
        <Link
          href="/dashboard/applications"
          className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:text-white
            hover:bg-gray-700 text-sm transition-colors"
        >
          ← Back to Applications
        </Link>
      </div>
    );
  }

  const isApplied = PAST_APPLIED.has(app.status);
  const sortedEvents = [...app.events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/applications"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Applications
            </Link>
          </div>
          <h1 className="text-xl font-bold text-white leading-tight truncate">
            {app.job_title}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-gray-400 text-sm">{app.company_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(app.status)}`}>
              {app.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={handleMarkApplied}
            disabled={isApplied || actionBusy === 'applied'}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500
              text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {actionBusy === 'applied' ? 'Updating…' : 'Mark as Applied'}
          </button>
          <button
            onClick={handleArchive}
            disabled={actionBusy === 'archive'}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-red-900/40
              text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-800/50
              disabled:opacity-40 transition-colors"
          >
            {actionBusy === 'archive' ? 'Archiving…' : 'Archive'}
          </button>
          <Link
            href="/dashboard/applications"
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700
              text-gray-400 hover:text-white border border-gray-700 transition-colors"
          >
            ← Back
          </Link>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

        {/* ── Left column (3/5) ─────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-4">

          {/* Section 1: Job Information */}
          <Section title="Job Information">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {app.source_platform && (
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md">
                    {app.source_platform}
                  </span>
                )}
                {app.match_score !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${scoreBadgeClass(app.match_score)}`}>
                    Score: {Math.round(parseFloat(String(app.match_score)))}
                  </span>
                )}
                {app.job_url && (
                  <a
                    href={app.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                  >
                    View original posting ↗
                  </a>
                )}
              </div>

              {/* Job description from jobs table */}
              {job?.description ? (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Description
                  </p>
                  <div
                    className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap
                      overflow-y-auto rounded-lg bg-gray-800/50 p-3 border border-gray-700/50"
                    style={{ maxHeight: '200px' }}
                  >
                    {job.description}
                  </div>
                </div>
              ) : app.job_id ? (
                <p className="text-xs text-gray-600 italic">Loading job description…</p>
              ) : (
                <p className="text-xs text-gray-600 italic">No job description available.</p>
              )}

              {job?.requirements && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Requirements
                  </p>
                  <div
                    className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap
                      overflow-y-auto rounded-lg bg-gray-800/50 p-3 border border-gray-700/50"
                    style={{ maxHeight: '160px' }}
                  >
                    {job.requirements}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Section 2: Match Analysis */}
          <Section title="Match Analysis">
            {job?.ai_reasoning ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-indigo-900/20 border border-indigo-800/30">
                  <span className="text-indigo-400 text-lg shrink-0">🤖</span>
                  <p className="text-sm text-gray-300 leading-relaxed">{job.ai_reasoning}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 text-center">
                  <p className="text-xs text-gray-500 italic">
                    Detailed skills analysis available after CV generation
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">No AI analysis available for this job.</p>
            )}
          </Section>

          {/* Section 3: Documents */}
          <Section title="Documents">
            {/* Controls — language picker + generate/regenerate buttons */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <select
                value={cvLang}
                onChange={e => setCvLang(e.target.value as 'en' | 'fr')}
                disabled={generating}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700
                  text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors
                  disabled:opacity-40 cursor-pointer"
              >
                <option value="en">EN — English</option>
                <option value="fr">FR — Français</option>
              </select>

              <button
                onClick={() => handleGenerateCv(false)}
                disabled={generating}
                className="px-3 py-1.5 text-xs rounded-lg bg-green-700 hover:bg-green-600
                  text-white font-medium disabled:opacity-40 transition-colors"
              >
                {generating ? `Generating CV (${cvLang.toUpperCase()})…` : 'Generate CV'}
              </button>

              {app.documents.some(d => d.document_type === 'CV') && (
                <button
                  onClick={() => handleGenerateCv(true)}
                  disabled={generating}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-700 hover:bg-indigo-600
                    text-white font-medium disabled:opacity-40 transition-colors"
                >
                  {generating ? 'Regenerating…' : 'Regenerate CV'}
                </button>
              )}
            </div>

            {/* Progress indicator */}
            {generating && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-lg
                bg-indigo-900/20 border border-indigo-800/30 text-xs text-indigo-300">
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent
                  rounded-full animate-spin shrink-0" />
                Generating your tailored CV ({cvLang.toUpperCase()})… this may take 15–30 seconds.
              </div>
            )}

            {/* Error */}
            {generateError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-800/30
                text-xs text-red-400">
                {generateError}
              </div>
            )}

            {/* Documents list */}
            {app.documents.length === 0 ? (
              <p className="text-sm text-gray-600 italic">
                No documents yet. Generate a CV to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {app.documents.map(doc => (
                  <div key={doc.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg
                      bg-gray-800/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-xs bg-blue-900/40 border border-blue-800/40
                        text-blue-400 px-2 py-0.5 rounded-md font-medium shrink-0">
                        {doc.document_type}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">v{doc.version}</span>
                      {doc.ai_model && (
                        <span className="text-xs text-gray-600 truncate max-w-[140px]">
                          {doc.ai_model}
                        </span>
                      )}
                      <span className="text-xs text-gray-600 shrink-0">
                        {timeAgo(doc.created_at)}
                      </span>
                    </div>
                    <button
                      onClick={() => adminApi.downloadCvDocument(
                        id, doc.id,
                        `CV-v${doc.version}-${app.company_name.replace(/\s+/g, '-')}.pdf`
                      )}
                      className="px-3 py-1 text-xs rounded-lg bg-gray-700 hover:bg-gray-600
                        text-gray-300 hover:text-white font-medium transition-colors shrink-0"
                    >
                      Download PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Section 5: Email Responses (placeholder) */}
          <Section title="Email Responses">
            <div className="p-4 rounded-lg bg-gray-800/50 border border-dashed border-gray-700 text-center">
              <p className="text-sm text-gray-500">Email tracking — available after Step 13.</p>
            </div>
          </Section>

          {/* Section 6: Notes */}
          <Section title="Notes">
            {/* Current notes */}
            {app.notes ? (
              <div className="mb-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50
                text-sm text-gray-300 whitespace-pre-wrap">
                {app.notes}
              </div>
            ) : (
              <p className="text-xs text-gray-600 italic mb-4">No notes yet.</p>
            )}

            {/* Add note form */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note…"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                  text-sm text-gray-300 placeholder:text-gray-600 resize-none
                  focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={noteSubmitting || !note.trim()}
                className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500
                  text-white font-medium disabled:opacity-40 transition-colors"
              >
                {noteSubmitting ? 'Saving…' : 'Add Note'}
              </button>
            </form>
          </Section>
        </div>

        {/* ── Right column (2/5): Timeline ──────────────── */}
        <div className="lg:col-span-2">
          <Section title="Status & Timeline">
            {sortedEvents.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No events yet.</p>
            ) : (
              <ol className="relative">
                {sortedEvents.map((ev, idx) => {
                  const isLast = idx === sortedEvents.length - 1;
                  return (
                    <li key={ev.id} className="flex gap-3 pb-5 relative">
                      {/* Connector line */}
                      {!isLast && (
                        <div className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-700" />
                      )}
                      {/* Dot */}
                      <span className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ring-2 ring-gray-900 z-10 ${eventDotClass(ev.event_type)}`} />
                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-200 leading-tight">
                          {ev.event_type.replace(/_/g, ' ')}
                        </p>
                        {ev.description && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {ev.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">{timeAgo(ev.event_date)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
