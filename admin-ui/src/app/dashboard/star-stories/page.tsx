'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';

const THEMES = [
  'Leadership', 'Teamwork', 'Problem Solving', 'Communication', 'Adaptability',
  'Initiative', 'Conflict Resolution', 'Technical', 'Deadline/Pressure', 'Innovation',
  'Customer Focus', 'Mentoring', 'Project Management', 'Data-Driven', 'Failure/Learning',
];

type Story = {
  id: number;
  title: string;
  theme: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  keywords: string[];
  usage_count?: number;
  created_at?: string;
};

const EMPTY: Omit<Story, 'id' | 'created_at' | 'usage_count'> = {
  title: '', theme: '', situation: '', task: '', action: '', result: '', keywords: [],
};

export default function StarStoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [form, setForm]       = useState({ ...EMPTY });
  const [kwInput, setKwInput] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [expanded, setExpanded]       = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getStarStories();
      setStories(data.stories || data || []);
    } catch { setError('Failed to load stories'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY });
    setEditing(null);
    setKwInput('');
    setError('');
    setOpen(true);
  }

  function openEdit(s: Story) {
    setForm({
      title: s.title, theme: s.theme,
      situation: s.situation, task: s.task, action: s.action, result: s.result,
      keywords: s.keywords || [],
    });
    setKwInput((s.keywords || []).join(', '));
    setEditing(s);
    setError('');
    setOpen(true);
  }

  function addKeyword(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const kw = kwInput.trim().replace(/,$/, '');
      if (kw && !form.keywords.includes(kw)) {
        setForm(prev => ({ ...prev, keywords: [...prev.keywords, kw] }));
      }
      setKwInput('');
    }
  }

  function removeKeyword(kw: string) {
    setForm(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
  }

  async function handleSave() {
    if (!form.title || !form.theme) { setError('Title and theme are required'); return; }
    if (!form.situation || !form.task || !form.action || !form.result) {
      setError('All STAR fields are required'); return;
    }
    setSaving(true); setError('');
    try {
      if (editing) {
        await adminApi.updateStarStory(editing.id, form);
      } else {
        await adminApi.createStarStory(form);
      }
      await load();
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this STAR story?')) return;
    try { await adminApi.deleteStarStory(id); await load(); }
    catch { setError('Delete failed'); }
  }

  const filtered = stories.filter(s => {
    if (themeFilter && s.theme !== themeFilter) return false;
    if (search && !`${s.title} ${s.situation} ${s.action}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>STAR Stories</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Build your library of behavioral interview answers using the STAR framework.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Story
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search stories…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
        />
        <select
          value={themeFilter}
          onChange={e => setThemeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(255,255,255,0.65)', outline: 'none' }}
        >
          <option value="">All themes</option>
          {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="px-3 py-2 rounded-xl text-sm" style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {filtered.length} / {stories.length} stories
        </span>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">⭐</div>
          <p style={{ color: 'rgba(255,255,255,0.45)' }}>No stories yet. Build your first STAR story!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(s => (
            <div
              key={s.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {/* Card header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(168,85,247,0.15)', color: '#DDD6FE' }}
                  >
                    {s.theme}
                  </span>
                  <p className="font-semibold text-sm truncate" style={{ color: '#FFFFFF' }}>{s.title}</p>
                  {(s.usage_count ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                      Used {s.usage_count}×
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(s); }}
                    className="p-2 rounded-lg text-xs transition-all"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                    title="Edit"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                    className="p-2 rounded-lg transition-all"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                    title="Delete"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'rgba(255,255,255,0.32)', transform: expanded === s.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {/* Expanded STAR content */}
              {expanded === s.id && (
                <div className="px-5 pb-5" style={{ borderTop: '1px solid rgba(168,85,247,0.1)' }}>
                  <div className="grid grid-cols-1 gap-4 mt-4">
                    {(['situation', 'task', 'action', 'result'] as const).map(key => (
                      <div key={key}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{
                              background: { situation: 'rgba(168,85,247,0.2)', task: 'rgba(234,179,8,0.15)', action: 'rgba(59,130,246,0.15)', result: 'rgba(74,222,128,0.12)' }[key],
                              color: { situation: '#DDD6FE', task: '#fbbf24', action: '#60a5fa', result: '#4ade80' }[key],
                            }}
                          >
                            {key.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-xs font-medium capitalize" style={{ color: 'rgba(255,255,255,0.65)' }}>{key}</span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{s[key]}</p>
                      </div>
                    ))}
                  </div>
                  {s.keywords?.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-4">
                      {s.keywords.map(kw => (
                        <span key={kw} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.2)' }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
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
              <h2 className="font-semibold" style={{ color: '#FFFFFF' }}>{editing ? 'Edit Story' : 'New STAR Story'}</h2>
              <button onClick={() => setOpen(false)} style={{ color: 'rgba(255,255,255,0.45)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {error && (
                <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Story Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Led migration to microservices"
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Theme *</label>
                  <select
                    value={form.theme}
                    onChange={e => setForm(p => ({ ...p, theme: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: form.theme ? '#FFFFFF' : 'rgba(255,255,255,0.32)', outline: 'none' }}
                  >
                    <option value="">Select theme…</option>
                    {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {(['situation', 'task', 'action', 'result'] as const).map((key, i) => {
                const labels = ['Situation — Set the context', 'Task — What was your responsibility?', 'Action — What specific steps did you take?', 'Result — What was the outcome? Include metrics.'];
                const colors = ['#DDD6FE', '#fbbf24', '#60a5fa', '#4ade80'];
                return (
                  <div key={key}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: colors[i] }}>{labels[i]}</label>
                    <textarea
                      value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl text-sm resize-y"
                      style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.2)', color: '#FFFFFF', outline: 'none' }}
                    />
                  </div>
                );
              })}

              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Keywords (press Enter or comma to add)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.keywords.map(kw => (
                    <span key={kw} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#DDD6FE' }}>
                      {kw}
                      <button onClick={() => removeKeyword(kw)} style={{ color: '#A855F7', lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={kwInput}
                  onChange={e => setKwInput(e.target.value)}
                  onKeyDown={addKeyword}
                  placeholder="leadership, mentoring, React…"
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.65)' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: saving ? 'rgba(168,85,247,0.3)' : 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
                >
                  {saving ? 'Saving…' : editing ? 'Update Story' : 'Create Story'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
