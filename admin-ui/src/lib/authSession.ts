// Single source of truth for admin session storage + lifecycle.
// Plain functions (no React) so both api.ts (a fetch wrapper) and
// AuthProvider (a React context) can share one logout/refresh/idle
// implementation instead of each hand-rolling their own.

export const TOKEN_KEY = 'admin_token';
const LAST_ACTIVITY_KEY = 'admin_last_activity';
const RETURN_TO_KEY = 'admin_return_to';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const WARNING_LEAD_MS = 60 * 1000;
export const REFRESH_LEAD_MS = 5 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5000;

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Setting a token — via fresh login or silent refresh — always means the
// session is active *now*, so this stamps activity too. Without this, a
// stale admin_last_activity left over from a prior idle-logout would make
// AuthProvider's mount-time isIdle() check fire immediately after a fresh
// login, bouncing straight back to /login in a loop.
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  forceRecordActivity();
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

let lastActivityWrite = 0;

// Throttled — called on every real user input event, so this must stay cheap.
export function recordActivity() {
  const now = Date.now();
  if (now - lastActivityWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
  lastActivityWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
}

// Unthrottled — for the explicit "Stay signed in" button, where the click
// itself must count immediately rather than possibly landing inside the
// throttle window and silently no-opping.
export function forceRecordActivity() {
  const now = Date.now();
  lastActivityWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
}

function getLastActivity(): number {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  return raw ? Number(raw) : Date.now();
}

// Recomputed from the stored timestamp every call (not a running counter),
// so it self-corrects even if the tab was backgrounded/throttled by the
// browser between checks.
export function msUntilIdleLogout(): number {
  return IDLE_TIMEOUT_MS - (Date.now() - getLastActivity());
}

export function isIdle(): boolean {
  return msUntilIdleLogout() <= 0;
}

export function captureReturnTo() {
  const path = window.location.pathname + window.location.search;
  if (path.startsWith('/login')) return;
  sessionStorage.setItem(RETURN_TO_KEY, path);
}

export function consumeReturnTo(): string {
  const path = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return path || '/dashboard';
}

let loggingOut = false;

// Captures the current page (for post-relogin restore), clears the token,
// and hard-navigates to /login. Idempotent — safe to call from multiple
// triggers (401 response, idle timer, cross-tab sync) without double-firing.
export function logout() {
  if (loggingOut) return;
  loggingOut = true;
  captureReturnTo();
  clearToken();
  window.location.href = '/login';
}

function decodeExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Falls back to REFRESH_LEAD_MS if exp can't be decoded, so a malformed
// token still gets a refresh attempt soon rather than never.
export function msUntilExpiry(token: string): number {
  const expMs = decodeExpMs(token);
  return expMs !== null ? expMs - Date.now() : REFRESH_LEAD_MS;
}

// Silently exchanges the current token for a fresh one via /api/auth/refresh.
// Only ever called while the user is within the idle window, so a refresh
// failure here means the token itself is no longer valid (not just idle).
export async function attemptRefresh(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiBase) return false;
  try {
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}
