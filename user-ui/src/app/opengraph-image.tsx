import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size    = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TAG_COLORS = [
  { bg: 'rgba(124,58,237,0.25)',  border: '#7c3aed', text: '#c4b5fd' },
  { bg: 'rgba(251,191,36,0.2)',   border: '#f59e0b', text: '#fcd34d' },
  { bg: 'rgba(6,182,212,0.2)',    border: '#06b6d4', text: '#67e8f9' },
  { bg: 'rgba(59,130,246,0.2)',   border: '#3b82f6', text: '#93c5fd' },
  { bg: 'rgba(139,92,246,0.2)',   border: '#8b5cf6', text: '#ddd6fe' },
  { bg: 'rgba(34,197,94,0.2)',    border: '#22c55e', text: '#86efac' },
];

async function fetchProfile() {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}/api/profile`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchAvatarBase64(): Promise<string | null> {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}/api/profile/avatar`, { cache: 'no-store' });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime   = res.headers.get('content-type') || 'image/jpeg';
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const [profile, avatarSrc] = await Promise.all([
    fetchProfile(),
    fetchAvatarBase64(),
  ]);

  const name     = profile?.name     ?? 'John Itopa ISAH';
  const headline = profile?.headline ?? 'DevOps & Cloud Engineer';
  const tags: string[] = profile?.hero_tags?.slice(0, 6) ?? ['Kubernetes', 'AWS', 'CI/CD', 'Docker', 'Terraform', 'GitOps'];
  const initial  = name.charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px',
          background: '#09090b',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Ambient glow — top right */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-80px',
          width: '480px', height: '480px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)',
          display: 'flex',
        }} />
        {/* Ambient glow — bottom left */}
        <div style={{
          position: 'absolute', bottom: '-80px', left: '-80px',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Left content */}
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '64px 56px',
          position: 'relative',
        }}>
          {/* Site URL badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '28px',
          }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#4ade80',
            }} />
            <span style={{ color: '#86efac', fontSize: '15px', letterSpacing: '0.05em' }}>
              johnisah.com
            </span>
          </div>

          {/* Name — fontWeight as number, not string */}
          <div style={{
            fontSize: '64px', fontWeight: 800, lineHeight: '1.1',
            color: '#ffffff', marginBottom: '16px',
            display: 'flex', flexWrap: 'wrap',
          }}>
            {name}
          </div>

          {/* Headline */}
          <div style={{
            fontSize: '26px', color: '#a1a1aa',
            fontWeight: 400, marginBottom: '36px',
          }}>
            {headline}
          </div>

          {/* Tech tag pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {tags.map((tag, i) => {
              const c = TAG_COLORS[i % TAG_COLORS.length];
              return (
                <div
                  key={tag}
                  style={{
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                    borderRadius: '999px',
                    padding: '6px 16px',
                    fontSize: '15px',
                    fontWeight: 500,
                    display: 'flex',
                  }}
                >
                  {tag}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — avatar */}
        <div style={{
          width: '360px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 48px 48px 0',
          position: 'relative',
        }}>
          {/* Glow ring behind avatar */}
          <div style={{
            position: 'absolute',
            width: '280px', height: '280px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)',
            display: 'flex',
          }} />

          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={name}
              width={240}
              height={240}
              style={{
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid rgba(124,58,237,0.5)',
                boxShadow: '0 0 60px rgba(124,58,237,0.25)',
                position: 'relative',
              }}
            />
          ) : (
            <div style={{
              width: '240px', height: '240px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
              border: '3px solid rgba(124,58,237,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <span style={{
                fontSize: '96px', fontWeight: 800,
                background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                backgroundClip: 'text',
                color: 'transparent',
              }}>
                {initial}
              </span>
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
