import { api } from '@/lib/api';

interface Profile {
  name: string; headline: string; bio: string;
  github_url?: string; linkedin_url?: string;
  has_avatar: boolean; hero_tags?: string[];
}

const FALLBACK_TAGS = ['Kubernetes', 'AWS', 'CI/CD', 'Docker', 'Terraform', 'GitOps'];

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

export default function HeroSection({ profile }: { profile: Profile | null }) {
  const tags =
    profile?.hero_tags && profile.hero_tags.length > 0
      ? profile.hero_tags
      : FALLBACK_TAGS;

  return (
    <section id="about" className="relative min-h-screen flex items-center overflow-hidden">

      {/* Ambient decorations */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', left: '-5%',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)',
        }} />
        {/* Grid — uses CSS var so it adapts to light/dark */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(var(--hero-grid) 1px,transparent 1px),linear-gradient(90deg,var(--hero-grid) 1px,transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="section relative z-10 w-full pt-16">
        <div className="grid md:grid-cols-2 gap-16 items-center">

          <div>
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Available for opportunities
            </div>

            <p className="font-mono text-violet-400 text-sm mb-3 tracking-wide">
              {'// hi, i\'m'}
            </p>

            <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] mb-4"
              style={{ color: 'var(--text-1)' }}>
              {profile?.name?.split(' ').slice(0, -1).join(' ') ?? 'John Itopa'}{' '}
              <span style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {profile?.name?.split(' ').at(-1) ?? 'ISAH'}
              </span>
            </h1>

            <p className="text-xl mb-4 font-medium" style={{ color: 'var(--text-2)' }}>
              {profile?.headline ?? 'DevOps & Cloud Engineer'}
            </p>

            <p className="leading-relaxed mb-6 max-w-lg" style={{ color: 'var(--text-3)' }}>
              {profile?.bio ?? 'Building scalable infrastructure and cloud-native solutions.'}
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              {tags.map((tag, i) => {
                const c = TAG_COLORS[i % TAG_COLORS.length];
                return (
                  <span key={tag} className="text-xs font-medium px-3 py-1 rounded-full"
                    style={{ background: c.color, border: `1px solid ${c.border}`, color: c.text }}>
                    {tag}
                  </span>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <a href="#projects" className="btn-primary">View Projects →</a>
              <a href="/api/profile/resume" className="btn-outline">Download CV ↓</a>
              {profile?.github_url && (
                <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                  GitHub ↗
                </a>
              )}
              {profile?.linkedin_url && (
                <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                  LinkedIn ↗
                </a>
              )}
            </div>
          </div>

          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)', transform: 'scale(1.15)' }} />
              {profile?.has_avatar ? (
                <img src={api.avatarUrl} alt={profile.name}
                  style={{
                    width: '22rem', height: '22rem', borderRadius: '50%',
                    objectFit: 'cover', border: '3px solid rgba(124,58,237,0.4)',
                    position: 'relative', boxShadow: '0 0 60px rgba(124,58,237,0.2)',
                  }} />
              ) : (
                <div style={{
                  width: '22rem', height: '22rem', borderRadius: '50%',
                  background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(6,182,212,0.1))',
                  border: '3px solid rgba(124,58,237,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <span style={{
                    fontSize: '6rem', fontWeight: '700',
                    background: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                    {(profile?.name ?? 'J').charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="flex justify-center mt-16">
          <a href="#projects" className="flex flex-col items-center gap-2 transition-colors"
            style={{ color: 'var(--text-4)' }}>
            <span className="text-xs font-mono tracking-widest">scroll</span>
            <div className="w-5 h-8 rounded-full flex items-start justify-center p-1"
              style={{ border: '1px solid var(--border)' }}>
              <div className="w-1 h-2 bg-violet-500 rounded-full animate-bounce" />
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
