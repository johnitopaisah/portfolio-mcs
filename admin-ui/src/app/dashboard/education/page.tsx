'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Education {
  id: string;
  institution: string;
  institution_url?: string;
  degree: string;
  field_of_study: string;
  description?: string;
  grade?: string;
  activities?: string;
  start_date: string;
  end_date?: string;
  ongoing: boolean;
  has_logo: boolean;
  order_index: number;
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

const emptyForm = {
  institution: '', institution_url: '', degree: '', field_of_study: '',
  description: '', grade: '', activities: '',
  start_date: '', end_date: '', ongoing: 'false', order_index: '0',
};

export default function EducationPage() {
  const [items, setItems]     = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Education | null>(null);
  const [form, setForm]         = useState({ ...emptyForm });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);

  async function load() {
    try { setItems(await adminApi.getEducation()); }
    catch { }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm({ ...emptyForm }); setLogoFile(null); setShowForm(true);
  }

  function openEdit(e: Education) {
    setEditing(e);
    setForm({
      institution:     e.institution,
      institution_url: e.institution_url  || '',
      degree:          e.degree,
      field_of_study:  e.field_of_study,
      description:     e.description      || '',
      grade:           e.grade            || '',
      activities:      e.activities       || '',
      start_date:      e.start_date?.slice(0, 10) || '',
      end_date:        e.end_date?.slice(0, 10)   || '',
      ongoing:         String(e.ongoing),
      order_index:     String(e.order_index ?? 0),
    });
    setLogoFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logoFile) fd.append('logo', logoFile);
      editing
        ? await adminApi.updateEducation(editing.id, fd)
        : await adminApi.createEducation(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this education entry?')) return;
    try { await adminApi.deleteEducation(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Education</h1>
          <p className="text-gray-500 text-sm mt-0.5">{items.length} entries</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add education</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit education' : 'Add education'}
            </h2>

            {[
              { key: 'institution',     label: 'Institution name',          type: 'text' },
              { key: 'institution_url', label: 'Institution website (URL)',  type: 'url'  },
              { key: 'degree',          label: 'Degree (e.g. B.Sc., HND)',  type: 'text' },
              { key: 'field_of_study',  label: 'Field of study / Course',   type: 'text' },
              { key: 'grade',           label: 'Grade / Result (optional)',  type: 'text' },
              { key: 'start_date',      label: 'Start date',                type: 'date' },
              { key: 'end_date',        label: 'End date (leave blank if ongoing)', type: 'date' },
              { key: 'order_index',     label: 'Order index',               type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}

            <div>
              <label className="label">Description (optional)</label>
              <textarea className="input min-h-[80px] resize-y" value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div>
              <label className="label">Activities / Extra-curriculars (optional)</label>
              <textarea className="input min-h-[60px] resize-y" value={form.activities}
                onChange={e => setForm(p => ({ ...p, activities: e.target.value }))} />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="ongoing" checked={form.ongoing === 'true'}
                onChange={e => setForm(p => ({ ...p, ongoing: String(e.target.checked) }))}
                className="w-4 h-4 accent-indigo-500" />
              <label htmlFor="ongoing" className="text-sm text-gray-300">Currently studying here</label>
            </div>

            <div>
              <label className="label">Institution logo (optional)</label>
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
        {items.map(e => (
          <div key={e.id} className="card flex gap-4 items-start">
            {e.has_logo
              ? <img src={adminApi.educationLogo(e.id)} alt={e.institution}
                  className="w-14 h-14 object-contain rounded-xl flex-shrink-0" />
              : <div className="w-14 h-14 bg-gray-800 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                  🎓
                </div>
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-white font-semibold">{e.institution}</p>
                  <p className="text-indigo-400 text-sm">{e.degree} · {e.field_of_study}</p>
                  {e.grade && <p className="text-yellow-400 text-xs mt-0.5">{e.grade}</p>}
                </div>
                <p className="text-gray-500 text-xs whitespace-nowrap">
                  {fmtDate(e.start_date)} → {e.ongoing ? 'Present' : fmtDate(e.end_date)}
                </p>
              </div>
              {e.institution_url && (
                <a href={e.institution_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 mt-0.5 inline-block">
                  {e.institution_url} ↗
                </a>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={() => openEdit(e)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                <button onClick={() => handleDelete(e.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!items.length && (
          <p className="text-gray-500 text-sm text-center py-12">No education entries yet.</p>
        )}
      </div>
    </div>
  );
}
