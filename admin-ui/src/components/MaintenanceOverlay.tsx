'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  reportSuccess,
  reportFailure,
  isOutageStatus,
} from '@/lib/backendStatus';

const POLL_INTERVAL_MS = 20_000;

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7zm7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-.97l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.488.488 0 0 0 14 2h-4c-.24 0-.44.17-.48.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.63c-.04.31-.07.64-.07.97 0 .33.03.65.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.31.61.22l2.49-1c.52.39 1.08.73 1.69.98l.38 2.65c.05.25.24.42.48.42h4c.24 0 .44-.17.48-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.63z" />
    </svg>
  );
}

export default function MaintenanceOverlay() {
  const down = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const envApiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!envApiBase) return; // matches lib/api.ts's own guard — nothing to poll without it
    const apiBase = envApiBase.replace(/\/$/, '');

    let cancelled = false;

    async function checkHealth() {
      try {
        const res = await fetch(`${apiBase}/api/health`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.ok) reportSuccess();
        else if (isOutageStatus(res.status)) reportFailure();
        else reportSuccess();
      } catch {
        if (!cancelled) reportFailure();
      }
    }

    checkHealth();
    const id = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!down) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div className="relative w-28 h-28 mb-8" style={{ color: 'var(--accent)' }}>
        <GearIcon className="maintenance-gear-a absolute inset-0 w-20 h-20 m-auto" />
        <GearIcon className="maintenance-gear-b absolute w-10 h-10 top-0 right-0" />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: 'var(--text-1)' }}>
        We&rsquo;ll be right back
      </h1>
      <p className="max-w-md text-base sm:text-lg mb-2" style={{ color: 'var(--text-2)' }}>
        Something&rsquo;s not right on our end — we&rsquo;re on it. This page will
        reconnect automatically as soon as things are back.
      </p>
      <p className="text-sm font-mono" style={{ color: 'var(--text-3)' }}>
        Checking again every {POLL_INTERVAL_MS / 1000}s…
      </p>
    </div>
  );
}
