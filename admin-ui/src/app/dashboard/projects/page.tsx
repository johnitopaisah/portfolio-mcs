'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Project {
  id: string; title: string; published: boolean; featured: boolean;
  tech_stack: string[]; created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const emptyForm = { title: '', description: '', tech_stack: '', live_url: '', repo_url: '', featured: false, published: false, order_index: '0' };
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setProjects(await adminApi.getProjects()); }
    catch { setError('Failed to load projects'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(emptyForm); setImageFile(null); setShowForm(true); }
  function openEdit(p: Project) {
    setEditing(p);
    setForm({ title: (p as any).title, description: (p as any).description || '', tech_stack: (p as any).tech_stack?.join(', ') || '', live_url: (p as any).live_url || '', repo_url: (p as any).repo_url || '', featured: p.featured, published: p.published, order_index: String((p as any).order_index ?? 0) });
    setImageFile(null);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('tech_stack', JSON.stringify(form.tech_stack.split(',').map(s => s.trim()).filter(Boolean)));
      fd.append('live_url', form.live_url);
      fd.append('repo_url', form.repo_url);
      fd.append('featured', String(form.featured));
      fd.append('published', String(form.published));
      fd.append('order_index', form.order_index);
      if (imageFile) fd.append('image', imageFile);
      editing ? await adminApi.updateProject(editing.id, fd) : await adminApi.createProject(fd);
      setShowForm(false);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project?')) return;
    try { await adminApi.deleteProject(id); load(); } catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{projects.length} total</p>
        </div>
        <button onClick={openNew} className="btn-primary">+ New project</button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">{editing ? 'Edit project' : 'New project'}</h2>
            {[
              { key: 'title',       label: 'Title',             type: 'text' },
              { key: 'live_url',    label: 'Live URL',          type: 'url'  },
              { key: 'repo_url',    label: 'Repo URL',          type: 'url'  },
              { key: 'order_index', label: 'Order index',       type: 'number' },
              { key: 'tech_stack',  label: 'Tech stack (comma-separated)', type: 'text' },
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
              <label className="label">Project image</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-6">
              {(['featured', 'published'] as const).map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600" />
                  <span className="text-sm text-gray-300 capitalize">{key}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-800">
            <tr>
              {['Title', 'Tech stack', 'Status', 'Actions'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {projects.map(p => (
              <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="table-cell font-medium text-white">{p.title}</td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {p.tech_stack.slice(0, 3).map(t => <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{t}</span>)}
                    {p.tech_stack.length > 3 && <span className="text-xs text-gray-500">+{p.tech_stack.length - 3}</span>}
                  </div>
                </td>
                <td className="table-cell">
                  <span className={`text-xs px-2 py-1 rounded-full ${p.published ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                    {p.published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!projects.length && <p className="text-center text-gray-500 text-sm py-12">No projects yet. Add one above.</p>}
      </div>
    </div>
  );
}
