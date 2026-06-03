'use client';
import { useState } from 'react';

interface RefereeData {
  id: string; name: string; title: string; organization: string;
  relationship: string; review?: string; linkedin_url?: string;
  email?: string; phone?: string;
  available_on_request: boolean; has_photo: boolean; has_org_logo: boolean;
}

interface Props {
  token: string;
  referee: RefereeData;
  expiresAt: string;
}

type Stage = 'view' | 'requesting' | 'requested';

function LinkedInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  );
}

export default function RefereeReadOnlyView({ token, referee: ref, expiresAt }: Props) {
  const [stage, setStage] = useState<Stage>('view');

  const expiryStr = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const photoUrl    = `/api/referees/${ref.id}/photo`;
  const orgLogoUrl  = `/api/referees/${ref.id}/org-logo`;

  async function requestModification() {
    setStage('requesting');
    try {
      await fetch(`/api/referee-invitations/${token}/request-modification`, { method: 'POST' });
    } catch { /* best-effort */ }
    setStage('requested');
  }

  return (
    <div className="min-h-screen py-12 px-4"
      style={{ background: 'linear-gradient(135deg,#0f0f1a 0%,#1a0f2e 50%,#0f1a2e 100%)' }}>

      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)' }} aria-hidden />

      <div className="relative z-10 max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2 pb-2">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-2xl mb-4"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
            ✓
          </div>
          <h1 className="text-2xl font-bold text-white">Reference submitted</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Below is the reference you provided for John Itopa ISAH.
            This link is valid until {expiryStr}.
          </p>
        </div>

        {/* Read-only card */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>

          {/* Photo banner */}
          {ref.has_photo ? (
            <div className="h-48 relative overflow-hidden">
              <img src={photoUrl} alt={ref.name}
                className="w-full h-full object-cover object-top" />
              <div className="absolute inset-x-0 bottom-0 h-20"
                style={{ background: 'linear-gradient(to top, rgba(15,15,26,0.95), transparent)' }} />
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(79,70,229,0.3))' }}>
              <span className="text-5xl font-bold" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {ref.name.charAt(0)}
              </span>
            </div>
          )}

          <div className="p-6 space-y-5">

            {/* Name + title */}
            <div className="flex items-start gap-4">
              {ref.has_photo && (
                <img src={photoUrl} alt={ref.name}
                  className="w-14 h-14 rounded-full object-cover flex-shrink-0 -mt-10 ring-2"
                  style={{ ringColor: 'rgba(124,58,237,0.5)', border: '2px solid rgba(124,58,237,0.4)' }} />
              )}
              <div className={ref.has_photo ? '' : ''}>
                <h2 className="text-xl font-bold text-white">{ref.name}</h2>
                <p className="text-sm font-medium" style={{ color: '#06b6d4' }}>{ref.title}</p>
              </div>
            </div>

            {/* Organisation */}
            <Row label="Organisation">
              <div className="flex items-center gap-2.5">
                {ref.has_org_logo && (
                  <img src={orgLogoUrl} alt={ref.organization}
                    className="w-6 h-6 object-contain rounded flex-shrink-0" />
                )}
                <span className="text-white font-medium">{ref.organization}</span>
              </div>
            </Row>

            {/* Relationship */}
            <Row label="Relationship">
              <span className="inline-block text-sm px-3 py-0.5 rounded-full"
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}>
                {ref.relationship}
              </span>
            </Row>

            {/* Review */}
            {ref.review && (
              <Row label="Your testimonial">
                <blockquote className="pl-3 space-y-2"
                  style={{ borderLeft: '2px solid rgba(124,58,237,0.4)' }}>
                  {ref.review.split(/\n\n+/).filter(Boolean).map((para, i, arr) => (
                    <p key={i} className="text-sm leading-relaxed italic" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {i === 0 && <>&ldquo;</>}
                      {para}
                      {i === arr.length - 1 && <>&rdquo;</>}
                    </p>
                  ))}
                </blockquote>
              </Row>
            )}

            {/* Contact */}
            <Row label="Contact">
              <div className="flex flex-wrap gap-2">
                {ref.linkedin_url && (
                  <a href={ref.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(10,102,194,0.12)', border: '1px solid rgba(10,102,194,0.3)', color: '#60a5fa' }}>
                    <LinkedInIcon /> LinkedIn
                  </a>
                )}
                {ref.available_on_request ? (
                  <span className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fcd34d' }}>
                    Contact available on request
                  </span>
                ) : (
                  <>
                    {ref.email && (
                      <span className="text-xs px-3 py-1.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
                        {ref.email}
                      </span>
                    )}
                    {ref.phone && (
                      <span className="text-xs px-3 py-1.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
                        {ref.phone}
                      </span>
                    )}
                  </>
                )}
              </div>
            </Row>
          </div>
        </div>

        {/* Modification request section */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>

          {stage === 'requested' ? (
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg mx-auto"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                ✓
              </div>
              <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>Modification request sent</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                John has been notified and will send you a modification link shortly.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-white">Need to make changes?</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  If any of the information above is incorrect, request a modification.
                  John will be notified and send you an edit link.
                </p>
              </div>
              <button
                onClick={requestModification}
                disabled={stage === 'requesting'}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: stage === 'requesting' ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: '#fbbf24',
                }}>
                {stage === 'requesting' ? 'Sending request…' : 'Request a modification →'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs pb-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
          johnisah.com · Professional Reference Portal
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}
