'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Referee {
  id: string;
  name: string;
  title: string;
  organization: string;
  relationship: string;
  review?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  available_on_request: boolean;
  visible: boolean;
  has_photo: boolean;
  has_org_logo: boolean;
  order_index: number;
}

const emptyForm = {
  name: '', title: '', organization: '', relationship: '', review: '',
  linkedin_url: '', email: '', phone: '',
  available_on_request: 'true', visible: 'true', order_index: '0',
};

export default function RefereesPage() {
  const [items, setItems]       = useState<Referee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Referee | null>(null);
  const [form, setForm]         = useState({ ...emptyForm });
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);

  async function load() {
    try { setItems(await adminApi.getReferees()); }
    catch { }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm({ ...emptyForm });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }

  function openEdit(r: Referee) {
    setEditing(r);
    setForm({
      name:                 r.name,
      title:                r.title,
      organization:         r.organization,
      relationship:         r.relationship,
      review:               r.review         || '',
      linkedin_url:         r.linkedin_url   || '',
      email:                r.email          || '',
      phone:                r.phone          || '',
      available_on_request: String(r.available_on_request),
      visible:              String(r.visible),
      order_index:          String(r.order_index ?? 0),
    });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile)    fd.append('photo',    photoFile);
      if (orgLogoFile)  fd.append('org_logo', orgLogoFile);
      editing
        ? await adminApi.updateReferee(editing.id, fd)
        : await adminApi.createReferee(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this referee?')) return;
    try { await adminApi.deleteReferee(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Referees</h1>
          <p className="text-gray-500 text-sm mt-0.5">{items.length} total</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ Add referee</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit referee' : 'Add referee'}
            </h2>

            {[
              { key: 'name',         label: 'Full name',                      type: 'text' },
              { key: 'title',        label: 'Job title',                      type: 'text' },
              { key: 'organization', label: 'Company / Institution',          type: 'text' },
              { key: 'relationship', label: 'Relationship (e.g. Direct Manager)', type: 'text' },
              { key: 'linkedin_url', label: 'LinkedIn URL (optional)',        type: 'url'  },
              { key: 'email',        label: 'Email (optional)',               type: 'email' },
              { key: 'phone',        label: 'Phone (optional)',               type: 'tel'  },
              { key: 'order_index',  label: 'Order index',                   type: 'number' },
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
                placeholder="What they said about you…"
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

      <div className="grid sm:grid-cols-2 gap-4">
        {items.map(r => (
          <div key={r.id} className="card space-y-3">
            {/* Header: photo + name */}
            <div className="flex gap-3 items-start">
              {r.has_photo
                ? <img src={adminApi.refereePhoto(r.id)} alt={r.name}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                : <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">
                    👤
                  </div>
              }
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm">{r.name}</p>
                <p className="text-indigo-400 text-xs">{r.title}</p>
                <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                  style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
                  {r.relationship}
                </span>
              </div>
            </div>

            {/* Org row */}
            <div className="flex items-center gap-2">
              {r.has_org_logo
                ? <img src={adminApi.refereeOrgLogo(r.id)} alt={r.organization}
                    className="w-6 h-6 object-contain rounded" />
                : <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center text-xs">🏢</div>
              }
              <p className="text-gray-400 text-xs">{r.organization}</p>
            </div>

            {/* Status badges */}
            <div className="flex gap-2 flex-wrap">
              {r.available_on_request && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">
                  Contact hidden
                </span>
              )}
              {!r.visible && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                  Hidden
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => openEdit(r)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
              <button onClick={() => handleDelete(r.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </div>
        ))}
        {!items.length && (
          <p className="text-gray-500 text-sm text-center py-12 col-span-2">No referees yet.</p>
        )}
      </div>
    </div>
  );
}
