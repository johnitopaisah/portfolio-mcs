'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Exp { id: string; company: string; role: string; start_date: string; end_date?: string; }

export default function ExperiencePage() {
  const [items, setItems] = useState<Exp[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Exp | null>(null);
  const [loading, setLoading] = useState(true);
  const empty = { company: '', role: '', description: '', start_date: '', end_date: '', order_index: '0' };
  const [form, setForm] = useState(empty);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setItems(await adminApi.getExperiences()); } catch { } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setLogoFile(null); setShowForm(true); }
  function openEdit(e: Exp) {
    setEditing(e);
    setForm({ company: e.company, role: e.role, description: (e as any).description || '', start_date: e.start_date?.slice(0, 10) || '', end_date: e.end_date?.slice(0, 10) || '', order_index: String((e as any).order_index ?? 0) });
    setLogoFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logoFile) fd.append('logo', logoFile);
      editing ? await adminApi.updateExperience(editing.id, fd) : await adminApi.createExperience(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this experience?')) return;
    try { await adminApi.deleteExperience(id); load(); } catch (e: any) { alert(e.message); }
  }

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Present';

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Experience</h1><p className="text-gray-500 text-sm mt-0.5">{items.length} entries</p></div>
        <button onClick={openNew} className="btn-primary">+ New entry</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">{editing ? 'Edit experience' : 'New experience'}</h2>
            {[
              { key: 'company',     label: 'Company',     type: 'text'   },
              { key: 'role',        label: 'Role',        type: 'text'   },
              { key: 'start_date',  label: 'Start date',  type: 'date'   },
              { key: 'end_date',    label: 'End date (leave blank if current)', type: 'date' },
              { key: 'order_index', label: 'Order index', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-24 resize-none" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="label">Company logo</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map(exp => (
          <div key={exp.id} className="card flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {(exp as any).has_logo && <img src={adminApi.expLogo(exp.id)} alt={exp.company} className="w-10 h-10 object-contain rounded-lg bg-gray-800 p-1 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-white font-medium text-sm truncate">{exp.role}</p>
                <p className="text-indigo-400 text-sm">{exp.company}</p>
                <p className="text-gray-500 text-xs">{fmt(exp.start_date)} – {fmt(exp.end_date)}</p>
              </div>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <button onClick={() => openEdit(exp)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
              <button onClick={() => handleDelete(exp.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="text-gray-500 text-sm text-center py-12">No experience entries yet.</p>}
      </div>
    </div>
  );
}
