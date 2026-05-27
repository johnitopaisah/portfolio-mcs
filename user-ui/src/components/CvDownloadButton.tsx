'use client';
import { useEffect, useRef, useState } from 'react';

export default function CvDownloadButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-outline"
        aria-haspopup="true"
        aria-expanded={open}
      >
        Download CV ↓
      </button>

      {open && (
        <div
          className="absolute left-0 z-20 mt-1 overflow-hidden rounded-lg shadow-xl"
          style={{ border: '1px solid rgba(255,255,255,0.1)', background: '#111827', minWidth: '160px' }}
        >
          <a
            href="/api/profile/resume?lang=en"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
            style={{ color: '#e5e7eb' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            <span className="text-xs font-bold tracking-wider text-indigo-400">EN</span>
            CV (English)
          </a>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <a
            href="/api/profile/resume?lang=fr"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
            style={{ color: '#e5e7eb' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            <span className="text-xs font-bold tracking-wider text-indigo-400">FR</span>
            CV (Français)
          </a>
        </div>
      )}
    </div>
  );
}
