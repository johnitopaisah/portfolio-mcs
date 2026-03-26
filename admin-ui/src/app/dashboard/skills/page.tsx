'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Skill { id: string; name: string; category: string; proficiency: number; }

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const emptyForm = { name: '', category: '', proficiency: '3', order_index: '0' };
  const [form, setForm] = useState(emptyForm);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setSkills(await adminApi.getSkills()); } catch { } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(emptyForm); setIconFile(null); setShowForm(true); }
  function openEdit(s: Skill) {
    setEditing(s);
    setForm({ name: s.name, category: s.category, proficiency: String(s.proficiency), order_index: String((s as any).order_index ?? 0) });
    setIconFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name); fd.append('category', form.category);
      fd.append('proficiency', form.proficiency); fd.append('order_index', form.order_index);
      if (iconFile) fd.append('icon', iconFile);
      editing ? await adminApi.updateSkill(editing.id, fd) : await adminApi.createSkill(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this skill?')) return;
    try { await adminApi.deleteSkill(id); load(); } catch (e: any) { alert(e.message); }
  }

  const grouped = skills.reduce((acc, s) => { if (!acc[s.category]) acc[s.category] = []; acc[s.category].push(s); return acc; }, {} as Record<string, Skill[]>);

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Skills</h1><p className="text-gray-500 text-sm mt-0.5">{skills.length} total</p></div>
        <button onClick={openNew} className="btn-primary">+ New skill</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-white">{editing ? 'Edit skill' : 'New skill'}</h2>
            {[
              { key: 'name',        label: 'Name',         type: 'text'   },
              { key: 'category',    label: 'Category',     type: 'text'   },
              { key: 'order_index', label: 'Order index',  type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Proficiency (1–5)</label>
              <input className="input" type="range" min="1" max="5" value={form.proficiency}
                onChange={e => setForm(p => ({ ...p, proficiency: e.target.value }))} />
              <p className="text-gray-400 text-xs mt-1">Level {form.proficiency} / 5</p>
            </div>
            <div>
              <label className="label">Icon (image / SVG)</label>
              <input type="file" accept="image/*,.svg" className="input py-1.5"
                onChange={e => setIconFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="card">
            <h3 className="text-indigo-400 font-mono text-xs uppercase tracking-widest mb-4">{cat}</h3>
            <div className="space-y-2">
              {items.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    {(s as any).has_icon && <img src={adminApi.skillIcon(s.id)} alt={s.name} className="w-6 h-6 object-contain" />}
                    <span className="text-white text-sm font-medium">{s.name}</span>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => <div key={n} className={`w-2 h-2 rounded-full ${n <= s.proficiency ? 'bg-indigo-500' : 'bg-gray-700'}`} />)}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(s)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                    <button onClick={() => handleDelete(s.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!skills.length && <p className="text-gray-500 text-sm text-center py-12">No skills yet.</p>}
      </div>
    </div>
  );
}
