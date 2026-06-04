'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

// ── Star field animation ──────────────────────────────────────
interface StarConfig {
  enabled: boolean;
  count: number;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  speed: 'slow' | 'normal' | 'fast';
  sparkle_ratio: number;
  mask_start: number;
  colors: string[];
}

const DEFAULT_COLORS = ['#a78bfa', '#67e8f9', '#fcd34d', '#f9a8d4', '#ffffff', '#c4b5fd', '#86efac'];

const DEFAULT_STAR_CONFIG: StarConfig = {
  enabled: true, count: 32, size: 'md', speed: 'normal',
  sparkle_ratio: 0.55, mask_start: 28, colors: DEFAULT_COLORS,
};

const SIZE_MAP: Record<string, [number, number]> = {
  xs: [1.5, 3.5], sm: [2.5, 5], md: [3.5, 7], lg: [5, 9], xl: [7, 13],
};

const SPEED_MAP: Record<string, [number, number]> = {
  slow: [3, 6], normal: [1.8, 4.2], fast: [0.8, 2],
};

interface Star {
  id: number; x: number; y: number;
  size: number; color: string;
  duration: number; delay: number; type: 'dot' | 'sparkle';
}

function generateStars(cfg: StarConfig): Star[] {
  const [minSz, maxSz]   = SIZE_MAP[cfg.size]   ?? SIZE_MAP.md;
  const [minDur, maxDur] = SPEED_MAP[cfg.speed]  ?? SPEED_MAP.normal;
  const colors = cfg.colors.length > 0 ? cfg.colors : DEFAULT_COLORS;
  return Array.from({ length: cfg.count }, (_, i) => ({
    id:       i,
    x:        Math.random() * 100,
    y:        Math.random() * 100,
    size:     minSz + Math.random() * (maxSz - minSz),
    color:    colors[Math.floor(Math.random() * colors.length)],
    duration: minDur + Math.random() * (maxDur - minDur),
    delay:    Math.random() * 3.5,
    type:     Math.random() < cfg.sparkle_ratio ? 'sparkle' : 'dot',
  }));
}

function StarField({ config = DEFAULT_STAR_CONFIG }: { config?: StarConfig | null }) {
  const cfg = config ?? DEFAULT_STAR_CONFIG;
  const [stars] = useState<Star[]>(() => generateStars(cfg));
  const maskStyle = `radial-gradient(ellipse 52% 48% at 50% 50%, transparent ${cfg.mask_start}%, rgba(0,0,0,0.5) ${cfg.mask_start + 24}%, black ${cfg.mask_start + 47}%)`;

  return (
    <>
      <style>{`
        @keyframes twinkle-star {
          0%,100% { opacity: 0; transform: translate(-50%,-50%) scale(0.3); }
          50%      { opacity: 1; transform: translate(-50%,-50%) scale(1);   }
        }
      `}</style>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 2, maskImage: maskStyle, WebkitMaskImage: maskStyle }}
      >
        {stars.map(s => (
          <div
            key={s.id}
            style={{
              position:  'absolute',
              left:      `${s.x}%`,
              top:       `${s.y}%`,
              transform: 'translate(-50%,-50%) scale(0.3)',
              animation: `twinkle-star ${s.duration}s ease-in-out ${s.delay}s infinite`,
              ...(s.type === 'dot' ? {
                width:        `${s.size}px`,
                height:       `${s.size}px`,
                borderRadius: '50%',
                background:   s.color,
                boxShadow:    `0 0 ${s.size * 3}px ${s.size * 1.5}px ${s.color}`,
              } : {
                fontSize:   `${s.size * 5}px`,
                lineHeight: 1,
                color:      s.color,
                textShadow: `0 0 ${s.size * 4}px ${s.color}, 0 0 ${s.size * 8}px ${s.color}`,
                userSelect: 'none',
              }),
            }}
          >
            {s.type === 'sparkle' ? '✦' : null}
          </div>
        ))}
      </div>
    </>
  );
}

interface Referee {
  id: string;
  name: string;
  title: string;
  organization: string;
  relationship: string;
  review?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  available_on_request: boolean;
  has_photo: boolean;
  has_org_logo: boolean;
  star_config?: StarConfig | null;
}

const GRADIENTS = [
  'linear-gradient(135deg,rgba(124,58,237,0.25) 0%,rgba(79,70,229,0.35) 100%)',
  'linear-gradient(135deg,rgba(6,182,212,0.2) 0%,rgba(59,130,246,0.3) 100%)',
  'linear-gradient(135deg,rgba(16,185,129,0.2) 0%,rgba(6,182,212,0.3) 100%)',
  'linear-gradient(135deg,rgba(168,85,247,0.2) 0%,rgba(236,72,153,0.3) 100%)',
];

function LinkedInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  );
}

function ReviewText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  return (
    <div className="space-y-2">
      {paragraphs.map((para, i) => (
        <p key={i} className="italic text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {i === 0 && <>&ldquo;</>}
          {para.split('\n').map((line, j, arr) => (
            <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
          ))}
          {i === paragraphs.length - 1 && <>&rdquo;</>}
        </p>
      ))}
    </div>
  );
}

// ── Full-screen modal (mirrors ProjectModal) ───────────────────
function RefereeModal({ ref: r, onClose }: { ref: Referee; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="relative flex flex-col md:flex-row w-full h-full"
        onClick={e => e.stopPropagation()}>

        {/* Left — photo panel */}
        <div className="w-full md:w-[42%] h-[40vh] md:h-full flex-shrink-0 flex items-center justify-center relative overflow-hidden"
          style={{ background: 'rgba(10,10,20,0.98)' }}>
          {r.has_photo ? (
            <img src={api.refereePhotoUrl(r.id)} alt={r.name}
              className="w-full h-full object-cover object-top" />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full flex items-center justify-center text-6xl font-bold"
                style={{
                  width: '160px', height: '160px',
                  background: 'rgba(124,58,237,0.15)',
                  border: '3px solid rgba(124,58,237,0.4)',
                  color: '#a78bfa',
                }}>
                {r.name.charAt(0)}
              </div>
            </div>
          )}

          {/* Glittering star field — edges bright, fades to clear at center */}
          {(r.star_config?.enabled !== false) && (
            <StarField config={r.star_config} />
          )}

          {/* Gradient overlay at bottom */}
          <div className="absolute inset-x-0 bottom-0 h-32 pointer-events-none md:hidden"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
        </div>

        {/* Right — details panel */}
        <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-modal)' }}>
          {/* Close button */}
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

          <div className="px-8 pb-10 space-y-7">
            {/* Name + title */}
            <div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-1)' }}>
                {r.name}
              </h2>
              <p className="text-base font-medium mt-1" style={{ color: '#06b6d4' }}>{r.title}</p>
            </div>

            {/* Organisation */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Organisation</p>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                {r.has_org_logo ? (
                  <img src={api.refereeOrgLogoUrl(r.id)} alt={r.organization}
                    className="w-8 h-8 object-contain rounded flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 text-base"
                    style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
                    🏢
                  </div>
                )}
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{r.organization}</span>
              </div>
            </div>

            {/* Relationship */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Relationship</p>
              <span className="inline-block text-sm px-3 py-1 rounded-full"
                style={{
                  background: 'rgba(124,58,237,0.12)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  color: '#a78bfa',
                }}>
                {r.relationship}
              </span>
            </div>

            {/* Review */}
            {r.review && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Testimonial</p>
                <blockquote className="pl-4" style={{ borderLeft: '2px solid rgba(124,58,237,0.5)' }}>
                  <ReviewText text={r.review} />
                </blockquote>
              </div>
            )}

            {/* Contact + links */}
            <div className="pt-2 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Contact</p>
              <div className="flex flex-wrap gap-2">
                {r.linkedin_url && (
                  <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-all"
                    style={{ background: 'rgba(10,102,194,0.12)', border: '1px solid rgba(10,102,194,0.3)', color: '#60a5fa' }}>
                    <LinkedInIcon /> LinkedIn ↗
                  </a>
                )}
                {r.available_on_request ? (
                  <span className="inline-flex items-center text-sm px-4 py-2 rounded-xl"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fcd34d' }}>
                    Contact available on request
                  </span>
                ) : (
                  <>
                    {r.email && (
                      <a href={`mailto:${r.email}`}
                        className="text-sm px-4 py-2 rounded-xl transition-all"
                        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
                        {r.email}
                      </a>
                    )}
                    {r.phone && (
                      <a href={`tel:${r.phone}`}
                        className="text-sm px-4 py-2 rounded-xl transition-all"
                        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
                        {r.phone}
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────
export default function RefereesSection({ referees }: { referees: Referee[] }) {
  const [selected, setSelected] = useState<Referee | null>(null);

  if (!referees.length) return null;

  return (
    <section id="referees" className="relative overflow-hidden">
      <div className="absolute bottom-0 left-1/3 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Professional references</div>
        <h2 className="section-title">Referees</h2>
        <p className="section-sub">People I&apos;ve worked with</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {referees.map((ref, i) => (
            <div key={ref.id}
              onClick={() => setSelected(ref)}
              className="card flex flex-col group overflow-hidden relative cursor-pointer transition-all duration-300 hover:-translate-y-1"
              role="button" tabIndex={0}
              aria-label={`View ${ref.name}'s profile`}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(ref); }}>

              {/* Photo banner — mirrors project thumbnail */}
              <div className="h-48 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl relative">
                {ref.has_photo ? (
                  <img src={api.refereePhotoUrl(ref.id)} alt={ref.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                    <span className="text-6xl font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {ref.name.charAt(0)}
                    </span>
                  </div>
                )}
                {/* Bottom gradient fade */}
                <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
                {/* Org logo bottom-left over the banner */}
                {ref.has_org_logo && (
                  <div className="absolute bottom-3 left-4 w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.9)', padding: '3px' }}>
                    <img src={api.refereeOrgLogoUrl(ref.id)} alt={ref.organization}
                      className="w-full h-full object-contain" />
                  </div>
                )}
              </div>

              {/* Name + title */}
              <h3 className="font-semibold text-lg mb-0.5 group-hover:text-violet-400 transition-colors"
                style={{ color: 'var(--text-1)' }}>
                {ref.name}
              </h3>
              <p className="text-sm font-medium mb-1" style={{ color: '#06b6d4' }}>{ref.title}</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>{ref.organization}</p>

              {/* Review snippet */}
              {ref.review && (
                <p className="text-sm leading-relaxed mb-4 line-clamp-3 italic" style={{ color: 'var(--text-2)' }}>
                  &ldquo;{ref.review}&rdquo;
                </p>
              )}

              {/* Relationship tag */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(124,58,237,0.12)',
                    border: '1px solid rgba(124,58,237,0.3)',
                    color: '#a78bfa',
                  }}>
                  {ref.relationship}
                </span>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                {ref.linkedin_url && (
                  <a href={ref.linkedin_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-sm transition-colors hover:text-blue-400"
                    style={{ color: 'var(--text-2)' }}>
                    <LinkedInIcon /> LinkedIn <span className="text-xs">↗</span>
                  </a>
                )}
                <span className="ml-auto text-xs pointer-events-none transition-colors group-hover:text-violet-400"
                  style={{ color: 'var(--text-4)' }}>
                  View profile →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && <RefereeModal ref={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
