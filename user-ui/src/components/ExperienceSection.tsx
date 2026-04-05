import { api } from '@/lib/api';

interface Experience {
  id: string; company: string; role: string; description: string;
  start_date: string; end_date?: string; has_logo: boolean;
}

function formatDate(d?: string) {
  if (!d) return 'Present';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

// Split description on any newline sequence and render each line as its own paragraph.
// Handles \n (single Enter) and \n\n (double Enter) from the admin textarea equally.
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
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 70%)' }} aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Work history</div>
        <h2 className="section-title">Experience</h2>
        <p className="section-sub">Where I&apos;ve worked</p>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px"
            style={{ background: 'linear-gradient(to bottom, #7c3aed44, #06b6d444, transparent)' }} />

          <div className="space-y-8">
            {experiences.map((exp) => (
              <div key={exp.id} className="relative flex gap-8">
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

                <div className="card flex-1 mb-2 group">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-lg group-hover:text-violet-300 transition-colors">
                        {exp.role}
                      </h3>
                      <p className="font-medium" style={{ color: '#06b6d4' }}>{exp.company}</p>
                    </div>
                    <span className="text-xs font-mono px-3 py-1 rounded-full flex-shrink-0 self-start"
                      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
                      {formatDate(exp.start_date)} – {formatDate(exp.end_date)}
                    </span>
                  </div>
                  <DescriptionParagraphs text={exp.description} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
