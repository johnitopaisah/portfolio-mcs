'use client';
import { useState } from 'react';

interface ExistingData {
  name: string; title: string; organization: string; relationship: string;
  review?: string; linkedin_url?: string; email?: string; phone?: string;
  available_on_request: boolean; has_photo: boolean; has_org_logo: boolean;
  referee_id: string;
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
        if (k === 'customRelationship') return; // never send raw
        if (k === 'relationship') { fd.append('relationship', effectiveRelationship); return; }
        fd.append(k, v);
      });
      fd.append('visible', 'true');
      if (photoFile)   fd.append('photo',    photoFile);
      if (orgLogoFile) fd.append('org_logo', orgLogoFile);

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
      setStage('mod_requested'); // still show success — notification is best-effort
    }
  }

  const expiry = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Success screen ────────────────────────────────────────────
  if (stage === 'success' || stage === 'requesting_mod' || stage === 'mod_requested') {
    return (
      <PageShell>
        <div className="text-center max-w-lg mx-auto px-4 py-16 space-y-6">
          {/* Animated checkmark */}
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

          {/* Divider + request modification */}
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

            {/* Summary */}
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
            <FormField label={isModify && (existing?.has_photo) ? 'Your photo (leave blank to keep current)' : 'Your photo'}>
              <FileInput onChange={f => setPhotoFile(f)} file={photoFile} accept="image/*" />
            </FormField>
            <FormField label={isModify && (existing?.has_org_logo) ? 'Company logo (leave blank to keep current)' : 'Company logo'}>
              <FileInput onChange={f => setOrgLogoFile(f)} file={orgLogoFile} accept="image/*" />
            </FormField>
          </div>
        </div>

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
      {/* Subtle glow */}
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
