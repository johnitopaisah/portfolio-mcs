// ============================================================
//  App dialogs — replaces window.alert / window.confirm
//
//  Native dialogs are titled "<domain> says", can't be styled and look
//  different in every browser. These render through <DialogHost /> (mounted
//  once in app/layout.tsx) with the admin theme, and return promises:
//
//    if (!(await confirmDialog({ title: 'Delete project?', confirmLabel: 'Delete', tone: 'danger' }))) return;
//    showError(err);                                  // failed request, etc.
//    await alertDialog({ title: 'Saved', message: '…' });
//
//  Calls made before the host mounts (or outside the browser) fall back to
//  the native dialog so nothing is ever silently skipped.
// ============================================================

export type DialogTone = 'default' | 'danger' | 'error' | 'info';

export interface DialogRequest {
  kind: 'confirm' | 'alert';
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: DialogTone;
  resolve: (ok: boolean) => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;   // default 'Confirm'
  cancelLabel?: string;    // default 'Cancel'
  tone?: 'default' | 'danger';
}

export interface AlertOptions {
  title: string;
  message?: string;
  okLabel?: string;        // default 'OK'
  tone?: 'error' | 'info';
}

type Handler = (req: DialogRequest) => void;
let handler: Handler | null = null;

/** Used by <DialogHost />; returns an unregister function. */
export function registerDialogHandler(h: Handler): () => void {
  handler = h;
  return () => { if (handler === h) handler = null; };
}

function open(req: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => {
    if (handler) { handler({ ...req, resolve }); return; }
    // Fallback: no host mounted (e.g. during a hard navigation).
    if (typeof window === 'undefined') { resolve(false); return; }
    const text = req.message ? `${req.title}\n\n${req.message}` : req.title;
    if (req.kind === 'confirm') resolve(window.confirm(text));
    else { window.alert(text); resolve(true); }
  });
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return open({
    kind: 'confirm',
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel || 'Confirm',
    cancelLabel: opts.cancelLabel || 'Cancel',
    tone: opts.tone || 'default',
  });
}

export function alertDialog(opts: AlertOptions): Promise<void> {
  return open({
    kind: 'alert',
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.okLabel || 'OK',
    tone: opts.tone || 'info',
  }).then(() => undefined);
}

// Connection-level failures (server down, proxy can't reach the API, offline)
// surface as technical strings — show them in plain language instead.
const UNREACHABLE = /api proxy error|failed to fetch|networkerror|load failed|econnrefused|fetch failed|502|503|504/i;

/** Error popup for a failed action. Accepts an Error, a string, or anything thrown. */
export function showError(err: unknown, fallback = 'Something went wrong. Please try again.'): Promise<void> {
  const raw =
    typeof err === 'string' ? err :
    err instanceof Error && err.message ? err.message :
    (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string')
      ? (err as { message: string }).message
      : '';
  if (raw && UNREACHABLE.test(raw)) {
    return alertDialog({
      title: "Can't reach the server",
      message: 'Your change was not saved. Check your connection and try again in a moment.',
      tone: 'error',
    });
  }
  return alertDialog({ title: 'Something went wrong', message: raw || fallback, tone: 'error' });
}
