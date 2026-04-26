'use client';
import Link from 'next/link';
import { useState } from 'react';
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

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <header className="fixed top-0 inset-x-0 z-50"
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--nav-border)',
      }}>
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="font-bold text-lg tracking-tight flex items-center gap-1"
          style={{ color: 'var(--text-1)' }}>
          John
          <span style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            .
          </span>
        </Link>

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

          <a href="/api/profile/resume" className="btn-primary text-sm py-2 px-4">
            Resume ↓
          </a>
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
          <div className="pt-2">
            <a href="/api/profile/resume" className="btn-primary inline-flex text-sm">Resume ↓</a>
          </div>
        </div>
      )}
    </header>
  );
}
