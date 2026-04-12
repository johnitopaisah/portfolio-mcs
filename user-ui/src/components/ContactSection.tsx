'use client';
import { useState } from 'react';

export default function ContactSection() {
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

  const contactLinks = [
    { label: 'Email',    icon: '✉',  href: 'mailto:johnitopaisah@gmail.com',         value: 'johnitopaisah@gmail.com',        color: '#a78bfa' },
    { label: 'GitHub',   icon: '⌥',  href: 'https://github.com/johnitopaisah',       value: 'github.com/johnitopaisah',       color: '#67e8f9' },
    { label: 'LinkedIn', icon: '⋈',  href: 'https://linkedin.com/in/johnitopaisah', value: 'linkedin.com/in/johnitopaisah',  color: '#93c5fd' },
  ];

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

              {contactLinks.map(c => (
                <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 group"
                  style={{
                    background: 'var(--bg-contact)',
                    border: '1px solid var(--border)',
                  }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${c.color}18`,
                      border: `1px solid ${c.color}44`,
                      color: c.color,
                      fontSize: '16px',
                    }}>
                    {c.icon}
                  </div>
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{c.label}</p>
                    <p className="text-sm font-medium transition-colors group-hover:text-violet-400 truncate max-w-[180px]"
                      style={{ color: 'var(--text-2)' }}>
                      {c.value}
                    </p>
                  </div>
                </a>
              ))}
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
