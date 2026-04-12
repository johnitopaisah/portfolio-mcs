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

// ── Duration helper ───────────────────────────────────────────
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

function calcProgressPct(start: string | undefined, end: string | undefined, ongoing: boolean): number {
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

function DescriptionParagraphs({ text, className }: { text: string; className: string }) {
  const paras = text.split(/\n+/).filter(p => p.trim());
  if (paras.length <= 1) return <p className={className}>{text}</p>;
  return (
    <>
      {paras.map((para, idx) => (
        <p key={idx} className={className}>{para}</p>
      ))}
    </>
  );
}

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

// ── Full-screen Image Slideshow ───────────────────────────────
function ImageSlideshow({
  projectId,
  hascover,
  slides,
  fullHeight = false,
}: {
  projectId: string;
  hascover: boolean;
  slides: SlideImage[];
  fullHeight?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  const allSlides: Array<{ url: string; caption: string | null }> =
    slides.length > 0
      ? slides.map(s => ({ url: projectSlideImageUrl(projectId, s.id), caption: s.caption }))
      : hascover
        ? [{ url: projectImageUrl(projectId), caption: null }]
        : [];

  const total = allSlides.length;

  const prev = useCallback(() => { setCurrent(c => (c - 1 + total) % total); setLoaded(false); }, [total]);
  const next = useCallback(() => { setCurrent(c => (c + 1) % total);         setLoaded(false); }, [total]);

  useEffect(() => {
    if (total <= 1 || paused) return;
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [total, paused, next]);

  useEffect(() => {
    if (total <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, prev, next]);

  if (total === 0) {
    return (
      <div className={`flex items-center justify-center ${fullHeight ? 'h-full' : 'h-52'}`}
        style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%)' }}>
        <span className="text-6xl opacity-20">◈</span>
      </div>
    );
  }

  const slide = allSlides[current];

  return (
    <div className={`relative select-none ${fullHeight ? 'h-full' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}>

      {/*
        object-contain — shows the FULL image without cropping.
        This is correct for dashboard screenshots (wide 16:9) which
        would be severely cut by object-cover in a tall panel.
        The bg-zinc-950 background fills any letterbox gaps cleanly.

        object-cover is intentionally kept ONLY on the card thumbnail
        (below in ProjectsSection) where cropping is acceptable.
      */}
      <div className={`relative bg-zinc-950 ${fullHeight ? 'h-full' : 'h-64 rounded-t-2xl'}`}>
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
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }} />
        {total > 1 && (
          <>
            <button onClick={prev} aria-label="Previous slide"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                         flex items-center justify-center text-white text-xl font-light
                         transition-all hover:scale-110 active:scale-95"
              style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)' }}>‹</button>
            <button onClick={next} aria-label="Next slide"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                         flex items-center justify-center text-white text-xl font-light
                         transition-all hover:scale-110 active:scale-95"
              style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)' }}>›</button>
          </>
        )}
        {total > 1 && (
          <div className="absolute top-4 right-4 text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.75)' }}>
            {current + 1} / {total}
          </div>
        )}
        {total > 1 && paused && (
          <div className="absolute top-4 left-4 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.45)' }}>⏸</div>
        )}
        {slide.caption && (
          <div className="absolute bottom-6 left-0 right-0 text-center px-6">
            <span className="text-sm text-white/80 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
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
                width:      idx === current ? '22px' : '6px',
                height:     '6px',
                background: idx === current ? 'rgba(124,58,237,0.95)' : 'rgba(255,255,255,0.25)',
              }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Full-screen Project Modal ─────────────────────────────────
function ProjectModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [slides, setSlides]               = useState<SlideImage[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(true);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setSlidesLoading(true);
    fetch(`/api/projects/${p.id}/images`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setSlides(Array.isArray(data) ? data : []))
      .catch(() => setSlides([]))
      .finally(() => setSlidesLoading(false));
  }, [p.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dur         = p.start_date ? calcDuration(p.start_date, p.end_date, p.ongoing ?? false) : null;
  const progressPct = calcProgressPct(p.start_date, p.end_date, p.ongoing ?? false);
  const barWidth    = Math.max(progressPct, 8);

  return (
    <div className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="relative flex flex-col md:flex-row w-full h-full"
        onClick={e => e.stopPropagation()}>

        <div className="w-full md:w-[58%] h-[45vh] md:h-full flex-shrink-0 relative bg-zinc-950">
          {slidesLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ImageSlideshow projectId={p.id} hascover={p.has_image} slides={slides} fullHeight />
          )}
          {p.featured && (
            <div className="absolute top-5 left-5 z-10 text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(124,58,237,0.35)', border: '1px solid rgba(124,58,237,0.6)',
                       color: '#a78bfa', backdropFilter: 'blur(6px)' }}>
              ★ Featured
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: '#0f0f11' }}>
          <div className="sticky top-0 z-10 flex justify-end px-6 pt-5 pb-2"
            style={{ background: 'linear-gradient(to bottom, #0f0f11 60%, transparent)' }}>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center
                         text-zinc-400 hover:text-white transition-all hover:bg-zinc-800"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }} aria-label="Close">✕</button>
          </div>

          <div className="px-8 pb-10 space-y-8">
            <h2 className="text-3xl font-bold text-white leading-tight tracking-tight">{p.title}</h2>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">About</p>
              <div className="space-y-3">
                <DescriptionParagraphs text={p.description} className="text-zinc-300 text-sm leading-relaxed" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
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

            {(p.repo_url || p.live_url) && (
              <div className="flex gap-3 pt-2 border-t border-zinc-800/60">
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               text-sm font-medium text-zinc-300 hover:text-white
                               transition-all duration-200 hover:bg-zinc-800"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    Source code ↗
                  </a>
                )}
                {p.live_url && (
                  <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               text-sm font-medium text-white transition-all duration-200
                               hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                             boxShadow: '0 0 24px rgba(124,58,237,0.35)' }}>
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
            <div key={p.id}
              onClick={() => setSelectedProject(p)}
              className="card flex flex-col group overflow-hidden relative cursor-pointer
                         transition-all duration-300 hover:-translate-y-1"
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.45)';
                (e.currentTarget as HTMLDivElement).style.boxShadow   = '0 8px 32px rgba(124,58,237,0.15)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow   = '';
              }}
              role="button" tabIndex={0}
              aria-label={`View ${p.title} details`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedProject(p); }}>

              {p.featured && (
                <div className="absolute top-3 right-3 z-10 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}>
                  ★ Featured
                </div>
              )}

              {/* Card thumbnail — object-cover is correct here: crops to fill the fixed-height preview */}
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
              <div className="mb-3"><TimelineStrip p={p} compact /></div>
              <p className="text-zinc-400 text-sm leading-relaxed mb-4 line-clamp-3">{p.description}</p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {p.tech_stack.map((t, ti) => {
                  const c = TAG_COLORS[ti % TAG_COLORS.length];
                  return (
                    <span key={t} className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                      style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>{t}</span>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-auto pt-4 border-t border-zinc-800">
                {p.repo_url && (
                  <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-sm text-zinc-400 hover:text-violet-400 transition-colors flex items-center gap-1">
                    Source <span className="text-xs">↗</span>
                  </a>
                )}
                {p.live_url && (
                  <a href={p.live_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors flex items-center gap-1">
                    Live demo <span className="text-xs">↗</span>
                  </a>
                )}
                <span className="ml-auto text-xs text-zinc-600 group-hover:text-zinc-500 transition-colors
                                 flex items-center gap-1 pointer-events-none">
                  View details →
                </span>
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
