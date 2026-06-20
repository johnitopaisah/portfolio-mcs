'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';

type ContactField = { key: string; label: string; value: string; visible: boolean };

const EMAIL_OPTIONS = [
  { value: 'gmail',        label: 'Gmail (johnitopaisah@gmail.com)' },
  { value: 'professional', label: 'Professional email' },
  { value: 'both',         label: 'Both emails' },
  { value: 'none',         label: 'No email on CV' },
];

const FIELD_LABELS: Record<string, string> = {
  phone:    'Phone',
  email:    'Email',
  website:  'Website',
  location: 'Location',
  linkedin: 'LinkedIn',
  github:   'GitHub',
};

export default function CvIdentityPage() {
  const [identity, setIdentity] = useState<Record<string, unknown>>({});
  const [fields, setFields]     = useState<ContactField[]>([]);
  const [saving, setSaving]     = useState(false);
  const [building, setBuilding] = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [drag, setDrag]         = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getCvIdentity();
      setIdentity(data);
      if (Array.isArray(data.cv_contact_fields) && data.cv_contact_fields.length > 0) {
        setFields(data.cv_contact_fields as ContactField[]);
      } else {
        // Build from existing data
        const built: ContactField[] = [];
        if (data.cv_phone)            built.push({ key: 'phone',    label: 'Phone',    value: data.cv_phone as string,    visible: true });
        if (data.cv_email_primary)    built.push({ key: 'email',    label: 'Email',    value: data.cv_email_primary as string, visible: true });
        if (data.cv_website)          built.push({ key: 'website',  label: 'Website',  value: data.cv_website as string,  visible: true });
        if (data.cv_location_display) built.push({ key: 'location', label: 'Location', value: data.cv_location_display as string, visible: true });
        if (data.cv_linkedin)         built.push({ key: 'linkedin', label: 'LinkedIn', value: data.cv_linkedin as string, visible: true });
        if (data.cv_github)           built.push({ key: 'github',   label: 'GitHub',   value: data.cv_github as string,   visible: true });
        setFields(built);
      }
    } catch {
      setError('Failed to load CV identity');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true); setError('');
    try {
      await adminApi.updateCvIdentity({ ...identity, cv_contact_fields: fields });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleBuildContactFields() {
    setBuilding(true);
    try {
      const result = await adminApi.buildContactFields();
      if (result.cv_contact_fields) setFields(result.cv_contact_fields);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Build failed');
    } finally { setBuilding(false); }
  }

  function updateIdentityField(key: string, value: string) {
    setIdentity(prev => ({ ...prev, [key]: value }));
  }

  function updateField(idx: number, patch: Partial<ContactField>) {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }

  function removeField(idx: number) {
    setFields(prev => prev.filter((_, i) => i !== idx));
  }

  function addField() {
    setFields(prev => [...prev, { key: `custom_${Date.now()}`, label: '', value: '', visible: true }]);
  }

  // Drag-to-reorder
  function onDragStart(idx: number) { setDrag(idx); }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (drag === null || drag === idx) return;
    setFields(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(drag, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    setDrag(idx);
  }
  function onDragEnd() { setDrag(null); }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>CV Identity</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Control exactly how your name, headline, and contact info appear on every CV and cover letter.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Display Name & Headline */}
      <section className="mb-6 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>Display Identity</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
              CV Display Name <span style={{ color: 'rgba(255,255,255,0.45)' }}>(overrides legal name on all documents)</span>
            </label>
            <input
              type="text"
              value={(identity.cv_display_name as string) || ''}
              onChange={e => updateIdentityField('cv_display_name', e.target.value)}
              placeholder="e.g. John Isah"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Professional Headline
            </label>
            <input
              type="text"
              value={(identity.cv_headline as string) || ''}
              onChange={e => updateIdentityField('cv_headline', e.target.value)}
              placeholder="e.g. Full-Stack Engineer | DevOps | Open to Relocation"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
            />
          </div>
        </div>
      </section>

      {/* Email for CV */}
      <section className="mb-6 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: '#DDD6FE' }}>Email Displayed on CV</h2>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>Choose which email appears in your CV contact block.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EMAIL_OPTIONS.map(opt => {
            const active = (identity.cv_email_choice as string) === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateIdentityField('cv_email_choice', opt.value)}
                className="text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: active ? 'rgba(168,85,247,0.18)' : 'rgba(0,0,0,0.22)',
                  border: `1px solid ${active ? '#A855F7' : 'rgba(255,255,255,0.1)'}`,
                  color: active ? '#DDD6FE' : 'rgba(255,255,255,0.65)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* App-from email tracking */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>Application-from emails (used to track which email you applied with)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Gmail address</label>
              <input
                type="email"
                value={((identity.application_emails as Record<string,string>) || {}).gmail || ''}
                onChange={e => updateIdentityField('application_emails', JSON.stringify({ ...((identity.application_emails as Record<string,string>) || {}), gmail: e.target.value }))}
                placeholder="johnitopaisah@gmail.com"
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Professional email</label>
              <input
                type="email"
                value={((identity.application_emails as Record<string,string>) || {}).professional || ''}
                onChange={e => updateIdentityField('application_emails', JSON.stringify({ ...((identity.application_emails as Record<string,string>) || {}), professional: e.target.value }))}
                placeholder="john@johnisah.com"
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Contact Block Builder */}
      <section className="mb-6 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#DDD6FE' }}>Contact Block</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Drag to reorder. Toggle visibility. Appears in this exact order on your CV.</p>
          </div>
          <button
            onClick={handleBuildContactFields}
            disabled={building}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(168,85,247,0.15)', color: '#DDD6FE', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            {building ? 'Building…' : 'Auto-build from profile'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {fields.map((f, idx) => (
            <div
              key={f.key}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDragEnd={onDragEnd}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: drag === idx ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'grab',
                opacity: f.visible ? 1 : 0.45,
              }}
            >
              {/* Drag handle */}
              <div style={{ color: 'rgba(255,255,255,0.32)', cursor: 'grab' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h2v2H9zm4 0h2v2h-2zM9 7h2v2H9zm4 0h2v2h-2zM9 11h2v2H9zm4 0h2v2h-2zM9 15h2v2H9zm4 0h2v2h-2zM9 19h2v2H9zm4 0h2v2h-2z"/></svg>
              </div>
              {/* Label */}
              <input
                type="text"
                value={f.label || FIELD_LABELS[f.key] || f.key}
                onChange={e => updateField(idx, { label: e.target.value })}
                className="w-24 text-xs px-2 py-1 rounded-lg"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(255,255,255,0.65)', outline: 'none' }}
              />
              {/* Value */}
              <input
                type="text"
                value={f.value}
                onChange={e => updateField(idx, { value: e.target.value })}
                className="flex-1 text-xs px-2 py-1 rounded-lg"
                style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.92)', outline: 'none' }}
              />
              {/* Toggle visibility */}
              <button
                onClick={() => updateField(idx, { visible: !f.visible })}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{ background: f.visible ? 'rgba(168,85,247,0.15)' : 'rgba(100,116,139,0.1)', color: f.visible ? '#A855F7' : 'rgba(255,255,255,0.32)' }}
                title={f.visible ? 'Hide from CV' : 'Show on CV'}
              >
                {f.visible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                )}
              </button>
              {/* Remove */}
              <button
                onClick={() => removeField(idx)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ color: 'rgba(255,255,255,0.45)' }}
                title="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}

          <button
            onClick={addField}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs mt-1 transition-all"
            style={{ background: 'rgba(168,85,247,0.07)', border: '1px dashed rgba(168,85,247,0.25)', color: '#A855F7' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add custom field
          </button>
        </div>
      </section>

      {/* Other CV fields */}
      <section className="mb-6 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>Additional CV Fields</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'cv_website',          label: 'Website URL',     ph: 'https://johnisah.com' },
            { key: 'cv_phone',            label: 'Phone',           ph: '+44 7700 000000' },
            { key: 'cv_location_display', label: 'Location (CV)',   ph: 'London, UK (Open to relocation)' },
            { key: 'cv_linkedin',         label: 'LinkedIn URL',    ph: 'https://linkedin.com/in/...' },
            { key: 'cv_github',           label: 'GitHub URL',      ph: 'https://github.com/...' },
            { key: 'cv_email_primary',    label: 'Primary email',   ph: 'email@example.com' },
            { key: 'cv_email_secondary',  label: 'Secondary email', ph: 'email2@example.com' },
          ].map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</label>
              <input
                type="text"
                value={(identity[key] as string) || ''}
                onChange={e => updateIdentityField(key, e.target.value)}
                placeholder={ph}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: saving ? 'rgba(168,85,247,0.3)' : 'linear-gradient(135deg, #A855F7, #7C3AED)',
            color: '#fff',
          }}
        >
          {saving ? 'Saving…' : 'Save CV Identity'}
        </button>
        {saved && <span className="text-sm" style={{ color: '#4ade80' }}>Saved!</span>}
      </div>
    </div>
  );
}
