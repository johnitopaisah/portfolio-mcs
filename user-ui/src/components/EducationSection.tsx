import { api } from '@/lib/api';

interface Education {
  id: string;
  institution: string;
  institution_url?: string;
  degree: string;
  field_of_study: string;
  description?: string;
  grade?: string;
  activities?: string;
  start_date: string;
  end_date?: string;
  ongoing: boolean;
  has_logo: boolean;
}

function formatDate(d?: string): string {
  if (!d) return 'Present';
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

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

export default function EducationSection({ education }: { education: Education[] }) {
  if (!education.length) return null;

  return (
    <section id="education" className="relative overflow-hidden">
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-80 h-80 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Academic background</div>
        <h2 className="section-title">Education</h2>
        <p className="section-sub">Schools &amp; qualifications</p>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(to bottom, rgba(6,182,212,0.4), rgba(124,58,237,0.3), transparent)' }} />

          <div className="space-y-8">
            {education.map(edu => {
              const dur = calcDuration(edu.start_date, edu.end_date, edu.ongoing);

              return (
                <div key={edu.id} className="relative flex gap-8">
                  {/* Timeline dot / logo */}
                  <div className="relative flex-shrink-0 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center z-10 overflow-hidden"
                      style={{
                        background: 'rgba(6,182,212,0.12)',
                        border: '1px solid rgba(6,182,212,0.38)',
                      }}>
                      {edu.has_logo ? (
                        <img src={api.educationLogoUrl(edu.id)} alt={edu.institution}
                          className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-cyan-400 font-bold text-sm">
                          {edu.institution.charAt(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card */}
                  <div className="card flex-1 mb-2 group">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                      <div>
                        {edu.institution_url ? (
                          <a href={edu.institution_url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold text-lg transition-colors group-hover:text-cyan-400 hover:text-cyan-400 inline-flex items-center gap-1"
                            style={{ color: 'var(--text-1)' }}>
                            {edu.institution}
                            <span className="text-xs opacity-60">↗</span>
                          </a>
                        ) : (
                          <h3 className="font-semibold text-lg transition-colors group-hover:text-cyan-400"
                            style={{ color: 'var(--text-1)' }}>
                            {edu.institution}
                          </h3>
                        )}
                        <p className="font-medium text-sm" style={{ color: '#06b6d4' }}>
                          {edu.degree} &middot; {edu.field_of_study}
                        </p>
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-1.5 flex-shrink-0 self-start">
                        <span className="text-xs font-mono px-3 py-1 rounded-full whitespace-nowrap"
                          style={{
                            background: 'rgba(6,182,212,0.1)',
                            border: '1px solid rgba(6,182,212,0.25)',
                            color: '#67e8f9',
                          }}>
                          {formatDate(edu.start_date)}
                          {' – '}
                          {edu.ongoing ? (
                            <span className="inline-flex items-center gap-1">
                              Present
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                            </span>
                          ) : formatDate(edu.end_date)}
                        </span>

                        {dur && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(124,58,237,0.08)',
                              border: '1px solid rgba(124,58,237,0.22)',
                              color: '#a78bfa',
                            }}>
                            {dur}
                          </span>
                        )}

                        {edu.grade && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                            style={{
                              background: 'rgba(251,191,36,0.1)',
                              border: '1px solid rgba(251,191,36,0.25)',
                              color: '#fcd34d',
                            }}>
                            {edu.grade}
                          </span>
                        )}
                      </div>
                    </div>

                    {edu.description && (
                      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-2)' }}>
                        {edu.description}
                      </p>
                    )}

                    {edu.activities && (
                      <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-3)' }}>
                          Activities &amp; Societies
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{edu.activities}</p>
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
