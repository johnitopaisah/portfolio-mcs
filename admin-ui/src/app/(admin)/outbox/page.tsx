'use client';
// Outbox — emails to recruiters are sent only after you approve them.
// Follow-ups are drafted automatically (7 days after applying, no reply) and
// manual ones come from an application's Comms tab. Approved emails go out
// in working hours (Mon–Fri 09:00–18:00 Paris) after a 5-minute undo window.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { confirmDialog, showError } from '@/lib/dialog';

type Status = 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired' | 'cancelled';

interface OutboxEvent { event: string; actor: string; detail: Record<string, unknown> | null; created_at: string }
interface OutboxEmail {
  id: number; application_id: number; source: 'follow_up_rule' | 'manual'; status: Status;
  to_email: string | null; to_name: string | null; subject: string; body: string;
  ai_polished: boolean; version: number; in_reply_to: string | null;
  send_after: string | null; sent_at: string | null; approved_via: string | null;
  last_error: string | null; cancel_reason: string | null;
  company_name: string; job_title: string; application_status: string;
  created_at: string; updated_at: string; events?: OutboxEvent[];
  language: Lang; language_reason?: string | null;
  possible_rejection?: { email_id: number; subject: string; sender_email: string; received_at: string } | null;
}
type Lang = 'en' | 'fr';
interface PossibleRejection {
  email_id: number; subject: string; sender_email: string; received_at: string;
  application_id: number; company_name: string; job_title: string; application_status: string;
}
interface UndoState { applicationId: number; message: string; undo: unknown; until: number }
const FINAL = ['REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'ACCEPTED', 'DECLINED_OFFER'];
const UNDO_SECONDS = 10;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });

const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Needs recipient',  color: 'var(--t-fbbf24)', bg: 'var(--c-251-191-36-0_12)' },
  pending_approval: { label: 'Needs approval',   color: 'var(--t-c4b5fd)', bg: 'var(--c-168-85-247-0_18)' },
  approved:         { label: 'Scheduled',        color: 'var(--t-60a5fa)', bg: 'var(--c-96-165-250-0_14)' },
  sending:          { label: 'Sending',          color: 'var(--t-60a5fa)', bg: 'var(--c-96-165-250-0_14)' },
  sent:             { label: 'Sent',             color: 'var(--t-4ade80)', bg: 'var(--c-74-222-128-0_12)' },
  failed:           { label: 'Failed',           color: 'var(--t-f87171)', bg: 'var(--c-248-113-113-0_12)' },
  skipped:          { label: 'Not sent',         color: 'var(--t-255-255-255-0_5)', bg: 'var(--c-255-255-255-0_06)' },
  expired:          { label: 'Expired',          color: 'var(--t-255-255-255-0_5)', bg: 'var(--c-255-255-255-0_06)' },
  cancelled:        { label: 'Cancelled',        color: 'var(--t-255-255-255-0_5)', bg: 'var(--c-255-255-255-0_06)' },
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Drafted', edited: 'Edited', ai_polished: 'Rewritten with AI', approval_requested: 'Approval email sent to you',
  approved: 'Approved', undone: 'Approval undone', skipped: 'Marked “don’t send”', sent: 'Sent', send_error: 'Send attempt failed',
  failed: 'Failed', rescheduled: 'Rescheduled', cancelled: 'Cancelled', expired: 'Expired',
  translated: 'Language changed', held: 'Put back for approval', restored: 'Restored (undo)',
};

const FILTERS = [
  { key: 'open', label: 'To review' },
  { key: 'sent', label: 'Sent' },
  { key: '',     label: 'All' },
] as const;

const EDITABLE: Status[] = ['draft', 'pending_approval'];
const card  = { background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' };
const field = { background: 'var(--c-0-0-0-0_25)', border: '1px solid var(--c-255-255-255-0_12)', color: 'var(--t-ffffff)' };

const paris = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
}) : '';

function Badge({ status }: { status: Status }) {
  const s = STATUS[status] || STATUS.skipped;
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}

export default function OutboxPage() {
  return <Suspense fallback={null}><Outbox /></Suspense>;
}

function Outbox() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = Number(params.get('id')) || null;

  const [filter, setFilter]   = useState<string>('open');
  const [items, setItems]     = useState<OutboxEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState<OutboxEmail | null>(null);
  const [form, setForm]       = useState({ to_email: '', to_name: '', subject: '', body: '' });
  const [busy, setBusy]       = useState<string | null>(null);
  const [rejections, setRejections] = useState<PossibleRejection[]>([]);
  const [closeMenu, setCloseMenu]   = useState(false);
  const [showAllRej, setShowAllRej] = useState(false);
  const [undoState, setUndoState]   = useState<UndoState | null>(null);
  const [, setTick] = useState(0);

  const loadList = useCallback(async () => {
    try { setItems(await adminApi.getOutbox(filter || undefined) as OutboxEmail[]); }
    catch (err) { showError(err, "Couldn't load the Outbox."); }
    finally { setLoading(false); }
  }, [filter]);

  const loadEmail = useCallback(async (id: number) => {
    try {
      const e = await adminApi.getOutboxEmail(id) as OutboxEmail;
      setEmail(e);
      setForm({ to_email: e.to_email || '', to_name: e.to_name || '', subject: e.subject, body: e.body });
    } catch (err) { setEmail(null); showError(err, "Couldn't open that email."); }
  }, []);

  const loadRejections = useCallback(async () => {
    try { setRejections(await adminApi.getPossibleRejections() as PossibleRejection[]); } catch { /* banner is optional */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadRejections(); }, [loadRejections]);

  // Close menu: Escape or a click elsewhere closes it; switching email resets it.
  useEffect(() => { setCloseMenu(false); }, [selectedId]);
  useEffect(() => {
    if (!closeMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCloseMenu(false); };
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-close-menu]')) setCloseMenu(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [closeMenu]);

  // Undo bar countdown
  useEffect(() => {
    if (!undoState) return;
    const t = setInterval(() => {
      if (Date.now() >= undoState.until) setUndoState(null); else setTick(n => n + 1);
    }, 500);
    return () => clearInterval(t);
  }, [undoState]);
  useEffect(() => { if (selectedId) loadEmail(selectedId); else setEmail(null); }, [selectedId, loadEmail]);

  // Keep scheduled emails fresh (they move to Sent on their own).
  const hasScheduled = useMemo(() => items.some(i => i.status === 'approved' || i.status === 'sending') || email?.status === 'approved' || email?.status === 'sending', [items, email]);
  useEffect(() => {
    if (!hasScheduled) return;
    const t = setInterval(() => { loadList(); if (selectedId) loadEmail(selectedId); }, 30000);
    return () => clearInterval(t);
  }, [hasScheduled, loadList, loadEmail, selectedId]);

  const select = (id: number | null) => router.replace(id ? `/outbox?id=${id}` : '/outbox', { scroll: false });

  const editable = !!email && EDITABLE.includes(email.status);
  const dirty = !!email && (form.to_email !== (email.to_email || '') || form.to_name !== (email.to_name || '')
    || form.subject !== email.subject || form.body !== email.body);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      const e = await fn() as OutboxEmail;
      if (e && typeof e === 'object' && 'id' in e) { setEmail(e); setForm({ to_email: e.to_email || '', to_name: e.to_name || '', subject: e.subject, body: e.body }); }
      await loadList();
      return true;
    } catch (err) { showError(err); return false; }
    finally { setBusy(null); }
  }

  const save = () => email && run('save', () => adminApi.updateOutboxEmail(email.id, {
    to_email: form.to_email.trim(), to_name: form.to_name.trim(), subject: form.subject.trim(), body: form.body,
  }));

  async function send() {
    if (!email) return;
    const ok = await confirmDialog({
      title: 'Send this email?',
      message: `To ${form.to_email}. It goes out in working hours (Mon–Fri 09:00–18:00 Paris) — you have 5 minutes to undo.`,
      confirmLabel: 'Send',
    });
    if (!ok) return;
    if (dirty && !(await save())) return;
    await run('approve', () => adminApi.outboxAction(email.id, 'approve'));
  }

  async function skip() {
    if (!email) return;
    const ok = await confirmDialog({ title: "Don't send this email?", message: 'It stays in the history but will never be sent.', confirmLabel: "Don't send", tone: 'danger' });
    if (ok) await run('skip', () => adminApi.outboxAction(email.id, 'skip'));
  }

  async function refreshAll() {
    await Promise.all([loadList(), loadRejections(), selectedId ? loadEmail(selectedId) : Promise.resolve()]);
  }

  async function closeApp(status: 'REJECTED' | 'WITHDRAWN') {
    if (!email) return;
    setCloseMenu(false);
    setBusy('close');
    try {
      const r = await adminApi.closeApplication(email.application_id, status, 'outbox') as { cancelled_emails: number; undo: unknown };
      const n = r.cancelled_emails;
      setUndoState({
        applicationId: email.application_id, undo: r.undo, until: Date.now() + UNDO_SECONDS * 1000,
        message: `${email.company_name} marked ${status === 'REJECTED' ? 'rejected' : 'withdrawn'}${n ? ` — ${n} unsent email${n > 1 ? 's' : ''} cancelled` : ''}.`,
      });
      await refreshAll();
    } catch (err) { showError(err); }
    finally { setBusy(null); }
  }

  async function confirmRejection(r: { email_id: number; application_id: number; company_name: string }) {
    setBusy(`rej-${r.email_id}-${r.application_id}`);
    try {
      const out = await adminApi.confirmRejection(r.email_id, r.application_id) as { cancelled_emails: number; undo: unknown };
      const n = out.cancelled_emails;
      setUndoState({
        applicationId: r.application_id, undo: out.undo, until: Date.now() + UNDO_SECONDS * 1000,
        message: `${r.company_name} marked rejected${n ? ` — ${n} unsent email${n > 1 ? 's' : ''} cancelled` : ''}.`,
      });
      await refreshAll();
    } catch (err) { showError(err); }
    finally { setBusy(null); }
  }

  async function dismissRejection(r: { email_id: number; application_id: number }) {
    setBusy(`rej-${r.email_id}-${r.application_id}`);
    try { await adminApi.dismissRejection(r.email_id, r.application_id); await refreshAll(); }
    catch (err) { showError(err); }
    finally { setBusy(null); }
  }

  async function undoClose() {
    if (!undoState) return;
    const u = undoState;
    setUndoState(null);
    try { await adminApi.reopenApplication(u.applicationId, u.undo); await refreshAll(); }
    catch (err) { showError(err); }
  }

  async function switchLanguage(language: Lang) {
    if (!email || email.language === language) return;
    if (dirty && !(await save())) return;
    await run('lang', () => adminApi.setOutboxLanguage(email.id, language));
  }

  async function polish() {
    if (!email) return;
    if (dirty && !(await save())) return;
    await run('polish', () => adminApi.outboxAction(email.id, 'polish'));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t-ffffff)' }}>Outbox</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--t-255-255-255-0_45)' }}>
          Emails to recruiters wait here for your approval. Nothing is sent until you press Send.
        </p>
      </div>

      {rejections.length > 0 && (
        <section aria-labelledby="rej-title" className="mb-4 rounded-2xl p-4" style={{ background: 'var(--c-251-191-36-0_1)', border: '1px solid var(--c-251-191-36-0_12)' }}>
          <h2 id="rej-title" className="text-sm font-semibold" style={{ color: 'var(--t-fde68a)' }}>
            Possible rejections ({rejections.length})
          </h2>
          <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--t-255-255-255-0_55)' }}>
            These emails look like rejections but couldn’t be matched to an application with certainty. Until you answer, no follow-up is drafted or sent for them.
          </p>
          <ul className="flex flex-col gap-2">
            {(showAllRej ? rejections : rejections.slice(0, 3)).map(r => {
              const k = `rej-${r.email_id}-${r.application_id}`;
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl" style={{ background: 'var(--c-0-0-0-0_18)' }}>
                  <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                    <p className="text-xs truncate" style={{ color: 'var(--t-255-255-255-0_8)' }}>
                      <span style={{ color: 'var(--t-255-255-255-0_45)' }}>{day(r.received_at)} · {r.sender_email}</span> — “{r.subject}”
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--t-255-255-255-0_55)' }}>
                      About <Link href={`/applications/${r.application_id}`} className="underline" style={{ color: 'var(--t-ddd6fe)' }}>{r.company_name} — {r.job_title}</Link>?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => confirmRejection(r)} disabled={!!busy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: 'var(--c-248-113-113-0_12)', color: 'var(--t-fca5a5)' }}>
                      {busy === k ? '…' : 'Yes, rejected'}
                    </button>
                    <button onClick={() => dismissRejection(r)} disabled={!!busy}
                      className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40" style={{ background: 'var(--c-255-255-255-0_08)', color: 'var(--t-255-255-255-0_8)' }}>
                      Not this application
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {rejections.length > 3 && (
            <button onClick={() => setShowAllRej(v => !v)} className="mt-2 text-xs underline" style={{ color: 'var(--t-fde68a)' }}>
              {showAllRej ? 'Show fewer' : `Show ${rejections.length - 3} more`}
            </button>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* List */}
        <div className={`lg:col-span-2 rounded-2xl p-3 ${email ? 'hidden lg:block' : ''}`} style={card}>
          <div className="flex gap-1 mb-3" role="tablist" aria-label="Filter emails">
            {FILTERS.map(f => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setLoading(true); setFilter(f.key); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={filter === f.key ? { background: 'var(--c-168-85-247-0_25)', color: 'var(--t-f5f3ff)' } : { color: 'var(--t-255-255-255-0_55)' }}>
                {f.label}
              </button>
            ))}
          </div>
          {loading ? <p className="text-xs text-center py-8" style={{ color: 'var(--t-255-255-255-0_32)' }}>Loading…</p>
          : items.length === 0 ? (
            <p className="text-xs text-center py-8 px-4" style={{ color: 'var(--t-255-255-255-0_4)' }}>
              {filter === 'open' ? 'Nothing waiting for you. Follow-ups are drafted 7 days after applying if nobody has replied.' : 'No emails here yet.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map(i => (
                <li key={i.id}>
                  <button onClick={() => select(i.id)} aria-current={i.id === selectedId ? 'true' : undefined}
                    className="w-full text-left p-3 rounded-xl transition-colors"
                    style={{ background: i.id === selectedId ? 'var(--c-168-85-247-0_16)' : 'var(--c-0-0-0-0_18)', border: `1px solid ${i.id === selectedId ? 'var(--c-168-85-247-0_45)' : 'var(--c-255-255-255-0_06)'}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--t-f5f3ff)' }}>{i.company_name}</span>
                      <Badge status={i.status} />
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--t-255-255-255-0_55)' }}>{i.subject}</p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--t-255-255-255-0_35)' }}>
                      {i.source === 'follow_up_rule' ? 'Auto follow-up' : 'Manual'} · {i.to_email || 'no recipient yet'}
                      {i.status === 'approved' && i.send_after ? ` · sends ${paris(i.send_after)}` : ''}
                      {i.status === 'sent' && i.sent_at ? ` · ${paris(i.sent_at)}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className={`lg:col-span-3 ${email ? '' : 'hidden lg:block'}`}>
          {!email ? (
            <div className="rounded-2xl p-8 text-center text-sm" style={{ ...card, color: 'var(--t-255-255-255-0_4)' }}>Select an email to review it.</div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-5" style={card}>
                <button onClick={() => select(null)} className="lg:hidden text-xs mb-3" style={{ color: 'var(--t-c4b5fd)' }}>← Back to list</button>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                  <div className="min-w-0">
                    <Link href={`/applications/${email.application_id}`} className="text-sm font-semibold hover:underline" style={{ color: 'var(--t-ddd6fe)' }}>
                      {email.company_name} — {email.job_title}
                    </Link>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--t-255-255-255-0_45)' }}>
                      Application status: {email.application_status?.replace(/_/g, ' ').toLowerCase()}
                      {email.in_reply_to ? ' · replies in the recruiter’s thread' : ''}
                      {email.ai_polished ? ' · AI-polished' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={email.status} />
                    {!FINAL.includes(email.application_status) && (
                      <div className="relative" data-close-menu>
                        <button onClick={() => setCloseMenu(v => !v)} disabled={!!busy} aria-haspopup="menu" aria-expanded={closeMenu}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium disabled:opacity-40"
                          style={{ background: 'var(--c-255-255-255-0_08)', color: 'var(--t-255-255-255-0_8)', border: '1px solid var(--c-255-255-255-0_15)' }}>
                          {busy === 'close' ? 'Closing…' : 'Close application ▾'}
                        </button>
                        {closeMenu && (
                          <div role="menu" className="absolute right-0 mt-1 z-20 w-64 rounded-xl p-1.5 shadow-xl"
                            style={{ background: 'var(--c-1e1033)', border: '1px solid var(--c-255-255-255-0_14)' }}>
                            {([['REJECTED', 'Rejected', 'They said no'], ['WITHDRAWN', 'Withdrawn', 'I’m no longer interested']] as const).map(([v, l, d]) => (
                              <button key={v} role="menuitem" onClick={() => closeApp(v)}
                                className="w-full text-left px-3 py-2 rounded-lg" style={{ background: 'transparent' }}
                                onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--c-255-255-255-0_08)'; }}
                                onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}>
                                <span className="block text-sm" style={{ color: v === 'REJECTED' ? 'var(--t-fca5a5)' : 'var(--t-ffffff)' }}>{l}</span>
                                <span className="block text-[11px]" style={{ color: 'var(--t-255-255-255-0_5)' }}>{d} — stops all emails and reminders</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {email.possible_rejection && !FINAL.includes(email.application_status) && (
                  <div className="mb-4 p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2" role="alert"
                    style={{ background: 'var(--c-251-191-36-0_1)', color: 'var(--t-fde68a)' }}>
                    <span className="min-w-0">
                      {email.company_name} may have rejected you: “{email.possible_rejection.subject}” ({day(email.possible_rejection.received_at)}).
                    </span>
                    <span className="flex gap-2">
                      <button onClick={() => confirmRejection({ email_id: email.possible_rejection!.email_id, application_id: email.application_id, company_name: email.company_name })}
                        disabled={!!busy} className="px-3 py-1 rounded-lg font-semibold disabled:opacity-40" style={{ background: 'var(--c-248-113-113-0_12)', color: 'var(--t-fca5a5)' }}>
                        Yes, rejected
                      </button>
                      <button onClick={() => dismissRejection({ email_id: email.possible_rejection!.email_id, application_id: email.application_id })}
                        disabled={!!busy} className="px-3 py-1 rounded-lg disabled:opacity-40" style={{ background: 'var(--c-255-255-255-0_08)', color: '#fff' }}>
                        Not a rejection
                      </button>
                    </span>
                  </div>
                )}

                {email.status === 'approved' && (
                  <div className="mb-4 p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2" style={{ background: 'var(--c-96-165-250-0_1)', color: 'var(--t-bfdbfe)' }}>
                    <span>Approved{email.approved_via === 'email' ? ' from your email' : ''}. Sends {paris(email.send_after)} (Paris).</span>
                    <button onClick={() => run('undo', () => adminApi.outboxAction(email.id, 'undo'))} disabled={!!busy}
                      className="px-3 py-1 rounded-lg font-medium disabled:opacity-50" style={{ background: 'var(--c-255-255-255-0_12)', color: '#fff' }}>
                      {busy === 'undo' ? 'Undoing…' : 'Undo'}
                    </button>
                  </div>
                )}
                {email.status === 'failed' && email.last_error && (
                  <p className="mb-4 p-3 rounded-xl text-xs" role="alert" style={{ background: 'var(--c-248-113-113-0_1)', color: 'var(--t-fca5a5)' }}>{email.last_error}</p>
                )}
                {email.status === 'cancelled' && email.cancel_reason && (
                  <p className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'var(--c-255-255-255-0_05)', color: 'var(--t-255-255-255-0_6)' }}>Cancelled: {email.cancel_reason}</p>
                )}
                {email.status === 'draft' && (
                  <p className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'var(--c-251-191-36-0_1)', color: 'var(--t-fde68a)' }}>
                    No recruiter address was found. Add one below (not a no-reply or job-platform address), then save.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label htmlFor="ob-to" className="block text-xs mb-1" style={{ color: 'var(--t-255-255-255-0_65)' }}>To (email)</label>
                    <input id="ob-to" type="email" value={form.to_email} disabled={!editable} onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-70" style={field} />
                  </div>
                  <div>
                    <label htmlFor="ob-name" className="block text-xs mb-1" style={{ color: 'var(--t-255-255-255-0_65)' }}>Name</label>
                    <input id="ob-name" value={form.to_name} disabled={!editable} onChange={e => setForm(f => ({ ...f, to_name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg outline-none disabled:opacity-70" style={field} />
                  </div>
                </div>
                <label htmlFor="ob-subject" className="block text-xs mb-1" style={{ color: 'var(--t-255-255-255-0_65)' }}>Subject</label>
                <input id="ob-subject" value={form.subject} disabled={!editable} maxLength={250} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none mb-3 disabled:opacity-70" style={field} />
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label htmlFor="ob-body" className="block text-xs" style={{ color: 'var(--t-255-255-255-0_65)' }}>Message</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--t-255-255-255-0_4)' }}>
                      {busy === 'lang' ? 'Translating…' : email.language_reason && email.language_reason !== 'default'
                        ? `${email.language === 'fr' ? 'French' : 'English'} — ${email.language_reason}` : ''}
                    </span>
                    <div role="radiogroup" aria-label="Email language" className="flex rounded-lg p-0.5" style={{ background: 'var(--c-0-0-0-0_25)', border: '1px solid var(--c-255-255-255-0_12)' }}>
                      {(['en', 'fr'] as const).map(l => (
                        <button key={l} role="radio" aria-checked={email.language === l} disabled={!editable || !!busy}
                          onClick={() => switchLanguage(l)} title={l === 'en' ? 'Translate to English' : 'Traduire en français'}
                          className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold disabled:cursor-not-allowed"
                          style={email.language === l ? { background: 'var(--c-168-85-247-0_25)', color: 'var(--t-f5f3ff)' } : { color: 'var(--t-255-255-255-0_5)' }}>
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <textarea id="ob-body" value={form.body} disabled={!editable} rows={12} maxLength={10000} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-lg outline-none resize-y leading-relaxed disabled:opacity-70" style={field} />

                {editable && (
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button onClick={send} disabled={!!busy || !form.to_email.trim()}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, var(--c-a855f7), var(--c-7c3aed))', color: '#fff' }}>
                      {busy === 'approve' ? 'Approving…' : 'Send'}
                    </button>
                    <button onClick={save} disabled={!dirty || !!busy}
                      className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                      style={{ background: 'var(--c-168-85-247-0_2)', color: 'var(--t-e9d5ff)', border: '1px solid var(--c-168-85-247-0_35)' }}>
                      {busy === 'save' ? 'Saving…' : 'Save changes'}
                    </button>
                    <button onClick={polish} disabled={!!busy}
                      className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                      style={{ background: 'var(--c-255-255-255-0_08)', color: 'var(--t-e9d5ff)', border: '1px solid var(--c-255-255-255-0_15)' }}>
                      {busy === 'polish' ? 'Rewriting…' : 'Polish with AI'}
                    </button>
                    <button onClick={skip} disabled={!!busy} className="ml-auto px-3 py-2 rounded-xl text-sm disabled:opacity-40" style={{ color: 'var(--t-f87171)' }}>
                      {busy === 'skip' ? '…' : "Don't send"}
                    </button>
                  </div>
                )}
                {editable && <p className="text-[11px] mt-3" style={{ color: 'var(--t-255-255-255-0_35)' }}>
                  Sends Mon–Fri 09:00–18:00 Paris, with 5 minutes to undo. A copy is saved to your Sent folder and the Comms log.
                </p>}
              </div>

              {/* History */}
              <div className="rounded-2xl p-5" style={card}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--t-ddd6fe)' }}>History</p>
                <ol className="flex flex-col gap-2">
                  {(email.events || []).map((ev, k) => (
                    <li key={k} className="flex gap-3 text-xs">
                      <span className="whitespace-nowrap" style={{ color: 'var(--t-255-255-255-0_4)' }}>{paris(ev.created_at)}</span>
                      <span style={{ color: 'var(--t-255-255-255-0_8)' }}>
                        {EVENT_LABEL[ev.event] || ev.event}
                        <span style={{ color: 'var(--t-255-255-255-0_4)' }}> · {ev.actor === 'you' ? 'you' : ev.actor}</span>
                        {ev.detail && typeof ev.detail.reason === 'string' && <span style={{ color: 'var(--t-255-255-255-0_5)' }}> — {ev.detail.reason}</span>}
                        {ev.detail && typeof ev.detail.error === 'string' && <span style={{ color: 'var(--t-fca5a5)' }}> — {ev.detail.error}</span>}
                        {ev.detail && Array.isArray(ev.detail.fields) && <span style={{ color: 'var(--t-255-255-255-0_5)' }}> — {(ev.detail.fields as string[]).join(', ')}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {undoState && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm max-w-[calc(100vw-32px)]"
          style={{ background: '#18181b', color: '#fafafa', border: '1px solid rgba(255,255,255,0.15)' }}>
          <span className="min-w-0">{undoState.message}</span>
          <button onClick={undoClose} className="font-semibold underline whitespace-nowrap" style={{ color: '#c4b5fd' }}>
            Undo ({Math.max(0, Math.ceil((undoState.until - Date.now()) / 1000))}s)
          </button>
        </div>
      )}
    </div>
  );
}
