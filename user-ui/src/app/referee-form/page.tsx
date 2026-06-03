import RefereeFormClient from './RefereeFormClient';
import RefereeReadOnlyView from './RefereeReadOnlyView';

export const dynamic = 'force-dynamic';

interface RefereeData {
  id: string; name: string; title: string; organization: string;
  relationship: string; review?: string; linkedin_url?: string;
  email?: string; phone?: string;
  available_on_request: boolean; has_photo: boolean; has_org_logo: boolean;
}

interface TokenPayload {
  valid: boolean;
  reason?: 'used' | 'used_expired' | 'expired';
  type?: 'create' | 'modify';
  expiresAt?: string;
  usedAt?: string;
  expiredAt?: string;
  referee?: RefereeData;
  existing?: {
    name: string; title: string; organization: string; relationship: string;
    review?: string; linkedin_url?: string; email?: string; phone?: string;
    available_on_request: boolean; has_photo: boolean; has_org_logo: boolean;
    referee_id: string;
  };
}

async function validateToken(token: string): Promise<TokenPayload> {
  const apiUrl = process.env.INTERNAL_API_URL;
  if (!apiUrl) return { valid: false, reason: 'expired' };
  try {
    const res = await fetch(
      `${apiUrl}/api/referee-invitations/validate?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return { valid: false, reason: 'expired' };
    return res.json();
  } catch {
    return { valid: false, reason: 'expired' };
  }
}

export default async function RefereeFormPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <InvalidState title="Invalid link" message="This invitation link is missing a token." />;
  }

  const payload = await validateToken(token);

  if (!payload.valid) {
    // Used + not expired → show read-only view of submitted data
    if (payload.reason === 'used' && payload.referee) {
      return (
        <RefereeReadOnlyView
          token={token}
          referee={payload.referee}
          expiresAt={payload.expiresAt!}
        />
      );
    }

    // Used + expired (submitted but link now expired)
    if (payload.reason === 'used_expired') {
      return (
        <InvalidState
          title="Reference submitted"
          message="Your reference was successfully submitted. This link has now expired."
          icon="✓"
          accent="green"
        />
      );
    }

    // Never used + expired
    return (
      <ExpiredState expiredAt={payload.expiredAt} />
    );
  }

  return (
    <RefereeFormClient
      token={token}
      type={payload.type!}
      expiresAt={payload.expiresAt!}
      existing={payload.existing}
    />
  );
}

function InvalidState({
  title, message, icon = '✕', accent = 'red',
}: {
  title: string; message: string; icon?: string; accent?: 'red' | 'green' | 'yellow';
}) {
  const colors = {
    red:    { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
    green:  { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
    yellow: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  text: '#fbbf24' },
  }[accent];

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg,#0f0f1a 0%,#1a0f2e 50%,#0f1a2e 100%)' }}>
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-6"
          style={{ background: colors.bg, border: `2px solid ${colors.border}` }}>
          {icon}
        </div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: colors.text }}>{title}</h1>
        <p className="text-base" style={{ color: 'rgba(255,255,255,0.5)' }}>{message}</p>
      </div>
    </div>
  );
}

function ExpiredState({ expiredAt }: { expiredAt?: string }) {
  const dateStr = expiredAt
    ? new Date(expiredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg,#0f0f1a 0%,#1a0f2e 50%,#0f1a2e 100%)' }}>
      {/* Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)' }} />

      <div className="text-center max-w-md relative z-10">
        {/* Hourglass icon */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '2px solid rgba(245,158,11,0.3)',
              boxShadow: '0 0 40px rgba(245,158,11,0.15)',
            }}>
            ⏳
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-3" style={{ color: '#fbbf24' }}>
          This link has expired
        </h1>

        {dateStr && (
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Expired on {dateStr}
          </p>
        )}

        <p className="text-base leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.55)' }}>
          This invitation link is no longer valid. Please contact John Itopa ISAH
          to request a new invitation link.
        </p>

        <a href="https://johnisah.com"
          className="inline-flex items-center gap-2 text-sm px-5 py-3 rounded-xl transition-all"
          style={{
            background: 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.35)',
            color: '#a78bfa',
          }}>
          Visit johnisah.com →
        </a>
      </div>
    </div>
  );
}
