import { api } from '@/lib/api';

interface Skill { id: string; name: string; category: string; proficiency: number; has_icon: boolean; }

function groupBy(arr: Skill[], key: keyof Skill) {
  return arr.reduce((acc, item) => {
    const k = item[key] as string;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, Skill[]>);
}

// Convert 1–5 proficiency to a percentage label and bar width
function proficiencyToPercent(p: number): number {
  return Math.round((p / 5) * 100);
}

export default function SkillsSection({ skills }: { skills: Skill[] }) {
  if (!skills.length) return null;
  const grouped = groupBy(skills, 'category');

  return (
    <section id="skills" className="relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-80 h-80 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)' }} aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">What I use</div>
        <h2 className="section-title">Skills</h2>
        <p className="section-sub">Technologies I work with</p>

        <div className="grid md:grid-cols-2 gap-8">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="card">
              {/* Category header */}
              <h3 className="font-mono text-xs font-semibold uppercase tracking-widest mb-6 flex items-center gap-2"
                style={{ color: '#06b6d4' }}>
                <span className="w-4 h-px bg-cyan-500 inline-block" />
                {category}
              </h3>

              {/* Bar per skill */}
              <div className="space-y-4">
                {items.map(skill => {
                  const pct = proficiencyToPercent(skill.proficiency);
                  return (
                    <div key={skill.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {skill.has_icon && (
                            <img src={api.skillIconUrl(skill.id)} alt={skill.name}
                              className="w-4 h-4 object-contain opacity-80" />
                          )}
                          <span className="text-sm font-medium text-zinc-200">{skill.name}</span>
                        </div>
                        <span className="text-xs font-mono text-zinc-500">{pct}%</span>
                      </div>
                      {/* Track */}
                      <div className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'rgba(39,39,42,0.8)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #06b6d4)',
                            transition: 'width 1s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
