'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';

interface StarConfig {
  enabled: boolean;
  count: number;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  speed: 'slow' | 'normal' | 'fast';
  sparkle_ratio: number;
  mask_start: number;
  colors: string[];
}

interface StarBase {
  id: number; x: number; y: number; delay: number;
  sizeRatio: number; durationRatio: number; colorSlot: number; typeRoll: number;
}

const ALL_COLORS = [
  { label: 'Violet', hex: '#a78bfa' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Amber',  hex: '#fcd34d' },
  { label: 'Pink',   hex: '#f9a8d4' },
  { label: 'White',  hex: '#ffffff' },
  { label: 'Purple', hex: '#c4b5fd' },
  { label: 'Mint',   hex: '#86efac' },
];

const SIZE_MAP: Record<string, [number, number]> = {
  xs: [1.5, 3.5], sm: [2.5, 5], md: [3.5, 7], lg: [5, 9], xl: [7, 13],
};

const SPEED_MAP: Record<string, [number, number]> = {
  slow: [3, 6], normal: [1.8, 4.2], fast: [0.8, 2],
};

const DEFAULT_STAR_CONFIG: StarConfig = {
  enabled: true, count: 32, size: 'md', speed: 'normal',
  sparkle_ratio: 0.55, mask_start: 28,
  colors: ALL_COLORS.map(c => c.hex),
};

function generateStarBases(count: number): StarBase[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 3.5,
    sizeRatio: Math.random(),
    durationRatio: Math.random(),
    colorSlot: Math.floor(Math.random() * 7),
    typeRoll: Math.random(),
  }));
}

function SliderControl({ label, value, min, max, format, onChange }: {
  label: string; value: number; min: number; max: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-xs" style={{ color: '#a78bfa' }}>{format(value)}</p>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer" style={{ accentColor: '#a78bfa' }} />
      <div className="flex justify-between mt-1">
        <span className="text-gray-600 text-xs">{min}</span>
        <span className="text-gray-600 text-xs">{max}</span>
      </div>
    </div>
  );
}

function StarSettingsModal({ referee, onClose, onPublished }: {
  referee: Referee;
  onClose: () => void;
  onPublished: (id: string, cfg: StarConfig) => void;
}) {
  const initial = referee.star_config ?? DEFAULT_STAR_CONFIG;
  const [config, setConfig] = useState<StarConfig>(initial);
  const [liveConfig, setLiveConfig] = useState<StarConfig>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const starBases = useMemo(() => generateStarBases(config.count), [config.count]);

  async function handlePublish() {
    if (config.colors.length === 0) return;
    setSaving(true);
    try {
      await adminApi.saveStarConfig(referee.id, config as unknown as Record<string, unknown>);
      setLiveConfig(config);
      onPublished(referee.id, config);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  const activeColors = config.colors.length > 0 ? config.colors : ALL_COLORS.map(c => c.hex);
  const maskStyle = `radial-gradient(ellipse 52% 48% at 50% 50%, transparent ${config.mask_start}%, rgba(0,0,0,0.5) ${config.mask_start + 24}%, black ${config.mask_start + 47}%)`;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>

      {/* LEFT — full-height photo + live stars (mirrors public modal exactly) */}
      <div className="w-[42%] flex-shrink-0 h-full relative overflow-hidden"
        style={{ background: 'rgba(10,10,20,0.98)' }}
        onClick={e => e.stopPropagation()}>
        {referee.has_photo
          ? <img src={adminApi.refereePhoto(referee.id)} alt={referee.name}
              className="w-full h-full object-cover object-top" />
          : <div className="w-full h-full flex items-center justify-center">
              <div className="rounded-full flex items-center justify-center text-6xl font-bold"
                style={{ width: '160px', height: '160px', background: 'rgba(124,58,237,0.15)', border: '3px solid rgba(124,58,237,0.4)', color: '#a78bfa' }}>
                {referee.name.charAt(0)}
              </div>
            </div>
        }
        {/* Live star overlay — only when enabled */}
        {config.enabled && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 2, maskImage: maskStyle, WebkitMaskImage: maskStyle }}>
            <style>{`@keyframes twinkle-admin-star{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.3)}50%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
            {starBases.map(s => {
              const [minSz, maxSz] = SIZE_MAP[config.size] ?? SIZE_MAP.md;
              const sz  = minSz + s.sizeRatio * (maxSz - minSz);
              const [minDur, maxDur] = SPEED_MAP[config.speed] ?? SPEED_MAP.normal;
              const dur = minDur + s.durationRatio * (maxDur - minDur);
              const col = activeColors[s.colorSlot % activeColors.length];
              const spark = s.typeRoll < config.sparkle_ratio;
              return (
                <div key={s.id} style={{
                  position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                  transform: 'translate(-50%,-50%) scale(0.3)',
                  animation: `twinkle-admin-star ${dur}s ease-in-out ${s.delay}s infinite`,
                  ...(spark ? {
                    fontSize: `${sz * 5}px`, lineHeight: 1, color: col, userSelect: 'none' as const,
                    textShadow: `0 0 ${sz * 4}px ${col}, 0 0 ${sz * 8}px ${col}`,
                  } : {
                    width: `${sz}px`, height: `${sz}px`, borderRadius: '50%',
                    background: col, boxShadow: `0 0 ${sz * 3}px ${sz * 1.5}px ${col}`,
                  }),
                }}>
                  {spark ? '✦' : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="absolute bottom-4 left-4 pointer-events-none" style={{ zIndex: 3 }}>
          <span className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }}>
            Preview only · not live until published
          </span>
        </div>
      </div>

      {/* RIGHT — controls panel */}
      <div className="flex-1 h-full flex flex-col"
        style={{ background: '#0f172a', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <h2 className="text-white font-semibold">✦ Star Animation</h2>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{referee.name}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
            style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            ✕
          </button>
        </div>

        {/* Toggle */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <p className="text-white font-medium text-sm">Animation enabled</p>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
              {config.enabled ? 'Stars visible in the referee modal' : 'No stars for this referee'}
            </p>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
            className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200"
            style={{ background: config.enabled ? '#7c3aed' : '#374151' }}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Scrollable controls */}
        <div className="flex-1 overflow-y-auto">
          {config.enabled ? (
            <div className="p-6 space-y-6">

              <SliderControl label="Star count" value={config.count} min={10} max={60}
                format={v => `${v} stars`}
                onChange={v => setConfig(c => ({ ...c, count: v }))} />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-sm font-medium">Star size</p>
                  <p className="text-xs uppercase" style={{ color: '#a78bfa' }}>{config.size}</p>
                </div>
                <div className="flex gap-2">
                  {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(s => (
                    <button key={s} onClick={() => setConfig(c => ({ ...c, size: s }))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold uppercase transition-all"
                      style={config.size === s
                        ? { background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.6)', color: '#a78bfa' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white text-sm font-medium">Animation speed</p>
                  <p className="text-xs capitalize" style={{ color: '#a78bfa' }}>{config.speed}</p>
                </div>
                <div className="flex gap-2">
                  {(['slow', 'normal', 'fast'] as const).map(s => (
                    <button key={s} onClick={() => setConfig(c => ({ ...c, speed: s }))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all"
                      style={config.speed === s
                        ? { background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.6)', color: '#a78bfa' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <SliderControl label="Sparkle ratio" value={Math.round(config.sparkle_ratio * 100)} min={0} max={100}
                format={v => `${v}% sparkles (✦ vs dots)`}
                onChange={v => setConfig(c => ({ ...c, sparkle_ratio: v / 100 }))} />

              <SliderControl label="Edge clearance" value={config.mask_start} min={10} max={60}
                format={v => `${v}% — stars start this far from centre`}
                onChange={v => setConfig(c => ({ ...c, mask_start: v }))} />

              <div>
                <p className="text-white text-sm font-medium mb-1">Star colours</p>
                <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Toggle each colour on or off</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_COLORS.map(({ label, hex }) => {
                    const on = config.colors.includes(hex);
                    return (
                      <button key={hex}
                        onClick={() => setConfig(c => ({
                          ...c,
                          colors: on ? c.colors.filter(x => x !== hex) : [...c.colors, hex],
                        }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                        style={{
                          background: on ? `${hex}1a` : 'rgba(255,255,255,0.04)',
                          border: on ? `1px solid ${hex}77` : '1px solid rgba(255,255,255,0.08)',
                          color: on ? hex : '#6b7280',
                        }}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: hex, boxShadow: on ? `0 0 6px ${hex}` : 'none' }} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {config.colors.length === 0 && (
                  <p className="text-xs mt-2" style={{ color: '#fbbf24' }}>⚠ Select at least one colour</p>
                )}
              </div>

            </div>
          ) : (
            <div className="flex items-center justify-center h-full p-12 text-center">
              <div>
                <p className="text-5xl mb-4" style={{ opacity: 0.15 }}>✦</p>
                <p className="text-sm" style={{ color: '#4b5563' }}>
                  Star animation is disabled for this referee.<br />
                  Toggle it on to configure and preview.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {config.enabled && (
            <button onClick={() => setConfig({ ...DEFAULT_STAR_CONFIG })}
              className="text-xs transition-colors"
              style={{ color: '#6b7280' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#9ca3af')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}>
              Reset to defaults
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setConfig(liveConfig)} className="btn-ghost text-sm">Discard</button>
            <button onClick={handlePublish} disabled={saving || config.colors.length === 0}
              className="btn-primary text-sm">
              {saving ? 'Publishing…' : 'Publish →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

interface Referee {
  id: string; name: string; title: string; organization: string;
  relationship: string; review?: string; linkedin_url?: string;
  email?: string; phone?: string;
  available_on_request: boolean; visible: boolean;
  has_photo: boolean; has_org_logo: boolean; order_index: number;
  modification_requested: boolean; modification_requested_at?: string;
  star_config?: StarConfig | null;
}

interface Invitation {
  id: string; note?: string; type: string; expires_at: string;
  used: boolean; used_at?: string; created_at: string;
  referee_id?: string; referee_name?: string; link: string; expired: boolean;
}

const emptyForm = {
  name: '', title: '', organization: '', relationship: '', review: '',
  linkedin_url: '', email: '', phone: '',
  available_on_request: 'true', visible: 'true', order_index: '0',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs px-3 py-1 rounded-lg transition-colors"
      style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.12)', color: copied ? '#86efac' : '#a78bfa' }}>
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  );
}

function InviteModal({ refereeId, refereeName, onClose, onDone }: {
  refereeId?: string; refereeName?: string; onClose: () => void; onDone: (inv: Invitation) => void;
}) {
  const isModify = !!refereeId;
  const [note, setNote]           = useState(refereeName ? `Modification link for ${refereeName}` : '');
  const [days, setDays]           = useState('14');
  const [refereeEmail, setRefereeEmail] = useState('');
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<(Invitation & { email_sent?: boolean }) | null>(null);

  async function generate() {
    setSaving(true);
    try {
      const payload = { note, days: parseInt(days), referee_email: refereeEmail.trim() || undefined };
      const inv = isModify
        ? await adminApi.createModifyLink(refereeId!, payload)
        : await adminApi.createInvitation(payload);
      setResult(inv);
      onDone(inv);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {isModify ? `Generate modification link for ${refereeName}` : 'Generate invitation link'}
        </h2>

        {!result ? (
          <>
            <div>
              <label className="label">Note (for your reference)</label>
              <input className="input" value={note} placeholder='e.g. "For Mario Valdivia - Quandela"'
                onChange={e => setNote(e.target.value)} />
            </div>

            <div>
              <label className="label">
                Referee&apos;s email
                <span className="ml-1.5 text-gray-500 font-normal">(optional — sends link automatically)</span>
              </label>
              <input className="input" type="email" value={refereeEmail}
                placeholder="mario@quandela.com"
                onChange={e => setRefereeEmail(e.target.value)} />
            </div>

            <div>
              <label className="label">Link expires in</label>
              <div className="flex gap-2 flex-wrap">
                {['7', '14', '30'].map(d => (
                  <button key={d} onClick={() => setDays(d)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: days === d ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', color: days === d ? '#a78bfa' : '#9ca3af', border: days === d ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                    {d} days
                  </button>
                ))}
                <input type="number" min="1" max="365" value={days}
                  onChange={e => setDays(e.target.value)}
                  className="input w-24 text-center" placeholder="Custom" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={generate} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Generating…' : refereeEmail.trim() ? 'Generate & send link' : 'Generate link'}
              </button>
              <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-green-400 text-sm font-semibold">✓ Link ready</p>
              {result.email_sent && (
                <p className="text-green-300 text-xs">
                  ✉ Invitation email sent to {(result as any).referee_email}
                </p>
              )}
              <p className="text-gray-300 text-xs break-all font-mono">{result.link}</p>
              <div className="flex items-center justify-between">
                <CopyButton text={result.link} />
                <p className="text-gray-500 text-xs">
                  Expires {new Date(result.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────
interface ContactRequest {
  id: string;
  referee_id: string;
  requester_name: string;
  requester_email: string;
  requester_email_verified: boolean;
  requester_company?: string;
  requester_linkedin_url?: string;
  requester_purpose: string;
  requester_message?: string;
  status: string;
  consent_resend_count: number;
  consent_reminder_count: number;
  consent_requested_at?: string;
  consent_responded_at?: string;
  admin_note?: string;
  resend_note?: string;
  fulfilled_at?: string;
  declined_at?: string;
  expires_at: string;
  created_at: string;
  // joined
  referee_name: string;
  referee_title: string;
  referee_organization: string;
  referee_has_photo: boolean;
}

// ── Progress tracker ─────────────────────────────────────────
const STEPS = ['Submitted', 'Approved', 'Consent Sent', 'Consent Given', 'Fulfilled'] as const;

function stepIndex(status: string): number {
  switch (status) {
    case 'submitted':         return 0;
    case 'approved':          return 1;
    case 'consent_requested': return 2;
    case 'consent_given':     return 3;
    case 'fulfilled':         return 4;
    default:                  return -1; // declined / rejected / denied / expired
  }
}

function ProgressTracker({ req }: { req: ContactRequest }) {
  const current   = stepIndex(req.status);
  const isDeclined = ['declined','rejected','expired'].includes(req.status);
  const isDenied   = req.status === 'consent_denied';

  const steps = isDenied
    ? ['Submitted', 'Approved', 'Consent Sent', 'Consent Denied']
    : STEPS;

  const effectiveCurrent = isDenied ? 3 : current;

  return (
    <div className="py-4">
      <div className="flex items-center">
        {steps.map((label, i) => {
          const done    = effectiveCurrent > i;
          const active  = effectiveCurrent === i;
          const isBad   = (isDenied && i === steps.length - 1) || (isDeclined && active);
          const isLast  = i === steps.length - 1;

          const dotColor = isBad
            ? '#ef4444'
            : done || active
              ? active ? '#a78bfa' : '#22c55e'
              : '#3f3f46';

          const lineColor = done ? '#22c55e' : '#27272a';

          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                  style={{
                    background: `${dotColor}22`,
                    border: `2px solid ${dotColor}`,
                    color: dotColor,
                    boxShadow: active ? `0 0 8px ${dotColor}88` : 'none',
                  }}
                >
                  {isBad ? '✕' : done ? '✓' : ''}
                </div>
                <span className="text-xs text-center leading-tight" style={{ color: done || active ? '#d4d4d8' : '#52525b', maxWidth: '60px' }}>
                  {label}
                </span>
              </div>
              {!isLast && (
                <div className="flex-1 h-px mx-1 mb-5" style={{ background: lineColor }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    submitted:         { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', label: 'Pending Approval' },
    approved:          { bg: 'rgba(124,58,237,0.12)',  color: '#a78bfa', label: 'Approved' },
    consent_requested: { bg: 'rgba(6,182,212,0.12)',   color: '#67e8f9', label: 'Awaiting Consent' },
    consent_given:     { bg: 'rgba(34,197,94,0.12)',   color: '#4ade80', label: 'Consent Given' },
    consent_denied:    { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'Consent Denied' },
    fulfilled:         { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', label: 'Fulfilled' },
    declined:          { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: 'Declined' },
    rejected:          { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: 'Rejected' },
    expired:           { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Expired' },
  };
  const s = styles[status] ?? { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: status };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Activity log entry formatter ───────────────────────────────
function activityLog(req: ContactRequest): Array<{ date: string; text: string }> {
  const fmt = (d?: string | null) => d ? new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';
  const log = [{ date: fmt(req.created_at), text: `Request submitted by ${req.requester_name}` }];
  if (req.requester_email_verified) log.push({ date: fmt(req.created_at), text: 'Email verified' });
  if (req.status === 'approved' || stepIndex(req.status) > 1) log.push({ date: fmt(req.created_at), text: 'Approved by admin' });
  if (req.consent_requested_at) log.push({ date: fmt(req.consent_requested_at), text: `Consent request sent to ${req.referee_name}` });
  if (req.consent_reminder_count > 0) log.push({ date: '', text: `${req.consent_reminder_count} auto-reminder(s) sent` });
  if (req.consent_responded_at && req.status === 'consent_given') log.push({ date: fmt(req.consent_responded_at), text: `${req.referee_name} gave consent` });
  if (req.consent_responded_at && req.status === 'consent_denied') log.push({ date: fmt(req.consent_responded_at), text: `${req.referee_name} declined consent` });
  if (req.consent_responded_at && req.status === 'consent_requested' && req.consent_resend_count > 0) log.push({ date: fmt(req.consent_requested_at), text: `Consent re-requested (${req.consent_resend_count}/2 resends used)` });
  if (req.fulfilled_at) log.push({ date: fmt(req.fulfilled_at), text: `Contact details shared with ${req.requester_name}` });
  if (req.declined_at) log.push({ date: fmt(req.declined_at), text: 'Request declined' });
  return log;
}

// ── Contact Request Detail Pane ───────────────────────────────
function ContactRequestDetail({
  req, onUpdate, onDelete,
}: {
  req: ContactRequest;
  onUpdate: (updated: ContactRequest) => void;
  onDelete: (id: string) => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [consentNote, setConsentNote]     = useState('');
  const [resendNote, setResendNote]       = useState('');
  const [fulfillNote, setFulfillNote]     = useState('');
  const [expandConsent, setExpandConsent] = useState(false);
  const [expandResend, setExpandResend]   = useState(false);
  const [expandFulfill, setExpandFulfill] = useState(false);

  async function act(fn: () => Promise<ContactRequest | null>) {
    setActionLoading(true);
    try {
      const updated = await fn();
      if (updated) onUpdate(updated);
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  }

  const isTerminal = ['fulfilled','declined','rejected','expired'].includes(req.status);
  const fmt = (d?: string | null) => d ? new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

  return (
    <div className="card space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white font-semibold">{req.requester_name}</p>
          <a href={`mailto:${req.requester_email}`} className="text-indigo-400 text-sm hover:underline">{req.requester_email}</a>
          {req.requester_company && <p className="text-gray-500 text-xs mt-0.5">{req.requester_company}</p>}
          <p className="text-gray-600 text-xs mt-1">{fmt(req.created_at)}</p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* Referee being requested */}
      <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
        {req.referee_has_photo
          ? <img src={adminApi.refereePhoto(req.referee_id)} alt={req.referee_name}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          : <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">👤</div>
        }
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{req.referee_name}</p>
          <p className="text-indigo-400 text-xs truncate">{req.referee_title}</p>
          <p className="text-gray-500 text-xs truncate">{req.referee_organization}</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0"
          style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
          {req.requester_purpose}
        </span>
      </div>

      {/* Their message */}
      {req.requester_message && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>Their message</p>
          <p className="text-sm leading-relaxed italic" style={{ color: '#a1a1aa' }}>&ldquo;{req.requester_message}&rdquo;</p>
        </div>
      )}

      {/* LinkedIn */}
      {req.requester_linkedin_url && (
        <a href={req.requester_linkedin_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
          LinkedIn ↗
        </a>
      )}

      {/* Progress tracker */}
      <div style={{ borderTop: '1px solid #27272a', paddingTop: '16px' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#6b7280' }}>Progress</p>
        <ProgressTracker req={req} />
      </div>

      {/* Activity log */}
      <div style={{ borderTop: '1px solid #27272a', paddingTop: '16px' }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>Activity</p>
        <div className="space-y-2">
          {activityLog(req).map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#a78bfa' }} />
              <div className="min-w-0">
                <p className="text-gray-300 text-xs">{e.text}</p>
                {e.date && <p className="text-gray-600 text-xs">{e.date}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ── */}
      {!isTerminal && (
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid #27272a' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>Actions</p>

          {/* Approve */}
          {req.status === 'submitted' && (
            <div className="flex gap-2">
              <button disabled={actionLoading || !req.requester_email_verified}
                onClick={() => act(() => adminApi.approveContactRequest(req.id))}
                className="btn-primary text-sm flex-1"
                title={!req.requester_email_verified ? 'Waiting for email verification' : ''}>
                {req.requester_email_verified ? 'Approve' : 'Awaiting email verification…'}
              </button>
              <button disabled={actionLoading}
                onClick={() => act(() => adminApi.rejectContactRequest(req.id))}
                className="btn-danger text-sm">
                Reject
              </button>
            </div>
          )}

          {/* Request consent */}
          {req.status === 'approved' && (
            <>
              {!expandConsent ? (
                <div className="flex gap-2">
                  <button onClick={() => setExpandConsent(true)} className="btn-primary text-sm flex-1">
                    Request Referee Consent
                  </button>
                  <button disabled={actionLoading} onClick={() => act(() => adminApi.declineContactRequest(req.id))} className="btn-danger text-sm">
                    Decline
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <p className="text-white text-sm font-medium">Request consent from {req.referee_name}</p>
                  <div>
                    <label className="label text-xs">Note to referee (optional)</label>
                    <textarea className="input min-h-[72px] resize-none text-sm"
                      placeholder="Additional context for the referee..."
                      value={consentNote} onChange={e => setConsentNote(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={actionLoading}
                      onClick={() => act(async () => {
                        const r = await adminApi.requestConsent(req.id, { admin_note: consentNote || undefined });
                        setExpandConsent(false); setConsentNote('');
                        return r;
                      })}
                      className="btn-primary text-sm flex-1">
                      {actionLoading ? 'Sending…' : 'Send Consent Request'}
                    </button>
                    <button onClick={() => { setExpandConsent(false); setConsentNote(''); }} className="btn-ghost text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Awaiting consent */}
          {req.status === 'consent_requested' && (
            <div>
              <div className="flex items-center gap-2 p-3 rounded-xl mb-3"
                style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <span className="text-cyan-400 text-sm">◐</span>
                <p className="text-cyan-300 text-sm">
                  Awaiting {req.referee_name}&apos;s response
                  {req.consent_reminder_count > 0 && ` · ${req.consent_reminder_count} reminder(s) sent`}
                </p>
              </div>
              <button disabled={actionLoading} onClick={() => act(() => adminApi.declineContactRequest(req.id))}
                className="btn-danger text-sm w-full">
                Decline Request
              </button>
            </div>
          )}

          {/* Consent given — SHARE */}
          {req.status === 'consent_given' && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl mb-3"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <span className="text-green-400">✓</span>
                <p className="text-green-300 text-sm">{req.referee_name} gave consent — ready to share</p>
              </div>
              {!expandFulfill ? (
                <div className="flex gap-2">
                  <button onClick={() => setExpandFulfill(true)} className="btn-primary text-sm flex-1">
                    Share Contact →
                  </button>
                  <button disabled={actionLoading} onClick={() => act(() => adminApi.declineContactRequest(req.id))} className="btn-danger text-sm">
                    Decline
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <p className="text-white text-sm font-medium">Share {req.referee_name}&apos;s contact with {req.requester_name}</p>
                  <div>
                    <label className="label text-xs">Personal note (optional)</label>
                    <textarea className="input min-h-[72px] resize-none text-sm"
                      placeholder="e.g. Happy to connect! Feel free to reach out directly."
                      value={fulfillNote} onChange={e => setFulfillNote(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button disabled={actionLoading}
                      onClick={() => act(async () => {
                        const r = await adminApi.fulfillContactRequest(req.id, { admin_note: fulfillNote || undefined });
                        setExpandFulfill(false); setFulfillNote('');
                        return r;
                      })}
                      className="btn-primary text-sm flex-1">
                      {actionLoading ? 'Sending…' : 'Send & Mark Fulfilled'}
                    </button>
                    <button onClick={() => { setExpandFulfill(false); setFulfillNote(''); }} className="btn-ghost text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Consent denied — locked + optional resend */}
          {req.status === 'consent_denied' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="text-red-400 mt-0.5">✕</span>
                <div>
                  <p className="text-red-300 text-sm font-medium">{req.referee_name} declined — contact is locked</p>
                  <p className="text-red-400/60 text-xs mt-0.5">Contact details cannot be shared without consent</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={actionLoading} onClick={() => act(() => adminApi.declineContactRequest(req.id))}
                  className="btn-danger text-sm flex-1">
                  Decline Request
                </button>
                {req.consent_resend_count < 2 && (
                  <button onClick={() => setExpandResend(!expandResend)} className="btn-ghost text-sm">
                    Resend ({2 - req.consent_resend_count} left)
                  </button>
                )}
              </div>
              {expandResend && (
                <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p className="text-yellow-400 text-sm font-medium">Resend consent to {req.referee_name}</p>
                  <p className="text-yellow-300/60 text-xs">Explain why you&apos;re asking again (required)</p>
                  <textarea className="input min-h-[72px] resize-none text-sm"
                    placeholder="e.g. Spoke with Aditya — he's happy to reconsider after our call."
                    value={resendNote} onChange={e => setResendNote(e.target.value)} />
                  <div className="flex gap-2">
                    <button disabled={actionLoading || !resendNote.trim()}
                      onClick={() => act(async () => {
                        const r = await adminApi.resendConsent(req.id, { resend_note: resendNote });
                        setExpandResend(false); setResendNote('');
                        return r;
                      })}
                      className="btn-primary text-sm flex-1">
                      {actionLoading ? 'Sending…' : 'Send'}
                    </button>
                    <button onClick={() => { setExpandResend(false); setResendNote(''); }} className="btn-ghost text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminal states */}
      {req.status === 'fulfilled' && (
        <div className="p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <p className="text-emerald-400 text-sm font-medium">✓ Contact shared on {fmt(req.fulfilled_at)}</p>
          {req.admin_note && <p className="text-emerald-300/70 text-xs mt-1">Note sent: &ldquo;{req.admin_note}&rdquo;</p>}
        </div>
      )}

      {/* Delete */}
      <div className="pt-2 flex justify-end">
        <button onClick={() => {
          if (!confirm('Delete this request permanently?')) return;
          adminApi.deleteContactRequest(req.id).then(() => onDelete(req.id)).catch((e: any) => alert(e.message));
        }} className="text-xs text-red-400 hover:text-red-300">
          Delete request
        </button>
      </div>
    </div>
  );
}

// ── Contact Requests Tab ──────────────────────────────────────
function ContactRequestsTab({ refereeFilterId }: { refereeFilterId?: string }) {
  const [requests, setRequests]   = useState<ContactRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<ContactRequest | null>(null);
  const [filter, setFilter]       = useState<string>('all');

  async function load() {
    setLoading(true);
    try { setRequests(await adminApi.getContactRequests()); }
    catch { }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Apply filters
  const displayed = requests.filter(r => {
    if (refereeFilterId && r.referee_id !== refereeFilterId) return false;
    if (filter === 'all') return true;
    if (filter === 'pending') return r.status === 'submitted';
    if (filter === 'in_progress') return ['approved','consent_requested','consent_given','consent_denied'].includes(r.status);
    if (filter === 'fulfilled') return r.status === 'fulfilled';
    if (filter === 'declined') return ['declined','rejected','expired'].includes(r.status);
    return true;
  });

  const counts = {
    all:         requests.length,
    pending:     requests.filter(r => r.status === 'submitted').length,
    in_progress: requests.filter(r => ['approved','consent_requested','consent_given','consent_denied'].includes(r.status)).length,
    fulfilled:   requests.filter(r => r.status === 'fulfilled').length,
    declined:    requests.filter(r => ['declined','rejected','expired'].includes(r.status)).length,
  };

  const fmt = (d: string) => new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  if (loading) return <p className="text-gray-500 text-sm py-8">Loading…</p>;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {([
          { key: 'all',         label: 'Total',           color: '#a78bfa' },
          { key: 'pending',     label: 'Pending Approval', color: '#fbbf24' },
          { key: 'in_progress', label: 'In Progress',     color: '#67e8f9' },
          { key: 'fulfilled',   label: 'Fulfilled',       color: '#34d399' },
          { key: 'declined',    label: 'Declined',        color: '#6b7280' },
        ] as const).map(({ key, label, color }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="p-3 rounded-xl text-center transition-all"
            style={{
              background: filter === key ? `${color}18` : 'rgba(255,255,255,0.03)',
              border: filter === key ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.06)',
            }}>
            <p className="text-xl font-bold" style={{ color }}>{counts[key]}</p>
            <p className="text-xs mt-0.5" style={{ color: filter === key ? color : '#6b7280' }}>{label}</p>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* List */}
        <div className="space-y-2">
          {displayed.map(r => (
            <button key={r.id} onClick={() => setSelected(r)}
              className={`w-full text-left card transition-all ${selected?.id === r.id ? 'border-indigo-500' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-white truncate">{r.requester_name}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">→ {r.referee_name}</p>
                  {r.requester_company && <p className="text-xs text-gray-600 truncate">{r.requester_company}</p>}
                </div>
                <p className="text-xs text-gray-600 flex-shrink-0">{fmt(r.created_at)}</p>
              </div>
            </button>
          ))}
          {!displayed.length && (
            <p className="text-gray-500 text-sm text-center py-12">
              {filter === 'all' ? 'No contact requests yet.' : `No ${filter} requests.`}
            </p>
          )}
        </div>

        {/* Detail pane */}
        {selected ? (
          <ContactRequestDetail
            key={selected.id}
            req={requests.find(r => r.id === selected.id) ?? selected}
            onUpdate={updated => {
              setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
              setSelected(updated);
            }}
            onDelete={id => {
              setRequests(prev => prev.filter(r => r.id !== id));
              setSelected(null);
            }}
          />
        ) : (
          <div className="card flex items-center justify-center text-gray-600 text-sm">
            Select a request to view details
          </div>
        )}
      </div>
    </div>
  );
}

export default function RefereesPage() {
  const [tab, setTab]         = useState<'referees' | 'invitations' | 'contact-requests'>('referees');
  const [items, setItems]     = useState<Referee[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [contactRequestCounts, setContactRequestCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Referee | null>(null);
  const [form, setForm]           = useState({ ...emptyForm });
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [saving, setSaving]   = useState(false);
  const [inviteModal, setInviteModal] = useState<{ refereeId?: string; refereeName?: string } | null>(null);
  const [starsModal, setStarsModal] = useState<Referee | null>(null);
  const [contactFilterId, setContactFilterId] = useState<string | undefined>();

  function onStarPublished(id: string, cfg: StarConfig) {
    setItems(prev => prev.map(r => r.id === id ? { ...r, star_config: cfg } : r));
  }

  async function loadReferees() {
    try { setItems(await adminApi.getReferees()); }
    catch { }
  }
  async function loadInvitations() {
    try { setInvitations(await adminApi.getInvitations()); }
    catch { }
  }
  async function loadContactRequestCounts() {
    try {
      const all: ContactRequest[] = await adminApi.getContactRequests();
      const counts: Record<string, number> = {};
      all.forEach(r => {
        if (!['fulfilled','declined','rejected','expired'].includes(r.status)) {
          counts[r.referee_id] = (counts[r.referee_id] || 0) + 1;
        }
      });
      setContactRequestCounts(counts);
    } catch { }
  }
  async function load() {
    setLoading(true);
    await Promise.all([loadReferees(), loadInvitations(), loadContactRequestCounts()]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm({ ...emptyForm });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }
  function openEdit(r: Referee) {
    setEditing(r);
    setForm({
      name: r.name, title: r.title, organization: r.organization,
      relationship: r.relationship, review: r.review || '',
      linkedin_url: r.linkedin_url || '', email: r.email || '', phone: r.phone || '',
      available_on_request: String(r.available_on_request),
      visible: String(r.visible), order_index: String(r.order_index ?? 0),
    });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile)   fd.append('photo',    photoFile);
      if (orgLogoFile) fd.append('org_logo', orgLogoFile);
      editing
        ? await adminApi.updateReferee(editing.id, fd)
        : await adminApi.createReferee(fd);
      setShowForm(false); loadReferees();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this referee?')) return;
    try { await adminApi.deleteReferee(id); loadReferees(); }
    catch (e: any) { alert(e.message); }
  }

  async function toggleVisibility(r: Referee) {
    try {
      await adminApi.toggleRefereeVisibility(r.id, !r.visible);
      loadReferees();
    } catch (e: any) { alert(e.message); }
  }

  async function revokeInvitation(id: string) {
    if (!confirm('Revoke this invitation link?')) return;
    try { await adminApi.revokeInvitation(id); loadInvitations(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  const modRequested = items.filter(r => r.modification_requested);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Referees</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {items.length} total · {invitations.filter(i => !i.used && !i.expired).length} active links
            {Object.values(contactRequestCounts).reduce((a, b) => a + b, 0) > 0 && (
              <span className="ml-2 text-yellow-400">
                · {Object.values(contactRequestCounts).reduce((a, b) => a + b, 0)} active contact request(s)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setInviteModal({})} className="btn-ghost text-sm">
            + Generate invitation link
          </button>
          <button onClick={openNew} className="btn-primary">+ Add referee</button>
        </div>
      </div>

      {/* Modification requested alert */}
      {modRequested.length > 0 && (
        <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-yellow-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-yellow-400 font-semibold text-sm">Modification requested</p>
            <p className="text-yellow-300/70 text-xs mt-0.5">
              {modRequested.map(r => r.name).join(', ')} {modRequested.length === 1 ? 'has' : 'have'} requested changes to their reference.
              Generate a modification link and send it to them.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {([
          { key: 'referees',         label: 'Referees' },
          { key: 'invitations',      label: `Invitations (${invitations.length})` },
          { key: 'contact-requests', label: `Contact Requests${Object.values(contactRequestCounts).reduce((a,b)=>a+b,0) > 0 ? ` (${Object.values(contactRequestCounts).reduce((a,b)=>a+b,0)})` : ''}` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => { setTab(key); if (key !== 'contact-requests') setContactFilterId(undefined); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === key
              ? { background: 'rgba(124,58,237,0.25)', color: '#a78bfa' }
              : { color: '#6b7280' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Referees Tab ─────────────────────────────────────── */}
      {tab === 'referees' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map(r => (
            <div key={r.id} className="card space-y-3 relative">
              {r.modification_requested && (
                <div className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24' }}>
                  ⚠ Mod requested
                </div>
              )}
              <div className="flex gap-3 items-start">
                {r.has_photo
                  ? <img src={adminApi.refereePhoto(r.id)} alt={r.name}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                }
                <div className="min-w-0 flex-1 pr-20">
                  <p className="text-white font-semibold text-sm truncate">{r.name}</p>
                  <p className="text-indigo-400 text-xs">{r.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {r.has_org_logo
                      ? <img src={adminApi.refereeOrgLogo(r.id)} alt={r.organization}
                          className="w-4 h-4 object-contain rounded" />
                      : null
                    }
                    <p className="text-gray-500 text-xs truncate">{r.organization}</p>
                  </div>
                </div>
              </div>
              <button onClick={() => toggleVisibility(r)}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-colors w-fit"
                style={r.visible
                  ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }
                  : { background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', color: '#6b7280' }}>
                <span>{r.visible ? '● Visible' : '○ Hidden'}</span>
              </button>
              <div className="flex gap-3 flex-wrap pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => openEdit(r)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                <button onClick={() => handleDelete(r.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                <button onClick={() => setStarsModal(r)}
                  className="text-xs transition-colors"
                  style={{ color: r.star_config?.enabled === false ? '#6b7280' : '#a78bfa' }}
                  title="Configure star animation">
                  ✦ Stars{r.star_config?.enabled === false ? ' (off)' : ''}
                </button>
                <button
                  onClick={() => setInviteModal({ refereeId: r.id, refereeName: r.name })}
                  className="text-xs text-yellow-400 hover:text-yellow-300">
                  Generate mod link
                </button>
                {(contactRequestCounts[r.id] ?? 0) > 0 && (
                  <button
                    onClick={() => { setContactFilterId(r.id); setTab('contact-requests'); }}
                    className="text-xs ml-auto"
                    style={{ color: '#fbbf24' }}>
                    📩 {contactRequestCounts[r.id]} request(s) →
                  </button>
                )}
              </div>
            </div>
          ))}
          {!items.length && (
            <p className="text-gray-500 text-sm text-center py-12 col-span-2">No referees yet.</p>
          )}
        </div>
      )}

      {/* ── Invitations Tab ──────────────────────────────────── */}
      {tab === 'invitations' && (
        <div className="space-y-3">
          {invitations.map(inv => {
            const expired = inv.expired;
            const used    = inv.used;
            const active  = !expired && !used;
            return (
              <div key={inv.id} className="card flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={inv.type === 'modify'
                        ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                        : { background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
                      {inv.type === 'modify' ? '✏ Modify' : '+ New'}
                    </span>
                    {inv.referee_name && (
                      <span className="text-gray-400 text-xs">{inv.referee_name}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      used    ? 'text-green-400 bg-green-400/10' :
                      expired ? 'text-gray-500 bg-gray-500/10' :
                                'text-cyan-400 bg-cyan-400/10'
                    }`}>
                      {used ? '✓ Used' : expired ? 'Expired' : 'Active'}
                    </span>
                  </div>
                  {inv.note && <p className="text-gray-300 text-sm">{inv.note}</p>}
                  <p className="text-gray-600 text-xs font-mono truncate">{inv.link}</p>
                  <p className="text-gray-600 text-xs">
                    Expires {new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {inv.used_at && ` · Used ${new Date(inv.used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  {active && <CopyButton text={inv.link} />}
                  {active && (
                    <button onClick={() => revokeInvitation(inv.id)}
                      className="text-xs text-red-400 hover:text-red-300">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!invitations.length && (
            <p className="text-gray-500 text-sm text-center py-12">No invitations yet.</p>
          )}
        </div>
      )}

      {/* ── Contact Requests Tab ────────────────────────────── */}
      {tab === 'contact-requests' && (
        <ContactRequestsTab refereeFilterId={contactFilterId} />
      )}

      {/* ── Referee edit/create modal ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit referee' : 'Add referee'}
            </h2>
            {[
              { key: 'name',         label: 'Full name',                       type: 'text'  },
              { key: 'title',        label: 'Job title',                       type: 'text'  },
              { key: 'organization', label: 'Company / Institution',           type: 'text'  },
              { key: 'relationship', label: 'Relationship (e.g. Direct Manager)', type: 'text' },
              { key: 'linkedin_url', label: 'LinkedIn URL (optional)',          type: 'url'   },
              { key: 'email',        label: 'Email (optional)',                 type: 'email' },
              { key: 'phone',        label: 'Phone (optional)',                 type: 'tel'   },
              { key: 'order_index',  label: 'Order index',                     type: 'number'},
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Review / Testimonial (optional)</label>
              <textarea className="input min-h-[100px] resize-y" value={form.review}
                onChange={e => setForm(p => ({ ...p, review: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="avail" checked={form.available_on_request === 'true'}
                onChange={e => setForm(p => ({ ...p, available_on_request: String(e.target.checked) }))}
                className="w-4 h-4 accent-indigo-500" />
              <label htmlFor="avail" className="text-sm text-gray-300">
                Hide contact details publicly (show &ldquo;Available on request&rdquo;)
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="vis" checked={form.visible === 'true'}
                onChange={e => setForm(p => ({ ...p, visible: String(e.target.checked) }))}
                className="w-4 h-4 accent-indigo-500" />
              <label htmlFor="vis" className="text-sm text-gray-300">Visible on public portfolio</label>
            </div>
            <div>
              <label className="label">Referee photo (optional)</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="label">Company logo (optional)</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setOrgLogoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite / modify link modal ───────────────────────── */}
      {inviteModal !== null && (
        <InviteModal
          refereeId={inviteModal.refereeId}
          refereeName={inviteModal.refereeName}
          onClose={() => setInviteModal(null)}
          onDone={inv => {
            setInvitations(prev => [inv, ...prev]);
            setTab('invitations');
          }}
        />
      )}

      {/* ── Star animation settings modal ───────────────────── */}
      {starsModal !== null && (
        <StarSettingsModal
          referee={starsModal}
          onClose={() => setStarsModal(null)}
          onPublished={onStarPublished}
        />
      )}
    </div>
  );
}
