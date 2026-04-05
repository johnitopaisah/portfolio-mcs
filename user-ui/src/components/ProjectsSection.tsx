'use client';
import { useState } from 'react';

const projectImageUrl = (id: string) => `/api/projects/${id}/image`;

interface Project {
  id: string; title: string; description: string; tech_stack: string[];
  live_url?: string; repo_url?: string; has_image: boolean; featured: boolean;
  start_date?: string; end_date?: string; ongoing?: boolean;
}

const TAG_COLORS = [
  { color: 'rgba(124,58,237,0.15)',  border: 'rgba(124,58,237,0.35)',  text: '#a78bfa' },
  { color: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',   text: '#fcd34d' },
  { color: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.3)',    text: '#67e8f9' },
  { color: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',   text: '#93c5fd' },
  { color: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)',   text: '#c4b5fd' },
  { color: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',    text: '#86efac' },
  { color: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)',   text: '#fdba74' },
  { color: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.3)',   text: '#f9a8d4' },
];

const GRADIENTS = [
  'linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%)',
  'linear-gradient(135deg,#042c53 0%,#0f172a 100%)',
  'linear-gradient(135deg,#064e3b 0%,#0f172a 100%)',
  'linear-gradient(135deg,#3b0764 0%,#0f172a 100%)',
  'linear-gradient(135deg,#1c1917 0%,#0f172a 100%)',
  'linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%)',
];

function getIcon(tech: string[]): string {
  const t = tech.join(' ').toLowerCase();
  if (t.includes('kubernetes') || t.includes('k8s')) return '⎈';
  if (t.includes('aws') || t.includes('cloud'))       return '☁';
  if (t.includes('docker'))                           return '🐳';
  if (t.includes('terraform'))                        return '◧';
  if (t.includes('python') || t.includes('django'))   return '🐍';
  if (t.includes('react') || t.includes('next'))      return '⚛';
  if (t.includes('linux') || t.includes('bash'))      return '🐧';
  return '◈';
}

function calcDuration(start: string, end: string | null | undefined, ongoing: boolean): string {
  const from  = new Date(start);
  const to    = ongoing || !end ? new Date() : new Date(end);
  const total = (to.getFullYear() - from.getFullYear()) * 12
                + (to.getMonth() - from.getMonth());
  if (total < 0) return '';
  const yrs = Math.floor(total / 12);
  const mos = total % 12;
  const parts: string[] = [];
  if (yrs > 0) parts.push(`${yrs} yr${yrs > 1 ? 's' : ''}`);
  if (mos > 0) parts.push(`${mos} mo`);
  return parts.length ? parts.join(' ') : '< 1 mo';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function calcProgressPct(start: string | undefined, end: string | undefined, ongoing: boolean): number {
  if (!start) return 0;
  if (!ongoing && end) return 100;
  if (ongoing) {
    const mos = (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24 * 30);
    return Math.min(100, (mos / 24) * 100);
  }
  return 0;
}

// ── Paragraph renderer ────────────────────────────────────────
// Splits on one or more consecutive newlines (\n or \n\n) so
// descriptions render correctly regardless of how they were
// typed in the admin textarea (single Enter or double Enter).
function DescriptionParagraphs({ text, className }: { text: string; className: string }) {
  const paras = text.split(/\n+/).filter(p => p.trim());
  if (paras.length <= 1) {
    return <p className={className}>{text}</p>;
  }
  return (
    <>
      {paras.map((para, idx) => (
        <p key={idx} className={className}>{para}</p>
      ))}
    </>
  );
}

// ── Timeline strip ────────────────────────────────────────────
function TimelineStrip({ p, compact = false }: { p: Project; compact?: boolean }) {
  if (!p.start_date) return null;
  const dur = calcDuration(p.start_date, p.end_date, p.ongoing ?? false);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} text-zinc-500`}>
      <span style={{ fontSize: compact ? '11px' : '13px' }}>📅</span>
      <span>
        {fmtDate(p.start_date)}
        <span className="mx-1 text-zinc-600">→</span>
        {p.ongoing ? (
          <span className="text-green-400 inline-flex items-center gap-1">
            Present
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          </span>
        ) : (
          <span>{fmtDate(p.end_date)}</span>
        )}
        {dur && <span className="ml-2 text-zinc-600">· {dur}</span>}
      </span>
    </div>
  );
}

// ── Project detail modal ──────────────────────────────────────
function ProjectModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const dur         = p.start_date
    ? calcDuration(p.start_date, p.end_date, p.ongoing ?? false)
    : null;
  const progressPct = calcProgressPct(p.start_date, p.end_date, p.ongoing ?? false);
  const barWidth    = Math.max(progressPct, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: '#18181b',
          border: '1px solid rgba(124,58,237,0.25)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 60px rgba(124,58,237,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-52 rounded-t-2xl overflow-hidden relative">
          {p.has_image ? (
            <img src={projectImageUrl(p.id)} alt={p.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%)' }}>
              <span className="text-6xl opacity-40">{getIcon(p.tech_stack)}</span>
            </div>
          )}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, #18181b 0%, transparent 50%)' }} />
          {p.featured && (
            <div className="absolute top-4 left-4 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.5)', color: '#a78bfa' }}>
              ★ Featured
            </div>
          )}
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
                       text-zinc-400 hover:text-white transition-colors"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            ✕
          </button>
        </div>

        <div className="p-8 space-y-7">

          <h2 className="text-2xl font-bold text-white leading-tight">{p.title}</h2>

          {/* Timeline */}
          {p.start_date && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Timeline</p>
              <div className="relative">
                <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${barWidth}%`,
                      background: p.ongoing
                        ? 'linear-gradient(90deg, #7c3aed, #22c55e)'
                        : 'linear-gradient(90deg, #7c3aed, #06b6d4)',
                    }} />
                </div>
                <div className="absolute -top-1 left-0 w-3 h-3 rounded-full bg-violet-500" />
                <div className={`absolute -top-1 w-3 h-3 rounded-full ${
                  p.ongoing ? 'bg-green-400 animate-pulse' : 'bg-cyan-400'
                }`} style={{ right: `${100 - barWidth}%`, transform: 'translateX(50%)' }} />
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">{fmtDate(p.start_date)}</span>
                <div className="text-center">
                  {dur && <span className="text-violet-300 font-semibold">{dur}</span>}
                  {p.ongoing && <span className="ml-2 text-xs text-green-400">ongoing</span>}
                </div>
                <span className={p.ongoing ? 'text-green-400 font-medium' : 'text-zinc-400'}>
                  {p.ongoing ? 'Present' : fmtDate(p.end_date)}
                </span>
              </div>
            </div>
          )}

          {/* Description — split on any newline sequence */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">About</p>
            <div className="space-y-3">
              <DescriptionParagraphs
                text={p.description}
                className="text-zinc-300 text-sm leading-relaxed"
              />
            </div>
          </div>

          {/* Tech stack */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Tech stack · {p.tech_stack.length} technologies
            </p>
            <div className="flex flex-wrap gap-2">
              {p.tech_stack.map((tag, ti) => {
                const c = TAG_COLORS[ti % TAG_COLORS.length];
                return (
                  <span key={tag} className="text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>
                    {tag}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Links */}
          {(p.repo_url || p.live_url) && (
            <div className="flex gap-3 pt-2 border-t border-zinc-800">
              {p.repo_url && (
                <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                             text-sm font-medium text-zinc-300 hover:text-white
                             transition-all duration-200 hover:bg-zinc-800"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  Source code ↗
                </a>
              )}
              {p.live_url && (
                <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                             text-sm font-medium text-white transition-all duration-200
                             hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    boxShadow: '0 0 20px rgba(124,58,237,0.3)',
                  }}>
                  Live demo ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────
export default function ProjectsSection({ projects }: { projects: Project[] }) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  if (!projects.length) return null;

  return (
    <section id="projects" className="relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.08) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Selected work</div>
        <h2 className="section-title">Projects</h2>
        <p className="section-sub">Things I&apos;ve built</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p, i) => (
            <div key={p.id} className="card flex flex-col group overflow-hidden relative">
              {p.featured && (
                <div className="absolute top-3 right-3 z-10 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}>
                  ★ Featured
                </div>
              )}

              {/* Thumbnail */}
              <div className="h-44 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl relative">
                {p.has_image ? (
                  <img src={projectImageUrl(p.id)} alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl opacity-60">{getIcon(p.tech_stack)}</span>
                      <div className="flex gap-1">
                        {p.tech_stack.slice(0, 3).map((t, ti) => {
                          const c = TAG_COLORS[ti % TAG_COLORS.length];
                          return (
                            <span key={t} className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>
                              {t}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-12"
                  style={{ background: 'linear-gradient(to top, rgba(24,24,27,0.8), transparent)' }} />
              </div>

              <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-violet-300 transition-colors">
                {p.title}
              </h3>

              <div className="mb-3">
                <TimelineStrip p={p} compact />
              </div>

              {/* Card description — clamp to 3 lines, no paragraph splitting needed here */}
              <p className="text-zinc-400 text-sm leading-relaxed mb-2 line-clamp-3">
                {p.description}
              </p>

              <button onClick={() => setSelectedProject(p)}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors
                           text-left mb-4 flex items-center gap-1 group/btn">
                Read more
                <span className="group-hover/btn:translate-x-0.5 transition-transform">→</span>
              </button>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {p.tech_stack.map((t, ti) => {
                  const c = TAG_COLORS[ti % TAG_COLORS.length];
                  return (
                    <span key={t} className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                      style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>
                      {t}
                    </span>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-auto pt-4 border-t border-zinc-800">
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-zinc-400 hover:text-violet-400 transition-colors flex items-center gap-1">
                    Source <span className="text-xs">↗</span>
                  </a>
                )}
                {p.live_url && (
                  <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors flex items-center gap-1">
                    Live demo <span className="text-xs">↗</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedProject && (
        <ProjectModal p={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </section>
  );
}
