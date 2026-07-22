'use client';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Project {
  id: string; title: string; published: boolean; featured: boolean;
  tech_stack: string[]; created_at: string;
  start_date?: string; end_date?: string; ongoing?: boolean;
}

interface ProjectImage {
  id: string; caption: string | null; order_index: number;
  image_mime: string; created_at: string;
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
    tm = now.getMonth() + 1;
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
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export default function ProjectsPage() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Project | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [techTags, setTechTags]   = useState<string[]>([]);
  const [tagInput, setTagInput]   = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [demoImages, setDemoImages]             = useState<ProjectImage[]>([]);
  const [demoImagesLoading, setDemoImagesLoading] = useState(false);
  const [newDemoFiles, setNewDemoFiles]         = useState<File[]>([]);
  const [newDemoCaptions, setNewDemoCaptions]   = useState<string[]>([]);
  const [uploadingDemo, setUploadingDemo]       = useState(false);
  const demoFileInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    title: '', description: '', live_url: '', repo_url: '',
    featured: false, published: false, order_index: '0',
    start_date: '', end_date: '', ongoing: false,
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try { setProjects(await adminApi.getProjects()); }
    catch { setError('Failed to load projects'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function loadDemoImages(projectId: string) {
    setDemoImagesLoading(true);
    try { setDemoImages(await adminApi.getProjectImages(projectId) || []); }
    catch { setDemoImages([]); }
    finally { setDemoImagesLoading(false); }
  }

  function openNew() {
    setEditing(null); setForm(emptyForm); setTechTags([]); setTagInput('');
    setImageFile(null); setDemoImages([]); setNewDemoFiles([]); setNewDemoCaptions([]);
    setShowForm(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setForm({
      title:       (p as any).title        || '',
      description: (p as any).description  || '',
      live_url:    (p as any).live_url     || '',
      repo_url:    (p as any).repo_url     || '',
      featured:    p.featured,
      published:   p.published,
      order_index: String((p as any).order_index ?? 0),
      start_date:  p.start_date ? p.start_date.slice(0, 10) : '',
      end_date:    p.end_date   ? p.end_date.slice(0, 10)   : '',
      ongoing:     p.ongoing ?? false,
    });
    setTechTags(Array.isArray(p.tech_stack) ? p.tech_stack : []);
    setTagInput(''); setImageFile(null); setNewDemoFiles([]); setNewDemoCaptions([]);
    loadDemoImages(p.id);
    setShowForm(true);
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

  function handleDemoFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const allowed = picked.slice(0, 20 - demoImages.length);
    setNewDemoFiles(prev => [...prev, ...allowed]);
    setNewDemoCaptions(prev => [...prev, ...allowed.map(() => '')]);
    if (demoFileInputRef.current) demoFileInputRef.current.value = '';
  }
  function removeNewDemoFile(idx: number) {
    setNewDemoFiles(prev => prev.filter((_, i) => i !== idx));
    setNewDemoCaptions(prev => prev.filter((_, i) => i !== idx));
  }
  function updateNewDemoCaption(idx: number, caption: string) {
    setNewDemoCaptions(prev => prev.map((c, i) => i === idx ? caption : c));
  }

  async function uploadDemoImages(projectId: string) {
    if (!newDemoFiles.length) return;
    setUploadingDemo(true);
    try {
      const fd = new FormData();
      newDemoFiles.forEach(f => fd.append('images', f));
      fd.append('captions', JSON.stringify(newDemoCaptions));
      await adminApi.uploadProjectImages(projectId, fd);
      setNewDemoFiles([]); setNewDemoCaptions([]);
      await loadDemoImages(projectId);
    } catch (e: any) { alert('Demo image upload failed: ' + e.message); }
    finally { setUploadingDemo(false); }
  }

  async function saveImageCaption(projectId: string, imgId: string, caption: string) {
    try {
      await adminApi.updateProjectImage(projectId, imgId, { caption });
      setDemoImages(prev => prev.map(img => img.id === imgId ? { ...img, caption } : img));
    } catch (e: any) { alert('Failed to save caption: ' + e.message); }
  }

  async function saveImageOrder(projectId: string, imgId: string, order_index: number) {
    try {
      await adminApi.updateProjectImage(projectId, imgId, { order_index });
      setDemoImages(prev =>
        [...prev.map(img => img.id === imgId ? { ...img, order_index } : img)]
          .sort((a, b) => a.order_index - b.order_index)
      );
    } catch (e: any) { alert('Failed to update order: ' + e.message); }
  }

  async function deleteDemoImage(projectId: string, imgId: string) {
    if (!confirm('Delete this demo image?')) return;
    try {
      await adminApi.deleteProjectImage(projectId, imgId);
      setDemoImages(prev => prev.filter(img => img.id !== imgId));
    } catch (e: any) { alert('Failed to delete image: ' + e.message); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title',       form.title);
      fd.append('description', form.description);
      fd.append('tech_stack',  JSON.stringify(techTags));
      fd.append('live_url',    form.live_url);
      fd.append('repo_url',    form.repo_url);
      fd.append('featured',    String(form.featured));
      fd.append('published',   String(form.published));
      fd.append('order_index', form.order_index);
      fd.append('ongoing',     String(form.ongoing));
      if (form.start_date) fd.append('start_date', form.start_date);
      if (!form.ongoing && form.end_date) fd.append('end_date', form.end_date);
      if (imageFile) fd.append('image', imageFile);

      let savedId = editing?.id;
      if (editing) {
        await adminApi.updateProject(editing.id, fd);
      } else {
        const created = await adminApi.createProject(fd);
        savedId = created.id;
      }
      if (savedId && newDemoFiles.length) await uploadDemoImages(savedId);
      setShowForm(false); load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project?')) return;
    try { await adminApi.deleteProject(id); load(); }
    catch (e: any) { alert(e.message); }
  }

  const durationPreview = form.start_date
    ? calcDuration(form.start_date, form.end_date || null, form.ongoing) : '';
  const totalDemoSlots = demoImages.length + newDemoFiles.length;

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

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit project' : 'New project'}
            </h2>

            {[
              { key: 'title',       label: 'Title',       type: 'text'   },
              { key: 'live_url',    label: 'Live URL',    type: 'url'    },
              { key: 'repo_url',    label: 'Repo URL',    type: 'url'    },
              { key: 'order_index', label: 'Order index', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}

            <div>
              <label className="label">Tech stack</label>
              <p className="text-gray-600 text-xs mb-2">
                Press <kbd className="bg-gray-800 px-1 rounded text-gray-400">Enter</kbd> or{' '}
                <kbd className="bg-gray-800 px-1 rounded text-gray-400">,</kbd> to add. Click to remove.
              </p>
              <div className="input flex flex-wrap gap-2 cursor-text min-h-[44px] py-2"
                onClick={() => tagInputRef.current?.focus()}>
                {techTags.map(tag => (
                  <span key={tag} onClick={e => { e.stopPropagation(); removeTag(tag); }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium
                               bg-indigo-600/20 border border-indigo-500/40 text-indigo-300
                               cursor-pointer hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition-colors">
                    {tag}<span className="opacity-60">×</span>
                  </span>
                ))}
                <input ref={tagInputRef} type="text" value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown} onBlur={addTag}
                  placeholder={techTags.length === 0 ? 'e.g. Next.js, Docker…' : ''}
                  className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-white placeholder-gray-600" />
              </div>
              <p className="text-gray-600 text-xs mt-1">{techTags.length} tag{techTags.length !== 1 ? 's' : ''}</p>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-32 resize-none" value={form.description}
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
                  Still in progress
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
              <label className="label">Cover image (thumbnail)</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setImageFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="border border-gray-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Demo images (slideshow)
                  </p>
                  <p className="text-gray-600 text-xs mt-0.5">
                    Max 20 images, 5 MB each.
                    {totalDemoSlots > 0 && <span className="ml-1 text-gray-500">{totalDemoSlots}/20 used</span>}
                  </p>
                </div>
                {totalDemoSlots < 20 && (
                  <button type="button" onClick={() => demoFileInputRef.current?.click()}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30
                               text-indigo-300 hover:bg-indigo-600/30 transition-colors">
                    + Add images
                  </button>
                )}
              </div>

              <input ref={demoFileInputRef} type="file" accept="image/*" multiple
                className="hidden" onChange={handleDemoFilePick} />

              {demoImagesLoading ? (
                <p className="text-gray-600 text-xs">Loading images…</p>
              ) : demoImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-gray-500 text-xs font-medium">Saved ({demoImages.length})</p>
                  {demoImages.map((img, idx) => (
                    <div key={img.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <img src={adminApi.projectSlideImg(editing!.id, img.id)}
                        alt={img.caption || `Slide ${idx + 1}`}
                        className="w-16 h-10 object-cover rounded flex-shrink-0" />
                      <input type="text" defaultValue={img.caption || ''} placeholder="Caption (optional)"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1
                                   text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-indigo-500/50"
                        onBlur={e => {
                          const val = e.target.value.trim();
                          if (val !== (img.caption || '')) saveImageCaption(editing!.id, img.id, val);
                        }} />
                      <input type="number" defaultValue={img.order_index} min={0} title="Slide order"
                        className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1
                                   text-xs text-gray-300 outline-none focus:border-indigo-500/50 text-center"
                        onBlur={e => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val !== img.order_index) saveImageOrder(editing!.id, img.id, val);
                        }} />
                      <button type="button" onClick={() => deleteDemoImage(editing!.id, img.id)}
                        className="text-red-500 hover:text-red-400 transition-colors text-sm flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {newDemoFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-gray-500 text-xs font-medium">
                    Pending upload ({newDemoFiles.length}) — saved when you click Save
                  </p>
                  {newDemoFiles.map((file, idx) => (
                    <div key={idx}
                      className="flex items-center gap-3 p-2 rounded-lg bg-indigo-900/20 border border-indigo-700/30">
                      <img src={URL.createObjectURL(file)} alt={file.name}
                        className="w-16 h-10 object-cover rounded flex-shrink-0" />
                      <input type="text" value={newDemoCaptions[idx]} placeholder="Caption (optional)"
                        onChange={e => updateNewDemoCaption(idx, e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1
                                   text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-indigo-500/50" />
                      <span className="text-xs text-gray-600 flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeNewDemoFile(idx)}
                        className="text-red-500 hover:text-red-400 transition-colors text-sm flex-shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {!demoImagesLoading && demoImages.length === 0 && newDemoFiles.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-2">
                  No demo images yet. Click &quot;+ Add images&quot; to upload screenshots.
                </p>
              )}
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
              <button onClick={handleSave} disabled={saving || uploadingDemo} className="btn-primary flex-1">
                {saving || uploadingDemo ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Table — overflow-x-auto for mobile horizontal scroll */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="border-b border-gray-800">
              <tr>
                {['Title', 'Timeline', 'Tech stack', 'Status', 'Actions'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {projects.map(p => {
                const dur = p.start_date
                  ? calcDuration(p.start_date, p.end_date ?? null, p.ongoing ?? false) : null;
                return (
                  <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="table-cell font-medium text-white">{p.title}</td>
                    <td className="table-cell text-xs text-gray-400">
                      {p.start_date ? (
                        <span>
                          {fmtDate(p.start_date)} → {p.ongoing
                            ? <span className="text-green-400">Present</span>
                            : fmtDate(p.end_date)}
                          {dur && <span className="ml-1 text-gray-500">· {dur}</span>}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.tech_stack.slice(0, 3).map(t => (
                          <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{t}</span>
                        ))}
                        {p.tech_stack.length > 3 && (
                          <span className="text-xs text-gray-500">+{p.tech_stack.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        p.published ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'
                      }`}>
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
                );
              })}
            </tbody>
          </table>
        </div>
        {!projects.length && (
          <p className="text-center text-gray-500 text-sm py-12">No projects yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}
