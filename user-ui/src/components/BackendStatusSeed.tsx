'use client';

import { useEffect } from 'react';
import { forceDown } from '@/lib/backendStatus';

/**
 * Bridges a server-computed "did every API call fail" signal into the
 * browser-side backendStatus store. A Server Component can't call
 * client-side store functions directly — this tiny invisible component,
 * rendered by page.tsx with the result already known, is the only way to
 * seed MaintenanceOverlay's state before its first poll tick runs, so a
 * fresh page load during an outage shows the overlay immediately instead
 * of a flash of the empty/broken-looking homepage.
 */
export default function BackendStatusSeed({ down }: { down: boolean }) {
  useEffect(() => {
    if (down) forceDown();
  }, [down]);

  return null;
}
