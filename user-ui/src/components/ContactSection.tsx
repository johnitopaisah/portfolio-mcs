'use client';
import { useState } from 'react';

interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  order_index: number;
}

interface Props {
  socialLinks: SocialLink[];
}

// Predefined platform icon map (Strategy 1)
const PLATFORM_META: Record<string, { icon: React.ReactNode; color: string }> = {
  email: {
    color: '#a78bfa',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    ),
  },
  github: {
    color: '#67e8f9',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    ),
  },
  linkedin: {
    color: '#93c5fd',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
        <rect x="2" y="9" width="4" height="12"/>
        <circle cx="4" cy="4" r="2"/>
      </svg>
    ),
  },
  medium: {
    color: '#86efac',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
      </svg>
    ),
  },
  twitter: {
    color: '#7dd3fc',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  youtube: {
    color: '#fca5a5',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
        <polygon fill="white" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
      </svg>
    ),
  },
  website: {
    color: '#fcd34d',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  },
  other: {
    color: '#d4d4d8',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
};

function getMeta(platform: string) {
  return PLATFORM_META[platform] ?? PLATFORM_META.other;
}

export default function ContactSection({ socialLinks }: Props) {
  const [form, setForm]     = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  return (
    <section id="contact" className="relative overflow-hidden">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Get in touch</div>
        <h2 className="section-title">Contact</h2>
        <p className="section-sub">Let&apos;s work together</p>

        {status === 'success' ? (
          <div className="max-w-md mx-auto card text-center py-16">
            <div className="text-5xl mb-4">🚀</div>
            <h3 className="font-semibold text-xl mb-2" style={{ color: 'var(--text-1)' }}>
              Message sent!
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
              I&apos;ll get back to you as soon as possible.
            </p>
            <button onClick={() => setStatus('idle')} className="btn-outline text-sm">
              Send another
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-5 gap-8 max-w-4xl mx-auto">

            {/* Contact links */}
            <div className="md:col-span-2 flex flex-col justify-center gap-4">
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--text-2)' }}>
                Open to DevOps roles, freelance infrastructure projects, and collaboration. I typically respond within 24 hours.
              </p>

              {socialLinks.map(link => {
                const { icon, color } = getMeta(link.platform);
                return (
                  <a key={link.id} href={link.url}
                    target={link.platform === 'email' ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 group"
                    style={{
                      background: 'var(--bg-contact)',
                      border: '1px solid var(--border)',
                    }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `${color}18`,
                        border: `1px solid ${color}44`,
                        color,
                      }}>
                      {icon}
                    </div>
                    <div>
                      <p className="text-xs mb-0.5 capitalize" style={{ color: 'var(--text-3)' }}>
                        {link.platform === 'twitter' ? 'Twitter / X' : link.platform}
                      </p>
                      <p className="text-sm font-medium transition-colors group-hover:text-violet-400 truncate max-w-[180px]"
                        style={{ color: 'var(--text-2)' }}>
                        {link.label}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="md:col-span-3 card space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { name: 'name',  label: 'Name',  type: 'text',  placeholder: 'Your name'      },
                  { name: 'email', label: 'Email', type: 'email', placeholder: 'your@email.com' },
                ].map(f => (
                  <div key={f.name}>
                    <label className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                      style={{ color: 'var(--text-3)' }}>
                      {f.label}
                    </label>
                    <input
                      type={f.type} required placeholder={f.placeholder}
                      value={(form as any)[f.name]}
                      onChange={e => setForm(prev => ({ ...prev, [f.name]: e.target.value }))}
                      className="w-full rounded-lg px-4 py-2.5 text-sm placeholder-zinc-500 transition-colors outline-none"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-input)',
                        color: 'var(--text-1)',
                      }}
                      onFocus={e  => (e.target.style.borderColor = 'var(--border-input-f)')}
                      onBlur={e   => (e.target.style.borderColor = 'var(--border-input)')}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--text-3)' }}>
                  Subject
                </label>
                <input
                  type="text" required placeholder="What is it about?"
                  value={form.subject}
                  onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full rounded-lg px-4 py-2.5 text-sm placeholder-zinc-500 outline-none transition-colors"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--border-input-f)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border-input)')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--text-3)' }}>
                  Message
                </label>
                <textarea
                  required rows={5} placeholder="Tell me about your project or opportunity..."
                  value={form.message}
                  onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full rounded-lg px-4 py-2.5 text-sm placeholder-zinc-500 outline-none transition-colors resize-none"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--border-input-f)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border-input)')}
                />
              </div>

              {status === 'error' && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <span>⚠</span> Something went wrong. Please try again.
                </p>
              )}

              <button type="submit" disabled={status === 'sending'}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60">
                {status === 'sending' ? (
                  <><span className="animate-spin">◌</span> Sending…</>
                ) : (
                  <>Send message →</>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
