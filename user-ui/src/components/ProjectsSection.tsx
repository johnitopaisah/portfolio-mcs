'use client';
import { useEffect, useState, useCallback } from 'react';

const projectImageUrl      = (id: string) => `/api/projects/${id}/image`;
const projectSlideImageUrl = (projectId: string, imgId: string) =>
  `/api/projects/${projectId}/images/${imgId}/file`;

interface Project {
  id: string; title: string; description: string; tech_stack: string[];
  live_url?: string; repo_url?: string; has_image: boolean; featured: boolean;
  start_date?: string; end_date?: string; ongoing?: boolean;
}
interface SlideImage {
  id: string; caption: string | null; order_index: number; image_mime: string;
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
  'linear-gradient(135deg,rgba(124,58,237,0.1) 0%,rgba(79,70,229,0.15) 100%)',
  'linear-gradient(135deg,rgba(6,182,212,0.1) 0%,rgba(59,130,246,0.15) 100%)',
  'linear-gradient(135deg,rgba(16,185,129,0.1) 0%,rgba(6,182,212,0.15) 100%)',
  'linear-gradient(135deg,rgba(168,85,247,0.1) 0%,rgba(236,72,153,0.15) 100%)',
  'linear-gradient(135deg,rgba(245,158,11,0.1) 0%,rgba(249,115,22,0.15) 100%)',
  'linear-gradient(135deg,rgba(59,130,246,0.1) 0%,rgba(139,92,246,0.15) 100%)',
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

// ── Duration helper (LinkedIn-style) ─────────────────────────
function calcDuration(start: string, end: string | null | undefined, ongoing: boolean): string {
  if (!start) return '';
  const [fy, fm] = start.split('-').map(Number);
  let ty: number, tm: number;
  if (ongoing || !end) {
    const now = new Date();
    ty = now.getFullYear();
    tm = now.getMonth() + 1;
  } else {
    [ty, tm] = end.split('-').map(Number);
  }
  const total = (ty - fy) * 12 + (tm - fm) + 1;
  if (total <= 0) return '< 1 mo';
  const yrs = Math.floor(total / 12);
  const mos = total % 12;
  const parts: string[] = [];
  if (yrs > 0) parts.push(`${yrs} yr${yrs > 1 ? 's' : ''}`);
  if (mos > 0) parts.push(`${mos} mo`);
  return parts.length ? parts.join(' ') : '< 1 mo';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function calcProgressPct(start?: string, end?: string, ongoing?: boolean): number {
  if (!start) return 0;
  if (!ongoing && end) return 100;
  if (ongoing) {
    const [fy, fm] = start.split('-').map(Number);
    const now = new Date();
    const mos = (now.getFullYear() - fy) * 12 + (now.getMonth() + 1 - fm);
    return Math.min(100, (mos / 24) * 100);
  }
  return 0;
}

function DescriptionParagraphs({
  text,
  className,
  style,
}: {
  text: string;
  className: string;
  style?: React.CSSProperties;
}) {
  const paras = text.split(/\n+/).filter(p => p.trim());
  if (paras.length <= 1) return <p className={className} style={style}>{text}</p>;
  return (
    <div className="space-y-2">
      {paras.map((p, i) => (
        <p key={i} className={className} style={style}>{p}</p>
      ))}
    </div>
  );
}

function TimelineStrip({ p, compact = false }: { p: Project; compact?: boolean }) {
  if (!p.start_date) return null;
  const dur = calcDuration(p.start_date, p.end_date, p.ongoing ?? false);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}
      style={{ color: 'var(--text-3)' }}>
      <span style={{ fontSize: compact ? '11px' : '13px' }}>📅</span>
      <span>
        {fmtDate(p.start_date)}
        <span className="mx-1" style={{ color: 'var(--text-4)' }}>→</span>
        {p.ongoing ? (
          <span className="text-green-500 inline-flex items-center gap-1">
            Present
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          </span>
        ) : (
          <span>{fmtDate(p.end_date)}</span>
        )}
        {dur && <span className="ml-2" style={{ color: 'var(--text-4)' }}>· {dur}</span>}
      </span>
    </div>
  );
}

// ── Slideshow ─────────────────────────────────────────────────
function ImageSlideshow({ projectId, hascover, slides, fullHeight = false }: {
  projectId: string; hascover: boolean; slides: SlideImage[]; fullHeight?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  const allSlides = slides.length > 0
    ? slides.map(s => ({ url: projectSlideImageUrl(projectId, s.id), caption: s.caption }))
    : hascover
      ? [{ url: projectImageUrl(projectId), caption: null }]
      : [];

  const total = allSlides.length;
  const prev = useCallback(() => { setCurrent(c => (c - 1 + total) % total); setLoaded(false); }, [total]);
  const next = useCallback(() => { setCurrent(c => (c + 1) % total); setLoaded(false); }, [total]);

  useEffect(() => {
    if (total <= 1 || paused) return;
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [total, paused, next]);

  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, prev, next]);

  if (total === 0) {
    return (
      <div className={`flex items-center justify-center ${fullHeight ? 'h-full' : 'h-52'}`}
        style={{ background: 'var(--bg-slide)' }}>
        <span className="text-6xl opacity-20">◈</span>
      </div>
    );
  }

  const slide = allSlides[current];

  return (
    <div className={`relative select-none ${fullHeight ? 'h-full' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}>
      <div className={`relative ${fullHeight ? 'h-full' : 'h-64 rounded-t-2xl'}`}
        style={{ background: 'var(--bg-slide)' }}>
        <img key={slide.url + current} src={slide.url}
          alt={slide.caption || `Slide ${current + 1}`}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-contain transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />
        {total > 1 && (
          <>
            <button onClick={prev} aria-label="Previous"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-light transition-all hover:scale-110"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}>‹</button>
            <button onClick={next} aria-label="Next"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-light transition-all hover:scale-110"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)' }}>›</button>
          </>
        )}
        {total > 1 && (
          <div className="absolute top-4 right-4 text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
            {current + 1} / {total}
          </div>
        )}
        {total > 1 && paused && (
          <div className="absolute top-4 left-4 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.5)' }}>⏸</div>
        )}
        {slide.caption && (
          <div className="absolute bottom-6 left-0 right-0 text-center px-6">
            <span className="text-sm text-white/80 bg-black/45 px-3 py-1 rounded-full backdrop-blur-sm">
              {slide.caption}
            </span>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {allSlides.map((_, idx) => (
            <button key={idx} onClick={() => { setCurrent(idx); setLoaded(false); }}
              aria-label={`Go to slide ${idx + 1}`}
              className="transition-all duration-200 rounded-full"
              style={{
                width: idx === current ? '22px' : '6px', height: '6px',
                background: idx === current ? 'rgba(124,58,237,0.95)' : 'rgba(255,255,255,0.3)',
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Full-screen Modal ─────────────────────────────────────────
function ProjectModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [slides, setSlides] = useState<SlideImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${p.id}/images`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setSlides(Array.isArray(d) ? d : []))
      .catch(() => setSlides([]))
      .finally(() => setLoading(false));
  }, [p.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dur = p.start_date ? calcDuration(p.start_date, p.end_date, p.ongoing ?? false) : null;
  const barWidth = Math.max(calcProgressPct(p.start_date, p.end_date, p.ongoing), 8);

  return (
    <div className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="relative flex flex-col md:flex-row w-full h-full"
        onClick={e => e.stopPropagation()}>

        <div className="w-full md:w-[58%] h-[45vh] md:h-full flex-shrink-0 relative"
          style={{ background: 'var(--bg-slide)' }}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ImageSlideshow projectId={p.id} hascover={p.has_image} slides={slides} fullHeight />
          )}
          {p.featured && (
            <div className="absolute top-5 left-5 z-10 text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(124,58,237,0.35)', border: '1px solid rgba(124,58,237,0.6)', color: '#a78bfa', backdropFilter: 'blur(6px)' }}>
              ★ Featured
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-modal)' }}>
          <div className="sticky top-0 z-10 flex justify-end px-6 pt-5 pb-2"
            style={{ background: `linear-gradient(to bottom, var(--bg-modal) 60%, transparent)` }}>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
              aria-label="Close">✕</button>
          </div>

          <div className="px-8 pb-10 space-y-8">
            <h2 className="text-3xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
              {p.title}
            </h2>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>About</p>
              <DescriptionParagraphs
                text={p.description}
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-2)' }}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                Tech stack · {p.tech_stack.length} {p.tech_stack.length === 1 ? 'technology' : 'technologies'}
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

            {p.start_date && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Timeline</p>
                <div className="relative">
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-track)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${barWidth}%`,
                        background: p.ongoing ? 'linear-gradient(90deg,#7c3aed,#22c55e)' : 'linear-gradient(90deg,#7c3aed,#06b6d4)',
                      }} />
                  </div>
                  <div className="absolute -top-1 left-0 w-3 h-3 rounded-full bg-violet-500" />
                  <div className={`absolute -top-1 w-3 h-3 rounded-full ${p.ongoing ? 'bg-green-500 animate-pulse' : 'bg-cyan-400'}`}
                    style={{ right: `${100 - barWidth}%`, transform: 'translateX(50%)' }} />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span style={{ color: 'var(--text-2)' }}>{fmtDate(p.start_date)}</span>
                  <div className="text-center">
                    {dur && <span className="text-violet-400 font-semibold">{dur}</span>}
                    {p.ongoing && <span className="ml-2 text-xs text-green-500">ongoing</span>}
                  </div>
                  <span style={{ color: p.ongoing ? '#22c55e' : 'var(--text-2)', fontWeight: p.ongoing ? 500 : 400 }}>
                    {p.ongoing ? 'Present' : fmtDate(p.end_date)}
                  </span>
                </div>
              </div>
            )}

            {(p.repo_url || p.live_url) && (
              <div className="flex gap-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all duration-200"
                    style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}>
                    Source code ↗
                  </a>
                )}
                {p.live_url && (
                  <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
                    Live demo ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────
export default function ProjectsSection({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Project | null>(null);
  if (!projects.length) return null;

  return (
    <section id="projects" className="relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.07) 0%, transparent 70%)' }} aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Selected work</div>
        <h2 className="section-title">Projects</h2>
        <p className="section-sub">Things I&apos;ve built</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p, i) => (
            <div key={p.id}
              onClick={() => setSelected(p)}
              className="card flex flex-col group overflow-hidden relative cursor-pointer transition-all duration-300 hover:-translate-y-1"
              role="button" tabIndex={0}
              aria-label={`View ${p.title} details`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(p); }}>

              {p.featured && (
                <div className="absolute top-3 right-3 z-10 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}>
                  ★ Featured
                </div>
              )}

              {/* Thumbnail — loading="lazy" skips the request until card enters viewport */}
              <div className="h-44 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl relative">
                {p.has_image ? (
                  <img
                    src={projectImageUrl(p.id)}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
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
                <div className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
              </div>

              <h3 className="font-semibold text-lg mb-2 group-hover:text-violet-500 transition-colors"
                style={{ color: 'var(--text-1)' }}>
                {p.title}
              </h3>
              <div className="mb-3"><TimelineStrip p={p} compact /></div>
              <p className="text-sm leading-relaxed mb-4 line-clamp-3" style={{ color: 'var(--text-2)' }}>
                {p.description}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {p.tech_stack.map((t, ti) => {
                  const c = TAG_COLORS[ti % TAG_COLORS.length];
                  return (
                    <span key={t} className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                      style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>{t}</span>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-sm transition-colors flex items-center gap-1 hover:text-violet-500"
                    style={{ color: 'var(--text-2)' }}>
                    Source <span className="text-xs">↗</span>
                  </a>
                )}
                {p.live_url && (
                  <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-sm transition-colors flex items-center gap-1 hover:text-cyan-500"
                    style={{ color: 'var(--text-2)' }}>
                    Live demo <span className="text-xs">↗</span>
                  </a>
                )}
                <span className="ml-auto text-xs pointer-events-none transition-colors group-hover:text-violet-400"
                  style={{ color: 'var(--text-4)' }}>
                  View details →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && <ProjectModal p={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
