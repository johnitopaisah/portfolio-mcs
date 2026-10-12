'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

// Records an inbound email as its own application — for an email that was
// linked (or suggested) to another application at the same company but is
// really about a different role, or one nothing was created for.
//
// Lists the applications already on file for the company being typed, so
// linking to one of those is a click away instead of creating a duplicate.

export interface DialogEmail {
  id: number;
  application_id: number | null;
  sender_name: string;
  sender_email: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  ai_classification: string;
  company_name: string | null;
  job_title: string | null;
  suggested_company_name: string | null;
  extracted_company: string | null;
  extracted_role: string | null;
}

interface ExistingApp {
  id: number;
  company_name: string;
  job_title: string;
  status: string;
}

type StartStatus = 'APPLIED' | 'EMAIL_RECEIVED';

const STATUS_OPTIONS: { value: StartStatus; label: string; hint: string }[] = [
  { value: 'APPLIED',        label: 'Applied',        hint: 'This email confirms I applied' },
  { value: 'EMAIL_RECEIVED', label: 'Email received', hint: 'This is a reply about an application' },
];

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500';

export default function NewApplicationFromEmailDialog({
  email, onClose, onDone,
}: {
  email: DialogEmail;
  onClose: () => void;
  /** Called once the email has a new home — a created application or an existing one it was linked to. */
  onDone: (appId: number, companyName: string, jobTitle: string) => void;
}) {
  const detectedCompany = email.extracted_company || '';
  const detectedRole    = email.extracted_role || '';

  const [company, setCompany] = useState(email.company_name || email.suggested_company_name || detectedCompany);
  const [title,   setTitle]   = useState(detectedRole);
  const [status,  setStatus]  = useState<StartStatus>(
    email.ai_classification === 'APPLICATION_CONFIRMATION' ? 'APPLIED' : 'EMAIL_RECEIVED'
  );
  const [existing, setExisting] = useState<ExistingApp[]>([]);
  const [busy,     setBusy]     = useState<'create' | number | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [created,  setCreated]  = useState<ExistingApp | null>(null);

  const companyRef = useRef<HTMLInputElement>(null);
  const titleRef   = useRef<HTMLInputElement>(null);

  // Start typing in the first field that still needs an answer.
  useEffect(() => {
    (company.trim() ? titleRef : companyRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The row is only updated on the way out: updating it earlier re-renders
  // the table cell this dialog was opened from and would dismiss the
  // confirmation before it could be read.
  const close = useCallback(() => {
    if (created) onDone(created.id, created.company_name, created.job_title);
    onClose();
  }, [created, onDone, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && busy === null) close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, busy]);

  // Applications already on file for the company being typed.
  useEffect(() => {
    const q = company.trim();
    if (q.length < 2) { setExisting([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows: ExistingApp[] = await adminApi.getApplications({ search: q });
        if (cancelled) return;
        setExisting(rows.filter(a =>
          a.status !== 'ARCHIVED' && a.company_name.toLowerCase().includes(q.toLowerCase())
        ).slice(0, 5));
      } catch {
        if (!cancelled) setExisting([]);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [company]);

  const canSubmit = company.trim().length > 0 && busy === null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy('create');
    setError(null);
    try {
      const app = await adminApi.splitEmailResponse(email.id, {
        company_name: company.trim(),
        job_title:    title.trim(),
        status,
      });
      setCreated({ id: app.id, company_name: app.company_name, job_title: app.job_title, status });
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create application');
    } finally {
      setBusy(null);
    }
  }

  async function handleLink(app: ExistingApp) {
    setBusy(app.id);
    setError(null);
    try {
      await adminApi.linkEmailResponse(email.id, app.id);
      onDone(app.id, app.company_name, app.job_title);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to link email');
      setBusy(null);
    }
  }

  // Portalled to <body> so the table cell it is opened from can't impose its
  // nowrap/overflow styles on it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm whitespace-normal text-left"
      onMouseDown={e => { if (e.target === e.currentTarget && busy === null) close(); }}
      role="dialog" aria-modal="true" aria-labelledby="new-app-dialog-title"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 id="new-app-dialog-title" className="text-white font-bold text-lg">New application from this email</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {email.application_id
                ? 'Record it separately — the application it is on now stays as it is.'
                : 'Record the application this email is about.'}
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {created ? (
          <div className="px-6 py-8 flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-900/40 border-2 border-green-600 flex items-center justify-center text-2xl text-green-400">✓</div>
            <div>
              <h3 className="text-white font-bold text-lg">Application created</h3>
              <p className="text-gray-400 text-sm mt-1">
                {created.company_name} — {created.job_title}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/applications/${created.id}`} onClick={close}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                View application →
              </Link>
              <button onClick={close}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col min-h-0">
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {/* The email being filed */}
              <div className="rounded-xl bg-gray-800/50 border border-gray-700/60 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span className="truncate">{email.sender_name || email.sender_email}</span>
                  <span className="shrink-0">
                    {email.received_at
                      ? new Date(email.received_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : ''}
                  </span>
                </div>
                <p className="text-sm text-white font-medium mt-1 break-words">{email.subject || '(no subject)'}</p>
                {email.body_snippet && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-3 break-words">{email.body_snippet}</p>
                )}
              </div>

              {email.application_id && (
                <p className="text-xs text-gray-500">
                  Currently linked to{' '}
                  <span className="text-gray-300">{email.company_name}{email.job_title ? ` — ${email.job_title}` : ''}</span>
                </p>
              )}

              <div>
                <label htmlFor="new-app-company" className="block text-xs font-semibold text-gray-400 mb-1.5">Company *</label>
                <input id="new-app-company" ref={companyRef} value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Acme Inc" className={inputCls} />
              </div>

              <div>
                <label htmlFor="new-app-title" className="block text-xs font-semibold text-gray-400 mb-1.5">Job title</label>
                <input id="new-app-title" ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. DevOps Engineer" className={inputCls} />
                {detectedRole && title === detectedRole && (
                  <p className="text-xs text-indigo-400/80 mt-1">✦ Detected from the email</p>
                )}
                {!title.trim() && (
                  <p className="text-xs text-gray-600 mt-1">Leave empty if the email doesn&apos;t say — you can fill it in later.</p>
                )}
              </div>

              <div>
                <span className="block text-xs font-semibold text-gray-400 mb-2">Starting status</span>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setStatus(o.value)} aria-pressed={status === o.value}
                      className={`text-left rounded-lg px-3 py-2 border transition-colors
                        ${status === o.value
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs opacity-70 mt-0.5">{o.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {existing.length > 0 && (
                <div className="rounded-xl bg-amber-900/10 border border-amber-700/30 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-400">
                    Already on file for this company — link instead if it&apos;s one of these
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {existing.map(app => (
                      <li key={app.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-gray-300">
                          {app.company_name} — {app.job_title}
                          <span className="text-gray-600 ml-1.5">{app.status.replace(/_/g, ' ').toLowerCase()}</span>
                        </span>
                        {app.id === email.application_id ? (
                          <span className="shrink-0 text-gray-600">current</span>
                        ) : (
                          <button type="button" onClick={() => handleLink(app)} disabled={busy !== null}
                            className="shrink-0 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-gray-300
                              hover:text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
                            {busy === app.id ? '…' : 'Link here'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-xs">{error}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-800">
              <button type="button" onClick={close} disabled={busy !== null}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={!canSubmit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                {busy === 'create' ? 'Creating…' : 'Create application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
