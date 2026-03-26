'use client';
import Link from 'next/link';
import { useState } from 'react';

const links = [
  { href: '#about',          label: 'About'          },
  { href: '#projects',       label: 'Projects'       },
  { href: '#skills',         label: 'Skills'         },
  { href: '#experience',     label: 'Experience'     },
  { href: '#certifications', label: 'Certifications' },
  { href: '#contact',        label: 'Contact'        },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50"
      style={{ background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(39,39,42,0.8)' }}>
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="text-white font-bold text-lg tracking-tight flex items-center gap-1">
          John
          <span style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>.</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-7">
          {links.map(l => (
            <li key={l.href}>
              <Link href={l.href}
                className="text-sm text-zinc-400 hover:text-white transition-colors duration-200 relative group">
                {l.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-violet-500 group-hover:w-full transition-all duration-300" />
              </Link>
            </li>
          ))}
        </ul>

        {/* Resume CTA */}
        <a href="/api/profile/resume"
          className="hidden md:inline-flex btn-primary text-sm py-2 px-4">
          Resume ↓
        </a>

        {/* Mobile hamburger */}
        <button className="md:hidden text-zinc-400 hover:text-white p-2" onClick={() => setOpen(!open)}>
          <div className="w-5 h-0.5 bg-current mb-1" />
          <div className="w-5 h-0.5 bg-current mb-1" />
          <div className="w-5 h-0.5 bg-current" />
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-zinc-900/95 border-t border-zinc-800 px-4 py-4 space-y-3">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="block text-sm text-zinc-300 hover:text-white py-2 transition-colors">
              {l.label}
            </Link>
          ))}
          <a href="/api/profile/resume" className="btn-primary inline-flex text-sm mt-2">Resume ↓</a>
        </div>
      )}
    </header>
  );
}
