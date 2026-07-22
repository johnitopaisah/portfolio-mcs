'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TOKEN_KEY,
  getToken,
  recordActivity,
  forceRecordActivity,
  isIdle,
  msUntilIdleLogout,
  logout,
  captureReturnTo,
  msUntilExpiry,
  attemptRefresh,
  REFRESH_LEAD_MS,
  WARNING_LEAD_MS,
} from '@/lib/authSession';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const TICK_INTERVAL_MS = 1000;
const MIN_REFRESH_DELAY_MS = 10_000;

type AuthContextValue = { logout: () => void };
const AuthContext = createContext<AuthContextValue | null>(null);

// Owns the whole authenticated-session lifecycle for everything under
// app/(admin)/: the auth guard (replaces the old per-layout localStorage
// check), idle-timeout enforcement (with a "signing out soon" warning),
// silent token refresh while active, and cross-tab logout sync. All actual
// storage/logout logic lives in lib/authSession.ts so api.ts's 401 handler
// can share it without needing a React tree.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!getToken()) {
      // Deep-linking here with no session at all (bookmark, direct URL,
      // token cleared by another tab) — still worth remembering so login
      // returns here instead of dumping the user on /dashboard.
      captureReturnTo();
      router.replace('/login');
      return;
    }

    // Immediate check on mount — catches the "closed the laptop for 2 hours"
    // case the instant the app loads, instead of waiting for an interaction
    // or the tick below to reveal it.
    if (isIdle()) {
      logout();
      return;
    }

    function onActivity() {
      recordActivity();
    }
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));

    // Recomputed every second from the stored last-activity timestamp (not a
    // running counter), so a warning banner + live countdown can be shown in
    // the last minute before idle logout, and it self-corrects regardless of
    // tab throttling.
    const tickInterval = setInterval(() => {
      const remaining = msUntilIdleLogout();
      if (remaining <= 0) {
        logout();
        return;
      }
      setWarningSecondsLeft(remaining <= WARNING_LEAD_MS ? Math.ceil(remaining / 1000) : null);
    }, TICK_INTERVAL_MS);

    function scheduleRefresh() {
      const token = getToken();
      if (!token) return;
      const delay = Math.max(msUntilExpiry(token) - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS);
      refreshTimer.current = setTimeout(async () => {
        // Idle users don't get refreshed — the tick above will log them out
        // on its own; refreshing here would just mask that.
        if (isIdle()) return;
        const ok = await attemptRefresh();
        if (ok) scheduleRefresh();
        else logout();
      }, delay);
    }
    scheduleRefresh();

    // If another tab clears the token (its own idle timeout, a 401, manual
    // sign-out), follow it here too instead of sitting on a stale session.
    function onStorage(e: StorageEvent) {
      if (e.key === TOKEN_KEY && !e.newValue) {
        // sessionStorage is per-tab, so the tab that actually triggered the
        // logout already captured its own path — this tab needs to capture
        // its own too, so logging back in from *this* tab also restores it.
        captureReturnTo();
        router.replace('/login');
      }
    }
    window.addEventListener('storage', onStorage);

    return () => {
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onActivity));
      clearInterval(tickInterval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      window.removeEventListener('storage', onStorage);
    };
  }, [router]);

  function stayLoggedIn() {
    forceRecordActivity();
    setWarningSecondsLeft(null);
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      {children}
      {warningSecondsLeft !== null && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-[200] flex items-center gap-3 rounded-2xl px-4 py-3 text-sm"
          style={{
            background:           'rgba(15,6,39,0.92)',
            backdropFilter:       'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border:               '1px solid rgba(255,255,255,0.12)',
            boxShadow:            '0 8px 32px rgba(0,0,0,0.5)',
            color:                'rgba(255,255,255,0.85)',
          }}
        >
          <span>
            You&apos;ve been inactive — signing out in <strong>{warningSecondsLeft}s</strong>
          </span>
          <button
            onClick={stayLoggedIn}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ background: '#A855F7', color: 'white' }}
          >
            Stay signed in
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
