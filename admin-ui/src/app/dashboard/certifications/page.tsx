'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Cert {
  id: string; name: string; issuer: string;
  issue_date: string; expiry_date?: string; credential_url?: string;
}

// Parse year/month directly from ISO string to avoid UTC timezone shift
function fmtDate(d?: string): string {
  if (!d) return '—';
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function CertificationsPage() {
  const [items, setItems]   = useState<Cert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Cert | null>(null);
  const [loading, setLoading]   = useState(true);
  const empty = {
    name: '', issuer: '', issue_date: '', expiry_date: '',
    credential_id: '', credential_url: '', order_index: '0',
  };
  const [form, setForm]     = useState(empty);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    try { setItems(await adminApi.getCertifications()); }
    catch { }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm(empty); setImgFile(null); setShowForm(true);
  }

  function openEdit(c: Cert) {
    setEditing(c);
    setForm({
      name:           c.name,
      issuer:         c.issuer,
      issue_date:     c.issue_date?.slice(0, 10)   || '',
      expiry_date:    c.expiry_date?.slice(0, 10)  || '',
      credential_id:  (c as any).credential_id     || '',
      credential_url: c.credential_url             || '',
      order_index:    String((c as any).order_index ?? 0),
    });
    setImgFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (imgFile) fd.append('image', imgFile);
      editing
        ? await adminApi.updateCertification(editing.id, fd)
        : await adminApi.createCertification(fd);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this certification?')) return;
    try { await adminApi.deleteCertification(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Certifications</h1>
          <p className="text-gray-500 text-sm mt-0.5">{items.length} total</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ New certification</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit certification' : 'New certification'}
            </h2>
            {[
              { key: 'name',           label: 'Certification name',       type: 'text'   },
              { key: 'issuer',         label: 'Issuer (e.g. AWS, CKA)',   type: 'text'   },
              { key: 'issue_date',     label: 'Issue date',               type: 'date'   },
              { key: 'expiry_date',    label: 'Expiry date (optional)',   type: 'date'   },
              { key: 'credential_id',  label: 'Credential ID (optional)', type: 'text'   },
              { key: 'credential_url', label: 'Verify URL (optional)',    type: 'url'    },
              { key: 'order_index',    label: 'Order index',              type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Certificate image / badge</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setImgFile(e.target.files?.[0] ?? null)} />
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
        {items.map(c => (
          <div key={c.id} className="card flex gap-4">
            {(c as any).has_image
              ? <img src={adminApi.certImg(c.id)} alt={c.name}
                  className="w-14 h-14 object-contain rounded-lg flex-shrink-0" />
              : <div className="w-14 h-14 bg-gray-800 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                  🏅
                </div>
            }
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium line-clamp-2">{c.name}</p>
              <p className="text-indigo-400 text-xs">{c.issuer}</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {fmtDate(c.issue_date)}
                {c.expiry_date ? ` → ${fmtDate(c.expiry_date)}` : ''}
              </p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => openEdit(c)}
                  className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                <button onClick={() => handleDelete(c.id)}
                  className="text-xs text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!items.length && (
          <p className="text-gray-500 text-sm text-center py-12 col-span-2">
            No certifications yet.
          </p>
        )}
      </div>
    </div>
  );
}
