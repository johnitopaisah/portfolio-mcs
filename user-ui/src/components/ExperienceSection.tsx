import { api } from '@/lib/api';

interface Experience {
  id: string; company: string; role: string; description: string;
  start_date: string; end_date?: string;
  ongoing?: boolean; tech_stack?: string[];
  has_logo: boolean;
}

// ── Same 8-color palette as HeroSection and ProjectsSection ──
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

// ── Standalone duration helper — avoids TS narrowing issues ──
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

function formatDate(d?: string) {
  if (!d) return 'Present';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// ── Description paragraph renderer ───────────────────────────
// Splits on \n or \n\n — handles single or double Enter from the admin textarea.
function DescriptionParagraphs({ text }: { text: string }) {
  const paras = text.split(/\n+/).filter(p => p.trim());
  if (paras.length <= 1) {
    return <p className="text-zinc-400 text-sm leading-relaxed">{text}</p>;
  }
  return (
    <div className="space-y-2">
      {paras.map((para, idx) => (
        <p key={idx} className="text-zinc-400 text-sm leading-relaxed">{para}</p>
      ))}
    </div>
  );
}

export default function ExperienceSection({ experiences }: { experiences: Experience[] }) {
  if (!experiences.length) return null;

  return (
    <section id="experience" className="relative overflow-hidden">
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-80 h-80 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Work history</div>
        <h2 className="section-title">Experience</h2>
        <p className="section-sub">Where I&apos;ve worked</p>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(to bottom, #7c3aed44, #06b6d444, transparent)' }} />

          <div className="space-y-8">
            {experiences.map((exp) => {
              const dur = calcDuration(exp.start_date, exp.end_date, exp.ongoing ?? false);
              const hasTech = exp.tech_stack && exp.tech_stack.length > 0;

              return (
                <div key={exp.id} className="relative flex gap-8">
                  {/* Timeline dot */}
                  <div className="relative flex-shrink-0 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center z-10"
                      style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)' }}>
                      {exp.has_logo ? (
                        <img src={api.expLogoUrl(exp.id)} alt={exp.company}
                          className="w-7 h-7 object-contain rounded-sm" />
                      ) : (
                        <span className="text-violet-400 font-bold text-sm">
                          {exp.company.charAt(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card */}
                  <div className="card flex-1 mb-2 group">
                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-white font-semibold text-lg group-hover:text-violet-300 transition-colors">
                          {exp.role}
                        </h3>
                        <p className="font-medium" style={{ color: '#06b6d4' }}>{exp.company}</p>
                      </div>

                      {/* Date range + duration badge */}
                      <div className="flex flex-col items-start sm:items-end gap-1 flex-shrink-0 self-start">
                        <span className="text-xs font-mono px-3 py-1 rounded-full"
                          style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
                          {formatDate(exp.start_date)}
                          {' – '}
                          {exp.ongoing ? (
                            <span className="inline-flex items-center gap-1">
                              Present
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                            </span>
                          ) : (
                            formatDate(exp.end_date)
                          )}
                        </span>
                        {/* Duration pill */}
                        {dur && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' }}>
                            {dur}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <DescriptionParagraphs text={exp.description} />

                    {/* Tech stack pills — only shown when tech_stack has entries */}
                    {hasTech && (
                      <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-zinc-800">
                        {exp.tech_stack!.map((tag, ti) => {
                          const c = TAG_COLORS[ti % TAG_COLORS.length];
                          return (
                            <span key={tag}
                              className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                              style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
