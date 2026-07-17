/**
 * Backend reachability tracker — browser-only singleton, not a React
 * context. Lets non-component code (lib/api.ts's request()/upload())
 * report failures directly, and lets MaintenanceOverlay subscribe via
 * useSyncExternalStore without prop-drilling a provider through the tree.
 *
 * Unlike user-ui, admin-ui has no server-side data fetching (every page
 * is 'use client'), so there's no SSR-seeding counterpart here.
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
  return false; // layout.tsx server-renders this component's initial HTML — always assume "up"
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

// A resolved 502/503/504 means something upstream is unreachable — treat
// it the same as a thrown fetch() error. Any other status (2xx, 4xx,
// other 5xx) proves the server responded, so it counts as reachable.
export function isOutageStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}
