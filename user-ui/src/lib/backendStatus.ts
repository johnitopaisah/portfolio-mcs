/**
 * Backend reachability tracker — browser-only singleton, not a React
 * context. This lets non-component code (jobsApi.ts, ContactSection's
 * fetch) report failures directly, and lets MaintenanceOverlay subscribe
 * via useSyncExternalStore without prop-drilling a provider through the
 * component tree.
 *
 * Only ever imported by client components — never by lib/api.ts's
 * server-side get(), which runs in the Node SSR process and has no way
 * to reach this browser-side module anyway.
 */

const FAILURE_THRESHOLD = 3; // consecutive failures before flipping to "down"

let consecutiveFailures = 0;
let down = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): boolean {
  return down;
}

export function getServerSnapshot(): boolean {
  return false; // SSR render always assumes "up" — BackendStatusSeed corrects it post-hydration
}

export function reportSuccess() {
  consecutiveFailures = 0;
  if (down) {
    down = false;
    notify();
  }
}

export function reportFailure() {
  consecutiveFailures += 1;
  if (!down && consecutiveFailures >= FAILURE_THRESHOLD) {
    down = true;
    notify();
  }
}

// Seeds "down" immediately, bypassing the consecutive-failure threshold —
// used only when the server already knows every request failed (see
// BackendStatusSeed.tsx), so the very first client paint is correct.
export function forceDown() {
  consecutiveFailures = FAILURE_THRESHOLD;
  if (!down) {
    down = true;
    notify();
  }
}

// A resolved 502/503/504 means something upstream is unreachable (the
// proxy in middleware.ts returns 502 for exactly this reason) — treat it
// the same as a thrown fetch() error. Any other status (2xx, 4xx, other
// 5xx) proves the server responded, so it counts as reachable.
export function isOutageStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}
