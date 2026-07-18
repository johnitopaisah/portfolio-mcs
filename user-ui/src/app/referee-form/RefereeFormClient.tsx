'use client';
import { useEffect, useMemo, useState } from 'react';

// ── Star animation types + constants (shared with admin) ─────
interface StarConfig {
  enabled: boolean;
  count: number;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  speed: 'slow' | 'normal' | 'fast';
  sparkle_ratio: number;
  mask_start: number;
  colors: string[];
}

const ALL_STAR_COLORS = [
  { label: 'Violet', hex: '#a78bfa' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Amber',  hex: '#fcd34d' },
  { label: 'Pink',   hex: '#f9a8d4' },
  { label: 'White',  hex: '#ffffff' },
  { label: 'Purple', hex: '#c4b5fd' },
  { label: 'Mint',   hex: '#86efac' },
];

const STAR_SIZE_MAP: Record<string, [number, number]> = {
  xs: [1.5, 3.5], sm: [2.5, 5], md: [3.5, 7], lg: [5, 9], xl: [7, 13],
};

const STAR_SPEED_MAP: Record<string, [number, number]> = {
  slow: [3, 6], normal: [1.8, 4.2], fast: [0.8, 2],
};

const DEFAULT_STAR_CONFIG: StarConfig = {
  enabled: true, count: 32, size: 'md', speed: 'normal',
  sparkle_ratio: 0.55, mask_start: 28,
  colors: ALL_STAR_COLORS.map(c => c.hex),
};

interface StarBase {
  id: number; x: number; y: number; delay: number;
  sizeRatio: number; durationRatio: number; colorSlot: number; typeRoll: number;
}

function generateStarBases(count: number): StarBase[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100, y: Math.random() * 100,
    delay: Math.random() * 3.5,
    sizeRatio: Math.random(), durationRatio: Math.random(),
    colorSlot: Math.floor(Math.random() * 7), typeRoll: Math.random(),
  }));
}

function StarSlider({ label, value, min, max, format, onChange }: {
  label: string; value: number; min: number; max: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</p>
        <p className="text-xs" style={{ color: '#a78bfa' }}>{format(value)}</p>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer" style={{ accentColor: '#a78bfa' }} />
      <div className="flex justify-between mt-0.5">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>{min}</span>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>{max}</span>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────
interface ExistingData {
  name: string; title: string; organization: string; relationship: string;
  review?: string; linkedin_url?: string; email?: string; phone?: string;
  available_on_request: boolean; has_photo: boolean; has_org_logo: boolean;
  referee_id: string;
  star_config?: StarConfig | null;
}

interface Props {
  token: string;
  type: 'create' | 'modify';
  expiresAt: string;
  existing?: ExistingData;
}

type Stage = 'form' | 'confirming' | 'submitting' | 'success' | 'requesting_mod' | 'mod_requested';

const RELATIONSHIPS = [
  'Direct Manager', 'Senior Manager', 'Team Lead', 'Colleague',
  'Academic Supervisor', 'Mentor', 'Client', 'Other',
];

export default function RefereeFormClient({ token, type, expiresAt, existing }: Props) {
  const isModify = type === 'modify';

  const [stage, setStage] = useState<Stage>('form');
  const [submittedName, setSubmittedName] = useState('');
  const [error, setError] = useState('');

  const existingRel       = existing?.relationship || '';
  const isExistingOther   = existingRel && !RELATIONSHIPS.slice(0, -1).includes(existingRel);
  const [form, setForm] = useState({
    name:                 existing?.name         || '',
    title:                existing?.title        || '',
    organization:         existing?.organization || '',
    relationship:         isExistingOther ? 'Other' : (existingRel || RELATIONSHIPS[0]),
    customRelationship:   isExistingOther ? existingRel : '',
    review:               existing?.review       || '',
    linkedin_url:         existing?.linkedin_url || '',
    email:                existing?.email        || '',
    phone:                existing?.phone        || '',
    available_on_request: existing ? String(existing.available_on_request) : 'true',
  });
  const [photoFile,   setPhotoFile]   = useState<File | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);

  // Star animation state
  const [starConfig, setStarConfig] = useState<StarConfig>(
    existing?.star_config ?? DEFAULT_STAR_CONFIG
  );
  const [animOpen, setAnimOpen] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) { setPhotoPreviewUrl(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const hasPhoto = existing?.has_photo || photoFile !== null;
  const previewSrc = photoPreviewUrl
    ?? (existing?.has_photo ? `/api/referees/${existing.referee_id}/photo` : null);

  const starBases = useMemo(() => generateStarBases(starConfig.count), [starConfig.count]);
  const activeStarColors = starConfig.colors.length > 0 ? starConfig.colors : ALL_STAR_COLORS.map(c => c.hex);
  const maskStyle = `radial-gradient(ellipse 52% 48% at 50% 50%, transparent ${starConfig.mask_start}%, rgba(0,0,0,0.5) ${starConfig.mask_start + 24}%, black ${starConfig.mask_start + 47}%)`;

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  const effectiveRelationship = form.relationship === 'Other'
    ? form.customRelationship.trim()
    : form.relationship;

  function validate() {
    if (!form.name.trim())         return 'Full name is required.';
    if (!form.title.trim())        return 'Job title is required.';
    if (!form.organization.trim()) return 'Company / Institution is required.';
    if (!effectiveRelationship)    return 'Please specify your relationship.';
    return '';
  }

  function handleSubmitClick() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStage('confirming');
  }

  async function confirmSubmit() {
    setStage('submitting');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'customRelationship') return;
        if (k === 'relationship') { fd.append('relationship', effectiveRelationship); return; }
        fd.append(k, v);
      });
      fd.append('visible', 'true');
      if (photoFile)   fd.append('photo',    photoFile);
      if (orgLogoFile) fd.append('org_logo', orgLogoFile);
      if (hasPhoto)    fd.append('star_config', JSON.stringify(starConfig));

      const res = await fetch(`/api/referee-invitations/${token}/submit`, {
        method: 'POST', body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      setSubmittedName(form.name);
      setStage('success');
    } catch (e: any) {
      setError(e.message || 'Submission failed. Please try again.');
      setStage('form');
    }
  }

  async function requestModification() {
    setStage('requesting_mod');
    try {
      await fetch(`/api/referee-invitations/${token}/request-modification`, { method: 'POST' });
      setStage('mod_requested');
    } catch {
      setStage('mod_requested');
    }
  }

  const expiry = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Success screen ────────────────────────────────────────────
  if (stage === 'success' || stage === 'requesting_mod' || stage === 'mod_requested') {
    return (
      <PageShell>
        <div className="text-center max-w-lg mx-auto px-4 py-16 space-y-6">
          <div className="relative w-24 h-24 mx-auto">
            <div className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '2px solid rgba(34,197,94,0.4)',
                boxShadow: '0 0 40px rgba(34,197,94,0.2)',
              }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white">
              {stage === 'mod_requested' ? 'Request sent!' : `Thank you, ${submittedName.split(' ')[0]}!`}
            </h1>

            {stage === 'mod_requested' ? (
              <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Your modification request has been sent. John will review it and send you an edit link shortly.
              </p>
            ) : (
              <>
                <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {isModify
                    ? 'Your reference has been updated successfully.'
                    : 'Your reference has been submitted and is now live on John\'s portfolio.'}
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {isModify
                    ? 'The changes are live immediately.'
                    : 'Your kind words mean a lot — thank you for taking the time!'}
                </p>
              </>
            )}
          </div>

          {stage === 'success' && (
            <div className="pt-6 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Made a mistake? You can request a modification.
              </p>
              <button onClick={requestModification}
                className="text-sm px-5 py-2.5 rounded-xl transition-all"
                style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  color: '#fbbf24',
                }}>
                Request a modification →
              </button>
            </div>
          )}

          {stage === 'requesting_mod' && (
            <p className="text-sm animate-pulse" style={{ color: 'rgba(255,255,255,0.4)' }}>Sending request…</p>
          )}
        </div>
      </PageShell>
    );
  }

  // ── Confirmation dialog ───────────────────────────────────────
  if (stage === 'confirming') {
    return (
      <PageShell>
        <div className="max-w-lg mx-auto px-4 py-16 space-y-8">
          <div className="p-6 rounded-2xl space-y-5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Please review before submitting</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {isModify
                    ? 'This will update your existing reference on John\'s portfolio immediately.'
                    : 'This is a one-time submission link. Once submitted, your reference will be live on John\'s portfolio immediately.'}
                  {' '}If you need changes after submitting, you can request a modification and John will be notified.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { label: 'Name',         value: form.name },
                { label: 'Title',        value: form.title },
                { label: 'Organisation', value: form.organization },
                { label: 'Relationship', value: effectiveRelationship },
              ].map(r => (
                <div key={r.label} className="flex gap-3">
                  <span className="w-28 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.label}</span>
                  <span className="text-white font-medium">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => setStage('form')}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
              ← Go back and review
            </button>
            <button onClick={confirmSubmit}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}>
              {isModify ? '✓ Update my reference' : '✓ Submit my reference'}
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Submitting spinner ────────────────────────────────────────
  if (stage === 'submitting') {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-32 gap-5">
          <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Submitting your reference…</p>
        </div>
      </PageShell>
    );
  }

  // ── Main form ─────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl mb-4"
            style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
            {isModify ? '✏️' : '📝'}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isModify ? 'Update your reference' : 'John Itopa ISAH asked for your professional reference'}
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {isModify
              ? 'Review and update your details below. All changes take effect immediately.'
              : 'Please fill in your details. Your reference will be published on his portfolio once submitted.'}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            This link expires on {expiry}
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl p-6 space-y-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>

          <FormField label="Full name *">
            <input className="form-input" placeholder="e.g. Mario Valdivia"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </FormField>

          <FormField label="Job title *">
            <input className="form-input" placeholder="e.g. Software Engineering Lead"
              value={form.title} onChange={e => set('title', e.target.value)} />
          </FormField>

          <FormField label="Company / Institution *">
            <input className="form-input" placeholder="e.g. Quandela"
              value={form.organization} onChange={e => set('organization', e.target.value)} />
          </FormField>

          <FormField label="Your relationship with John *">
            <select className="form-input" value={form.relationship}
              onChange={e => set('relationship', e.target.value)}>
              {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>

          {form.relationship === 'Other' && (
            <FormField label="Please specify your relationship *">
              <input className="form-input" placeholder='e.g. "Business Partner", "Former Client"'
                value={form.customRelationship}
                onChange={e => set('customRelationship', e.target.value)} />
            </FormField>
          )}

          <FormField label="LinkedIn profile URL (optional)">
            <input className="form-input" type="url" placeholder="https://linkedin.com/in/..."
              value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} />
          </FormField>

          <FormField label="Review / Testimonial (optional)">
            <textarea className="form-input min-h-[140px] resize-y"
              placeholder="Share a few words about working with John…"
              value={form.review} onChange={e => set('review', e.target.value)} />
          </FormField>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Email (optional)">
              <input className="form-input" type="email" placeholder="your@email.com"
                value={form.email} onChange={e => set('email', e.target.value)} />
            </FormField>
            <FormField label="Phone (optional)">
              <input className="form-input" type="tel" placeholder="+33 7..."
                value={form.phone} onChange={e => set('phone', e.target.value)} />
            </FormField>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <input type="checkbox" id="avail" checked={form.available_on_request === 'true'}
              onChange={e => set('available_on_request', String(e.target.checked))}
              className="mt-0.5 w-4 h-4 flex-shrink-0 accent-violet-500" />
            <label htmlFor="avail" className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Keep my contact details private — show &ldquo;Available on request&rdquo; instead of my email and phone
            </label>
          </div>

          {/* Photo upload */}
          <div className="pt-3 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Images (optional)
            </p>
            <FormField label={isModify && existing?.has_photo ? 'Your photo (leave blank to keep current)' : 'Your photo'}>
              <FileInput onChange={f => setPhotoFile(f)} file={photoFile} accept="image/*" />
            </FormField>
            <FormField label={isModify && existing?.has_org_logo ? 'Company logo (leave blank to keep current)' : 'Company logo'}>
              <FileInput onChange={f => setOrgLogoFile(f)} file={orgLogoFile} accept="image/*" />
            </FormField>
          </div>
        </div>

        {/* ── Star animation section — only when a photo exists ── */}
        {hasPhoto && (
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(124,58,237,0.25)' }}>

            {/* Collapsible header */}
            <button
              onClick={() => setAnimOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 transition-colors"
              style={{ background: animOpen ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.06)' }}>
              <div className="flex items-center gap-3">
                <span style={{ color: '#a78bfa' }}>✦</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">Personalise your star animation</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {starConfig.enabled
                      ? `Enabled · ${starConfig.count} stars · ${starConfig.size} · ${starConfig.speed}`
                      : 'Disabled — no stars on your photo'}
                  </p>
                </div>
              </div>
              <span className="text-sm transition-transform duration-200"
                style={{ color: '#a78bfa', transform: animOpen ? 'rotate(180deg)' : 'none' }}>
                ▾
              </span>
            </button>

            {/* Expanded controls */}
            {animOpen && (
              <div className="p-5 space-y-5"
                style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(124,58,237,0.15)' }}>

                {/* Live preview */}
                <div className="relative rounded-xl overflow-hidden"
                  style={{ height: '260px', background: 'rgba(10,10,20,0.98)' }}>
                  {previewSrc && (
                    <img src={previewSrc} alt="Your photo"
                      className="w-full h-full object-cover object-top" />
                  )}
                  {starConfig.enabled && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ zIndex: 2, maskImage: maskStyle, WebkitMaskImage: maskStyle }}>
                      <style>{`@keyframes twinkle-form-star{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.3)}50%{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
                      {starBases.map(s => {
                        const [minSz, maxSz] = STAR_SIZE_MAP[starConfig.size] ?? STAR_SIZE_MAP.md;
                        const sz  = minSz + s.sizeRatio * (maxSz - minSz);
                        const [minDur, maxDur] = STAR_SPEED_MAP[starConfig.speed] ?? STAR_SPEED_MAP.normal;
                        const dur = minDur + s.durationRatio * (maxDur - minDur);
                        const col = activeStarColors[s.colorSlot % activeStarColors.length];
                        const spark = s.typeRoll < starConfig.sparkle_ratio;
                        return (
                          <div key={s.id} style={{
                            position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                            transform: 'translate(-50%,-50%) scale(0.3)',
                            animation: `twinkle-form-star ${dur}s ease-in-out ${s.delay}s infinite`,
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
                  <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
                    <span className="text-xs px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.4)' }}>
                      This is how your photo will look on the portfolio
                    </span>
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-white">Show stars on my photo</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {starConfig.enabled ? 'Stars will appear around your photo' : 'Photo will display without stars'}
                    </p>
                  </div>
                  <button
                    onClick={() => setStarConfig(c => ({ ...c, enabled: !c.enabled }))}
                    className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200"
                    style={{ background: starConfig.enabled ? '#7c3aed' : '#374151' }}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${starConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {starConfig.enabled && (
                  <>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} className="pt-4 space-y-5">

                      <StarSlider label="Star count" value={starConfig.count} min={10} max={60}
                        format={v => `${v} stars`}
                        onChange={v => setStarConfig(c => ({ ...c, count: v }))} />

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Star size</p>
                          <p className="text-xs uppercase" style={{ color: '#a78bfa' }}>{starConfig.size}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(s => (
                            <button key={s} onClick={() => setStarConfig(c => ({ ...c, size: s }))}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all"
                              style={starConfig.size === s
                                ? { background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.6)', color: '#a78bfa' }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Animation speed</p>
                          <p className="text-xs capitalize" style={{ color: '#a78bfa' }}>{starConfig.speed}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {(['slow', 'normal', 'fast'] as const).map(s => (
                            <button key={s} onClick={() => setStarConfig(c => ({ ...c, speed: s }))}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
                              style={starConfig.speed === s
                                ? { background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.6)', color: '#a78bfa' }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <StarSlider label="Sparkle ratio" value={Math.round(starConfig.sparkle_ratio * 100)} min={0} max={100}
                        format={v => `${v}% sparkles (✦ vs dots)`}
                        onChange={v => setStarConfig(c => ({ ...c, sparkle_ratio: v / 100 }))} />

                      <StarSlider label="Edge clearance" value={starConfig.mask_start} min={10} max={60}
                        format={v => `${v}% from centre`}
                        onChange={v => setStarConfig(c => ({ ...c, mask_start: v }))} />

                      <div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>Star colours</p>
                        <div className="flex flex-wrap gap-2">
                          {ALL_STAR_COLORS.map(({ label, hex }) => {
                            const on = starConfig.colors.includes(hex);
                            return (
                              <button key={hex}
                                onClick={() => setStarConfig(c => ({
                                  ...c,
                                  colors: on ? c.colors.filter(x => x !== hex) : [...c.colors, hex],
                                }))}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                                style={{
                                  background: on ? `${hex}1a` : 'rgba(255,255,255,0.04)',
                                  border: on ? `1px solid ${hex}77` : '1px solid rgba(255,255,255,0.1)',
                                  color: on ? hex : 'rgba(255,255,255,0.3)',
                                }}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: hex, boxShadow: on ? `0 0 5px ${hex}` : 'none' }} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        {starConfig.colors.length === 0 && (
                          <p className="text-xs mt-1.5" style={{ color: '#fbbf24' }}>⚠ Select at least one colour</p>
                        )}
                      </div>

                      <button onClick={() => setStarConfig({ ...DEFAULT_STAR_CONFIG })}
                        className="text-xs transition-colors"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
                        Reset to defaults
                      </button>

                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <button onClick={handleSubmitClick}
          className="w-full py-4 rounded-xl text-base font-bold text-white transition-all hover:scale-[1.01]"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 30px rgba(124,58,237,0.35)' }}>
          {isModify ? 'Update my reference →' : 'Submit my reference →'}
        </button>

        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          By submitting, you agree for your reference to appear publicly on johnisah.com
        </p>
      </div>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg,#0f0f1a 0%,#1a0f2e 50%,#0f1a2e 100%)' }}>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} aria-hidden />
      <div className="relative z-10">{children}</div>

      <style>{`
        .form-input {
          display: block; width: 100%; padding: 0.625rem 0.875rem;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 0.75rem; color: #fff; font-size: 0.875rem; outline: none;
          transition: border-color 0.15s;
        }
        .form-input::placeholder { color: rgba(255,255,255,0.25); }
        .form-input:focus { border-color: rgba(124,58,237,0.6); }
        option { background: #1a1a2e; }
      `}</style>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</label>
      {children}
    </div>
  );
}

function FileInput({ onChange, file, accept }: { onChange: (f: File | null) => void; file: File | null; accept: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer px-4 py-3 rounded-xl transition-all"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)' }}>
      <span className="text-lg">{file ? '✓' : '↑'}</span>
      <span className="text-sm" style={{ color: file ? '#86efac' : 'rgba(255,255,255,0.4)' }}>
        {file ? file.name : 'Choose file…'}
      </span>
      <input type="file" accept={accept} className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}
