'use client';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Exp {
  id: string; company: string; role: string;
  start_date: string; end_date?: string;
  ongoing?: boolean; tech_stack?: string[];
}

// ── Duration helper ───────────────────────────────────────────
// LinkedIn-style: every calendar month touched counts as 1 month.
// Both the start month and end/current month are always included (+1).
// Parses year/month directly from ISO string to avoid UTC timezone
// shifting (new Date('2025-09-01') lands in August in UTC+ zones).
function calcDuration(start: string, end: string | null, ongoing: boolean): string {
  if (!start) return '';
  const [fy, fm] = start.split('-').map(Number);
  let ty: number, tm: number;
  if (ongoing || !end) {
    const now = new Date();
    ty = now.getFullYear();
    tm = now.getMonth() + 1; // getMonth() is 0-indexed
  } else {
    [ty, tm] = end.split('-').map(Number);
  }
  // Always +1: counts both the start month and end/current month as full months
  const total = (ty - fy) * 12 + (tm - fm) + 1;
  if (total <= 0) return '< 1 mo';
  const yrs = Math.floor(total / 12);
  const mos = total % 12;
  const parts: string[] = [];
  if (yrs > 0) parts.push(`${yrs} yr${yrs > 1 ? 's' : ''}`);
  if (mos > 0) parts.push(`${mos} mo`);
  return parts.length ? parts.join(' ') : '< 1 mo';
}

function fmtDate(d?: string): string {
  if (!d) return '';
  // Parse manually to avoid UTC shift
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function ExperiencePage() {
  const [items, setItems]       = useState<Exp[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Exp | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [techTags, setTechTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    company: '', role: '', description: '',
    start_date: '', end_date: '', order_index: '0',
    ongoing: false,
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try { setItems(await adminApi.getExperiences()); }
    catch { }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm(emptyForm);
    setTechTags([]); setTagInput(''); setLogoFile(null); setShowForm(true);
  }

  function openEdit(e: Exp) {
    setEditing(e);
    setForm({
      company:     e.company,
      role:        e.role,
      description: (e as any).description || '',
      start_date:  e.start_date?.slice(0, 10) || '',
      end_date:    e.end_date?.slice(0, 10)   || '',
      order_index: String((e as any).order_index ?? 0),
      ongoing:     e.ongoing ?? false,
    });
    setTechTags(Array.isArray(e.tech_stack) ? e.tech_stack : []);
    setTagInput(''); setLogoFile(null); setShowForm(true);
  }

  function addTag() {
    const val = tagInput.trim().replace(/,$/, '');
    if (!val || techTags.includes(val)) { setTagInput(''); return; }
    setTechTags(prev => [...prev, val]); setTagInput('');
  }
  function removeTag(tag: string) { setTechTags(prev => prev.filter(t => t !== tag)); }
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && tagInput === '' && techTags.length > 0)
      setTechTags(prev => prev.slice(0, -1));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('company',     form.company);
      fd.append('role',        form.role);
      fd.append('description', form.description);
      fd.append('start_date',  form.start_date);
      fd.append('ongoing',     String(form.ongoing));
      fd.append('tech_stack',  JSON.stringify(techTags));
      fd.append('order_index', form.order_index);
      if (!form.ongoing && form.end_date) fd.append('end_date', form.end_date);
      if (logoFile) fd.append('logo', logoFile);
      editing
        ? await adminApi.updateExperience(editing.id, fd)
        : await adminApi.createExperience(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this experience?')) return;
    try { await adminApi.deleteExperience(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  const durationPreview = form.start_date
    ? calcDuration(form.start_date, form.end_date || null, form.ongoing)
    : '';

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Experience</h1>
          <p className="text-gray-500 text-sm mt-0.5">{items.length} entries</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ New entry</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit experience' : 'New experience'}
            </h2>
            {[
              { key: 'company',     label: 'Company',     type: 'text'   },
              { key: 'role',        label: 'Role / Title', type: 'text'  },
              { key: 'order_index', label: 'Order index', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Tech stack used</label>
              <p className="text-gray-600 text-xs mb-2">
                Press <kbd className="bg-gray-800 px-1 rounded text-gray-400">Enter</kbd> or{' '}
                <kbd className="bg-gray-800 px-1 rounded text-gray-400">,</kbd> to add. Click to remove.
              </p>
              <div className="input flex flex-wrap gap-2 cursor-text min-h-[44px] py-2"
                onClick={() => tagInputRef.current?.focus()}>
                {techTags.map(tag => (
                  <span key={tag}
                    onClick={e => { e.stopPropagation(); removeTag(tag); }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium
                               bg-indigo-600/20 border border-indigo-500/40 text-indigo-300
                               cursor-pointer hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition-colors">
                    {tag}<span className="opacity-60">×</span>
                  </span>
                ))}
                <input ref={tagInputRef} type="text" value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown} onBlur={addTag}
                  placeholder={techTags.length === 0 ? 'e.g. Kubernetes, AWS…' : ''}
                  className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-white placeholder-gray-600" />
              </div>
              <p className="text-gray-600 text-xs mt-1">{techTags.length} tag{techTags.length !== 1 ? 's' : ''}</p>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-24 resize-none" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="border border-gray-800 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Timeline</p>
              <div>
                <label className="label">Start date</label>
                <input className="input" type="date" value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.ongoing}
                  onChange={e => setForm(p => ({ ...p, ongoing: e.target.checked, end_date: '' }))}
                  className="w-4 h-4 accent-indigo-600" />
                <span className="text-sm text-gray-300">
                  Currently working here
                  <span className="ml-2 text-xs text-green-400">(uses today&apos;s date)</span>
                </span>
              </label>
              {!form.ongoing && (
                <div>
                  <label className="label">End date</label>
                  <input className="input" type="date" value={form.end_date}
                    onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
                </div>
              )}
              {durationPreview && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Duration:</span>
                  <span className="text-indigo-300 font-medium">
                    {fmtDate(form.start_date)} → {form.ongoing ? 'Present' : fmtDate(form.end_date)}
                    {' · '}{durationPreview}
                    {form.ongoing && (
                      <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse align-middle" />
                    )}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label className="label">Company logo</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
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

      <div className="space-y-3">
        {items.map(exp => {
          const dur = exp.start_date
            ? calcDuration(exp.start_date, exp.end_date ?? null, exp.ongoing ?? false)
            : null;
          return (
            <div key={exp.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                {(exp as any).has_logo && (
                  <img src={adminApi.expLogo(exp.id)} alt={exp.company}
                    className="w-10 h-10 object-contain rounded-lg bg-gray-800 p-1 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-white font-medium text-sm truncate">{exp.role}</p>
                  <p className="text-indigo-400 text-sm">{exp.company}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-gray-500 text-xs">
                      {fmtDate(exp.start_date)} –{' '}
                      {exp.ongoing
                        ? <span className="text-green-400">Present</span>
                        : fmtDate(exp.end_date)}
                    </p>
                    {dur && <span className="text-xs text-gray-600">· {dur}</span>}
                    {exp.ongoing && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    )}
                  </div>
                  {exp.tech_stack && exp.tech_stack.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {exp.tech_stack.slice(0, 4).map(t => (
                        <span key={t} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                      {exp.tech_stack.length > 4 && (
                        <span className="text-xs text-gray-600">+{exp.tech_stack.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button onClick={() => openEdit(exp)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                <button onClick={() => handleDelete(exp.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          );
        })}
        {!items.length && <p className="text-gray-500 text-sm text-center py-12">No experience entries yet.</p>}
      </div>
    </div>
  );
}
