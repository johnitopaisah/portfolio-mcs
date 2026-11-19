'use client';
// Renders the app's confirm / alert dialogs (see lib/dialog.ts). Mounted once
// in app/layout.tsx. One dialog at a time; further requests queue.
//
// Accessibility: role="alertdialog", aria-modal, labelled by the title and
// described by the message; focus moves into the dialog (to Cancel for
// destructive actions, otherwise to the main button), Tab stays inside,
// Esc cancels, and focus returns to where it was when the dialog closes.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { registerDialogHandler, type DialogRequest } from '@/lib/dialog';

const TONES = {
  default: { icon: '?', iconBg: 'rgba(168,85,247,0.18)', iconFg: '#D8B4FE', btnBg: '#7c3aed', btnHover: '#6d28d9' },
  info:    { icon: 'i', iconBg: 'rgba(168,85,247,0.18)', iconFg: '#D8B4FE', btnBg: '#7c3aed', btnHover: '#6d28d9' },
  danger:  { icon: '!', iconBg: 'rgba(239,68,68,0.16)',  iconFg: '#fca5a5', btnBg: '#dc2626', btnHover: '#b91c1c' },
  error:   { icon: '!', iconBg: 'rgba(239,68,68,0.16)',  iconFg: '#fca5a5', btnBg: '#7c3aed', btnHover: '#6d28d9' },
} as const;

export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0];
  const panelRef   = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef  = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId  = useId();

  useEffect(() => registerDialogHandler(req => setQueue(q => [...q, req])), []);

  const close = useCallback((ok: boolean) => {
    setQueue(q => {
      q[0]?.resolve(ok);
      return q.slice(1);
    });
  }, []);

  // Focus management + scroll lock while a dialog is open.
  useEffect(() => {
    if (!current) return;
    if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target = current.kind === 'confirm' && current.tone === 'danger' ? cancelRef.current : confirmRef.current;
    target?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, [current]);

  // Restore focus once the queue is empty.
  useEffect(() => {
    if (current || !returnFocusRef.current) return;
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (document.contains(el)) el.focus();
  }, [current]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(current.kind === 'alert'); return; }
    if (e.key === 'Tab') {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  if (!current) return null;
  const t = TONES[current.tone] || TONES.default;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(8,4,20,0.62)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget && current.kind === 'confirm') close(false); }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={current.message ? descId : undefined}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, #24123f 0%, #1a0d30 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.08)',
          animation: 'dialog-in 140ms ease-out',
        }}
      >
        <div className="flex gap-4">
          <div aria-hidden="true"
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-bold"
            style={{ background: t.iconBg, color: t.iconFg }}>
            {t.icon}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="text-base font-semibold leading-snug" style={{ color: '#FFFFFF' }}>
              {current.title}
            </h2>
            {current.message && (
              <p id={descId} className="mt-2 text-sm leading-relaxed whitespace-pre-line break-words"
                style={{ color: 'rgba(255,255,255,0.68)' }}>
                {current.message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {current.kind === 'confirm' && (
            <button ref={cancelRef} type="button" onClick={() => close(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.14)' }}>
              {current.cancelLabel || 'Cancel'}
            </button>
          )}
          <button ref={confirmRef} type="button" onClick={() => close(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            style={{ background: t.btnBg, color: '#FFFFFF' }}
            onMouseEnter={e => { e.currentTarget.style.background = t.btnHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = t.btnBg; }}>
            {current.confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes dialog-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { [role="alertdialog"] { animation: none !important; } }`}</style>
    </div>
  );
}
