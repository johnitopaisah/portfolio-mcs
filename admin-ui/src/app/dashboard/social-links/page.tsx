'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  order_index: number;
  visible: boolean;
}

const PLATFORMS = [
  { value: 'email',    label: 'Email',       color: '#a78bfa' },
  { value: 'github',   label: 'GitHub',      color: '#67e8f9' },
  { value: 'linkedin', label: 'LinkedIn',    color: '#93c5fd' },
  { value: 'medium',   label: 'Medium',      color: '#86efac' },
  { value: 'twitter',  label: 'Twitter / X', color: '#7dd3fc' },
  { value: 'youtube',  label: 'YouTube',     color: '#fca5a5' },
  { value: 'website',  label: 'Website',     color: '#fcd34d' },
  { value: 'other',    label: 'Other',       color: '#d4d4d8' },
];

const PLATFORM_ICON: Record<string, string> = {
  email:    '✉',
  github:   '',
  linkedin: 'in',
  medium:   'M',
  twitter:  'X',
  youtube:  '▶',
  website:  '⊕',
  other:    '⊞',
};

function platformColor(platform: string) {
  return PLATFORMS.find(p => p.value === platform)?.color ?? '#d4d4d8';
}

const EMPTY_FORM = { platform: 'github', label: '', url: '' };

export default function SocialLinksPage() {
  const [links, setLinks]       = useState<SocialLink[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [adding, setAdding]     = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ platform: '', label: '', url: '' });

  function load() {
    setLoading(true);
    adminApi.getSocialLinks()
      .then((data: SocialLink[]) => setLinks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const next = await adminApi.createSocialLink({
        ...form,
        order_index: links.length,
      });
      setLinks(prev => [...prev, next]);
      setForm(EMPTY_FORM);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function toggleVisible(link: SocialLink) {
    const updated = await adminApi.updateSocialLink(link.id, { visible: !link.visible })
      .catch(() => null);
    if (updated) setLinks(prev => prev.map(l => l.id === link.id ? updated : l));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this link?')) return;
    await adminApi.deleteSocialLink(id).catch(() => {});
    setLinks(prev => prev.filter(l => l.id !== id));
  }

  async function moveLink(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= links.length) return;
    const reordered = [...links];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const updated = reordered.map((l, i) => ({ ...l, order_index: i }));
    setLinks(updated);
    await Promise.all(updated.map(l =>
      adminApi.updateSocialLink(l.id, { order_index: l.order_index })
    )).catch(() => {});
  }

  function startEdit(link: SocialLink) {
    setEditId(link.id);
    setEditForm({ platform: link.platform, label: link.label, url: link.url });
  }

  async function saveEdit(id: string) {
    const updated = await adminApi.updateSocialLink(id, editForm).catch(() => null);
    if (updated) {
      setLinks(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l));
      setEditId(null);
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Social Links</h1>
      <p className="text-gray-500 text-sm mb-8">
        Manage the contact links shown on your portfolio. Changes are live immediately.
      </p>

      {/* Link list */}
      <div className="space-y-3 mb-10 max-w-2xl">
        {links.length === 0 && (
          <p className="text-gray-500 text-sm">No links yet — add one below.</p>
        )}
        {links.map((link, i) => {
          const color = platformColor(link.platform);
          const isEditing = editId === link.id;
          return (
            <div
              key={link.id}
              className="card p-4"
              style={{ opacity: link.visible ? 1 : 0.5 }}
            >
              {isEditing ? (
                <div className="flex flex-col gap-3">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">Platform</label>
                      <select
                        className="input text-sm"
                        value={editForm.platform}
                        onChange={e => setEditForm(p => ({ ...p, platform: e.target.value }))}
                      >
                        {PLATFORMS.map(pl => (
                          <option key={pl.value} value={pl.value}>{pl.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Display label</label>
                      <input className="input text-sm" value={editForm.label}
                        onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">URL</label>
                      <input className="input text-sm" value={editForm.url}
                        onChange={e => setEditForm(p => ({ ...p, url: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(link.id)} className="btn-primary text-xs py-1.5 px-4">
                      Save
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {/* Platform icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{
                      background: `${color}18`,
                      border: `1px solid ${color}44`,
                      color,
                    }}
                  >
                    {PLATFORM_ICON[link.platform] ?? '⊞'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {link.label}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                      {link.url}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Up / Down */}
                    <button onClick={() => moveLink(i, -1)} disabled={i === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors disabled:opacity-30"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}
                      title="Move up">↑</button>
                    <button onClick={() => moveLink(i, 1)} disabled={i === links.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors disabled:opacity-30"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}
                      title="Move down">↓</button>

                    {/* Visibility toggle */}
                    <button
                      onClick={() => toggleVisible(link)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={link.visible
                        ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                        : { background: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }
                      }
                    >
                      {link.visible ? 'Visible' : 'Hidden'}
                    </button>

                    {/* Edit */}
                    <button onClick={() => startEdit(link)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      Edit
                    </button>

                    {/* Delete */}
                    <button onClick={() => handleDelete(link.id)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add link form */}
      <div className="card max-w-2xl p-5">
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-1)' }}>
          Add new link
        </h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Platform</label>
              <select
                className="input"
                value={form.platform}
                onChange={e => setForm(p => ({ ...p, platform: e.target.value }))}
              >
                {PLATFORMS.map(pl => (
                  <option key={pl.value} value={pl.value}>{pl.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Display label</label>
              <input
                className="input"
                type="text"
                required
                placeholder="e.g. github.com/johnitopaisah"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">URL</label>
              <input
                className="input"
                type="text"
                required
                placeholder="https:// or mailto:"
                value={form.url}
                onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-gray-600 text-xs -mt-1">
            For email use <code className="bg-gray-800 px-1 rounded text-gray-400">mailto:you@example.com</code>.
            For all others use the full <code className="bg-gray-800 px-1 rounded text-gray-400">https://</code> URL.
          </p>
          <div>
            <button type="submit" disabled={adding} className="btn-primary">
              {adding ? 'Adding…' : '+ Add link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
