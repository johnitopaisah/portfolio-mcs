import { ImageResponse } from 'next/og';

export const runtime     = 'nodejs';
export const size        = { width: 32, height: 32 };
export const contentType = 'image/png';

async function fetchAvatar(): Promise<string | null> {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}/api/profile/avatar`, { cache: 'no-store' });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mime   = res.headers.get('content-type') || 'image/jpeg';
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch {
    return null;
  }
}

async function fetchInitial(): Promise<string> {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) return 'A';
  try {
    const res = await fetch(`${apiBase}/api/profile`, { cache: 'no-store' });
    if (!res.ok) return 'A';
    const data = await res.json();
    return (data?.name ?? 'A').charAt(0).toUpperCase();
  } catch {
    return 'A';
  }
}

export default async function Icon() {
  const [avatarSrc, initial] = await Promise.all([
    fetchAvatar(),
    fetchInitial(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
        }}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt="favicon"
            width={32}
            height={32}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <span style={{
            fontSize: '18px', fontWeight: 800,
            color: '#ffffff',
            fontFamily: 'system-ui, sans-serif',
          }}>
            {initial}
          </span>
        )}
      </div>
    ),
    { ...size }
  );
}
