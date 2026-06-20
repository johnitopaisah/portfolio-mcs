'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';

const CATEGORIES = [
  'follow_up', 'thank_you', 'networking', 'cold_outreach', 'negotiation',
  'decline', 'withdrawal', 'timeline_request', 'rejection_feedback', 'reconnect', 'general', 'other',
];

type Template = {
  id: number;
  name: string;
  category: string;
  subject: string;
  body: string;
  is_system: boolean;
  created_at?: string;
};

const EMPTY: Omit<Template, 'id' | 'is_system' | 'created_at'> = {
  name: '', category: 'follow_up', subject: '', body: '',
};

const PLACEHOLDERS = [
  { token: '{{company}}',        desc: 'Company name' },
  { token: '{{role}}',           desc: 'Job title' },
  { token: '{{recruiter_name}}', desc: 'Recruiter first name' },
  { token: '{{your_name}}',      desc: 'Your display name' },
  { token: '{{applied_date}}',   desc: 'Date applied' },
  { token: '{{interview_date}}', desc: 'Interview date' },
];

const CAT_COLORS: Record<string, string> = {
  follow_up:         'rgba(168,85,247,0.15)',
  thank_you:         'rgba(74,222,128,0.12)',
  networking:        'rgba(59,130,246,0.15)',
  cold_outreach:     'rgba(234,179,8,0.12)',
  negotiation:       'rgba(249,115,22,0.12)',
  decline:           'rgba(239,68,68,0.1)',
  withdrawal:        'rgba(239,68,68,0.1)',
  timeline_request:  'rgba(59,130,246,0.12)',
  rejection_feedback:'rgba(239,68,68,0.08)',
  reconnect:         'rgba(168,85,247,0.12)',
  general:           'rgba(100,116,139,0.12)',
  other:             'rgba(100,116,139,0.12)',
};
const CAT_TEXT: Record<string, string> = {
  follow_up: '#DDD6FE', thank_you: '#4ade80', networking: '#60a5fa',
  cold_outreach: '#fbbf24', negotiation: '#fb923c', decline: '#f87171',
  withdrawal: '#f87171', timeline_request: '#60a5fa', rejection_feedback: '#fca5a5',
  reconnect: '#c4b5fd', general: 'rgba(255,255,255,0.65)', other: 'rgba(255,255,255,0.65)',
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<Template | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [preview, setPreview]     = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getEmailTemplates();
      setTemplates(data.templates || data || []);
    } catch { setError('Failed to load templates'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY });
    setEditing(null);
    setError('');
    setOpen(true);
  }

  function openEdit(t: Template) {
    if (t.is_system) {
      // System templates: offer to duplicate
      if (confirm(`"${t.name}" is a system template. Duplicate it to customize?`)) {
        handleDuplicate(t.id);
      }
      return;
    }
    setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body });
    setEditing(t);
    setError('');
    setOpen(true);
  }

  async function handleDuplicate(id: number) {
    try {
      await adminApi.duplicateEmailTemplate(id);
      await load();
    } catch { setError('Duplicate failed'); }
  }

  async function handleSave() {
    if (!form.name || !form.subject || !form.body) { setError('Name, subject and body are required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await adminApi.updateEmailTemplate(editing.id, form);
      } else {
        await adminApi.createEmailTemplate(form);
      }
      await load();
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDelete(t: Template) {
    if (t.is_system) { alert('System templates cannot be deleted.'); return; }
    if (!confirm(`Delete "${t.name}"?`)) return;
    try { await adminApi.deleteEmailTemplate(t.id); await load(); }
    catch { setError('Delete failed'); }
  }

  function insertPlaceholder(token: string) {
    setForm(prev => ({ ...prev, body: prev.body + token }));
  }

  const filtered = templates.filter(t => {
    if (catFilter && t.category !== catFilter) return false;
    if (search && !`${t.name} ${t.subject}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const systemCount = templates.filter(t => t.is_system).length;
  const customCount = templates.length - systemCount;

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>Email Templates</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {systemCount} system · {customCount} custom
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
        />
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(255,255,255,0.65)', outline: 'none' }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <div
              key={t.id}
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: CAT_COLORS[t.category] || CAT_COLORS.other, color: CAT_TEXT[t.category] || CAT_TEXT.other }}
                    >
                      {t.category.replace(/_/g, ' ')}
                    </span>
                    {t.is_system && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.1)', color: '#fbbf24' }}>
                        System
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-sm" style={{ color: '#FFFFFF' }}>{t.name}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{t.subject}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setPreview(t)}
                    className="p-2 rounded-lg"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                    title="Preview"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  {t.is_system ? (
                    <button
                      onClick={() => handleDuplicate(t.id)}
                      className="p-2 rounded-lg"
                      style={{ color: 'rgba(255,255,255,0.45)' }}
                      title="Duplicate"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(t)}
                        className="p-2 rounded-lg"
                        style={{ color: 'rgba(255,255,255,0.45)' }}
                        title="Edit"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="p-2 rounded-lg"
                        style={{ color: 'rgba(255,255,255,0.45)' }}
                        title="Delete"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {t.body.replace(/\{\{[^}]+\}\}/g, '…')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}
        >
          <div className="w-full max-w-xl rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="font-semibold text-sm" style={{ color: '#FFFFFF' }}>{preview.name}</h2>
              <button onClick={() => setPreview(null)} style={{ color: 'rgba(255,255,255,0.45)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Subject</p>
              <p className="text-sm mb-4 font-medium" style={{ color: '#FFFFFF' }}>{preview.subject}</p>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Body</p>
              <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'inherit' }}>
                {preview.body}
              </pre>
              <div className="mt-4 pt-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {PLACEHOLDERS.filter(p => preview.body.includes(p.token)).map(p => (
                  <span key={p.token} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#DDD6FE' }}>
                    {p.token}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)' }}
          >
            <div className="sticky top-0 flex items-center justify-between px-6 py-4" style={{ background: 'rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="font-semibold" style={{ color: '#FFFFFF' }}>{editing ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setOpen(false)} style={{ color: 'rgba(255,255,255,0.45)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {error && <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Template Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Follow up after interview"
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Subject Line *</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="e.g. Following up on my {{role}} application at {{company}}"
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                />
              </div>

              {/* Placeholder chips */}
              <div>
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Click a placeholder to insert it into the body:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {PLACEHOLDERS.map(p => (
                    <button
                      key={p.token}
                      onClick={() => insertPlaceholder(p.token)}
                      className="text-xs px-2.5 py-1 rounded-full transition-all"
                      style={{ background: 'rgba(255,255,255,0.1)', color: '#DDD6FE', border: '1px solid rgba(168,85,247,0.2)' }}
                      title={p.desc}
                    >
                      {p.token}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Email Body *</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                  rows={12}
                  className="w-full px-3 py-2.5 rounded-xl text-sm resize-y font-mono"
                  style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                  placeholder="Hi {{recruiter_name}},&#10;&#10;I wanted to follow up on my application for the {{role}} role at {{company}}…"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.65)' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: saving ? 'rgba(168,85,247,0.3)' : 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
                >
                  {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
