'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeProvider';

const links = [
  { href: '#about',          label: 'About'          },
  { href: '#projects',       label: 'Projects'       },
  { href: '#skills',         label: 'Skills'         },
  { href: '#experience',     label: 'Experience'     },
  { href: '#certifications', label: 'Certifications' },
  { href: '#contact',        label: 'Contact'        },
];

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

type AvailStatus = 'active' | 'passive' | 'not_open';

function PingDot({ status }: { status: AvailStatus }) {
  const isActive   = status === 'active';
  const dotColor   = isActive ? '#4ade80' : '#fbbf24';
  const pingColor1 = isActive ? 'rgba(74,222,128,0.55)' : 'rgba(251,191,36,0.55)';
  const pingColor2 = isActive ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)';
  const glow       = isActive
    ? '0 0 8px 2px #4ade80, 0 0 18px 4px rgba(74,222,128,0.5)'
    : '0 0 8px 2px #fbbf24, 0 0 18px 4px rgba(251,191,36,0.5)';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: '12px', height: '12px', flexShrink: 0 }}>
      {/* Outer slow ring */}
      <span style={{
        position: 'absolute', inset: '-3px', borderRadius: '50%',
        background: pingColor2,
        animation: 'nav-ping 2s cubic-bezier(0,0,0.2,1) infinite',
      }} />
      {/* Inner fast ring */}
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: pingColor1,
        animation: 'nav-ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
      }} />
      {/* Solid core */}
      <span style={{
        position: 'relative', display: 'inline-flex',
        width: '12px', height: '12px', borderRadius: '50%',
        background: dotColor,
        boxShadow: glow,
      }} />
    </span>
  );
}

export default function Navbar({ availabilityStatus }: { availabilityStatus?: AvailStatus }) {
  const [open, setOpen]           = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const resumeRef                 = useRef<HTMLDivElement>(null);
  const { theme, toggle }         = useTheme();

  const showStatus = availabilityStatus && availabilityStatus !== 'not_open';
  const isActive   = availabilityStatus === 'active';

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (resumeRef.current && !resumeRef.current.contains(e.target as Node)) {
        setResumeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header className="fixed top-0 inset-x-0 z-50"
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--nav-border)',
      }}>
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo + availability status */}
        <div className="flex items-center gap-3">
          <Link href="/" className="font-bold text-lg tracking-tight flex items-center gap-1"
            style={{ color: 'var(--text-1)' }}>
            John
            <span style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              .
            </span>
          </Link>

          {showStatus && (
            <>
              {/* Divider — desktop only */}
              <span className="hidden md:block w-px h-4 rounded-full"
                style={{ background: 'var(--border)' }} />

              {/* Full pill — desktop */}
              <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={isActive
                  ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', color: '#22c55e' }
                  : { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', color: '#f59e0b' }
                }>
                <PingDot status={availabilityStatus!} />
                {isActive ? 'Available for opportunities' : 'Open to the right opportunity'}
              </div>

              {/* Dot only — mobile (saves navbar space) */}
              <div className="md:hidden">
                <PingDot status={availabilityStatus!} />
              </div>
            </>
          )}
        </div>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-7">
          {links.map(l => (
            <li key={l.href}>
              <Link href={l.href}
                className="text-sm transition-colors duration-200 relative group"
                style={{ color: 'var(--text-2)' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--text-1)')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--text-2)')}>
                {l.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-violet-500 group-hover:w-full transition-all duration-300" />
              </Link>
            </li>
          ))}
        </ul>

        {/* Right controls */}
        <div className="hidden md:flex items-center gap-2">
          {/* Admin shortcut */}
          <a
            href="https://admin.johnisah.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Admin dashboard"
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-2)', border: '1px solid var(--border)', background: 'transparent' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,58,237,0.5)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.06)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}>
            <AdminIcon />
          </a>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200"
            style={{
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,58,237,0.5)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.06)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Resume dropdown */}
          <div className="relative" ref={resumeRef}>
            <button
              onClick={() => setResumeOpen(o => !o)}
              className="btn-primary text-sm py-2 px-4"
              aria-haspopup="true"
              aria-expanded={resumeOpen}>
              Resume ↓
            </button>
            {resumeOpen && (
              <div
                className="absolute right-0 z-50 mt-1 overflow-hidden rounded-xl shadow-xl"
                style={{ border: '1px solid var(--border-card)', background: 'var(--bg-card)', minWidth: '160px', backdropFilter: 'blur(12px)' }}>
                <a
                  href="/api/profile/resume?lang=en"
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => setResumeOpen(false)}>
                  <span className="text-xs font-bold tracking-wider text-indigo-500">EN</span>
                  CV (English)
                </a>
                <div style={{ height: '1px', background: 'var(--border)' }} />
                <a
                  href="/api/profile/resume?lang=fr"
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => setResumeOpen(false)}>
                  <span className="text-xs font-bold tracking-wider text-indigo-500">FR</span>
                  CV (Français)
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: toggle + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <button onClick={toggle} aria-label="Toggle theme"
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-2)' }}
            onClick={() => setOpen(!open)}>
            <div className="w-5 h-0.5 bg-current" />
            <div className="w-5 h-0.5 bg-current" />
            <div className="w-5 h-0.5 bg-current" />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t px-4 py-4 space-y-1"
          style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}>
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="block text-sm py-2.5 px-3 rounded-lg transition-colors"
              style={{ color: 'var(--text-2)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-1)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-2)')}>
              {l.label}
            </Link>
          ))}
          <div className="pt-2 flex items-center gap-2 flex-wrap">
            <a href="/api/profile/resume?lang=en" className="btn-primary inline-flex text-sm items-center gap-1.5">
              <span className="text-xs font-bold tracking-wider opacity-75">EN</span> Resume ↓
            </a>
            <a href="/api/profile/resume?lang=fr" className="btn-outline inline-flex text-sm items-center gap-1.5">
              <span className="text-xs font-bold tracking-wider opacity-75">FR</span> Resume ↓
            </a>
            <a
              href="https://admin.johnisah.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <AdminIcon />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
