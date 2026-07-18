'use client';

// Reports Core Web Vitals + uncaught JS errors to the API's /api/rum
// endpoint (Prometheus-backed — see api/src/routes/rum.js). Deliberately
// does NOT use lib/api.ts's request() helper: that helper redirects to
// /login on a 401, which must never happen as a side effect of a
// best-effort telemetry beacon.

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

const APP_NAME = 'admin-ui';
const VITAL_METRICS = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']);

function rumBase(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return url ? url.replace(/\/$/, '') : null;
}

function report(path: string, body: object) {
  const base = rumBase();
  if (!base) return; // no-op if API URL isn't configured, e.g. local dev
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function RumReporter() {
  useReportWebVitals((metric) => {
    if (!VITAL_METRICS.has(metric.name)) return;
    report('/api/rum', {
      app: APP_NAME,
      metric: metric.name,
      value: metric.value,
      route: window.location.pathname,
    });
  });

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report('/api/rum/error', { app: APP_NAME, message: String(event.message || 'unknown error').slice(0, 500) });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || String(event.reason || 'unhandled rejection');
      report('/api/rum/error', { app: APP_NAME, message: String(message).slice(0, 500) });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
