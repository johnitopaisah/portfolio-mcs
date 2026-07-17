'use client';

// Reports Core Web Vitals + uncaught JS errors to the API's /api/rum
// endpoint (Prometheus-backed — see api/src/routes/rum.js). Uses the same
// relative '/api/*' path as ContactSection.tsx, proxied by Next.js to the
// real API server.

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

const APP_NAME = 'user-ui';
const VITAL_METRICS = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']);

function report(path: string, body: object) {
  fetch(path, {
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
