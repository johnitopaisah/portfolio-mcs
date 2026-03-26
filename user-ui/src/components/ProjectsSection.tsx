import { api } from '@/lib/api';

interface Project {
  id: string; title: string; description: string; tech_stack: string[];
  live_url?: string; repo_url?: string; has_image: boolean; featured: boolean;
}

// Gradient fallbacks keyed by position — cycle through for variety
const GRADIENTS = [
  'linear-gradient(135deg,#1e1b4b 0%,#0f172a 100%)',
  'linear-gradient(135deg,#042c53 0%,#0f172a 100%)',
  'linear-gradient(135deg,#064e3b 0%,#0f172a 100%)',
  'linear-gradient(135deg,#3b0764 0%,#0f172a 100%)',
  'linear-gradient(135deg,#1c1917 0%,#0f172a 100%)',
  'linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%)',
];

// Icon fallback per common tech keywords
function getIcon(tech: string[]): string {
  const t = tech.join(' ').toLowerCase();
  if (t.includes('kubernetes') || t.includes('k8s') || t.includes('helm')) return '⎈';
  if (t.includes('aws') || t.includes('cloud'))   return '☁';
  if (t.includes('docker'))                        return '🐳';
  if (t.includes('terraform') || t.includes('iac')) return '◧';
  if (t.includes('python') || t.includes('django')) return '🐍';
  if (t.includes('react') || t.includes('next'))   return '⚛';
  if (t.includes('linux') || t.includes('bash'))   return '🐧';
  return '◈';
}

export default function ProjectsSection({ projects }: { projects: Project[] }) {
  if (!projects.length) return null;

  return (
    <section id="projects" className="relative overflow-hidden">
      {/* Section ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.08) 0%, transparent 70%)' }} aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Selected work</div>
        <h2 className="section-title">Projects</h2>
        <p className="section-sub">Things I've built</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p, i) => (
            <div key={p.id} className="card flex flex-col group overflow-hidden relative">
              {/* Featured badge */}
              {p.featured && (
                <div className="absolute top-3 right-3 z-10 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}>
                  ★ Featured
                </div>
              )}

              {/* Image or gradient fallback */}
              <div className="h-44 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl relative">
                {p.has_image ? (
                  <img
                    src={api.projectImageUrl(p.id)}
                    alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl opacity-60">{getIcon(p.tech_stack)}</span>
                      <div className="flex gap-1">
                        {p.tech_stack.slice(0, 3).map(t => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {/* Gradient overlay at bottom of image */}
                <div className="absolute inset-x-0 bottom-0 h-12"
                  style={{ background: 'linear-gradient(to top, rgba(24,24,27,0.8), transparent)' }} />
              </div>

              <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-violet-300 transition-colors">
                {p.title}
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed flex-1 mb-4 line-clamp-3">{p.description}</p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {p.tech_stack.map(t => <span key={t} className="badge">{t}</span>)}
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
    </section>
  );
}
