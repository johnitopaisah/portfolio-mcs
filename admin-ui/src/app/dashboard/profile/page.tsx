'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', headline: '', bio: '', email: '', github_url: '', linkedin_url: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    adminApi.getProfile().then((p: any) => {
      setForm({ name: p.name || '', headline: p.headline || '', bio: p.bio || '', email: p.email || '', github_url: p.github_url || '', linkedin_url: p.linkedin_url || '' });
      setHasAvatar(p.has_avatar);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(false);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (avatarFile) fd.append('avatar', avatarFile);
      if (resumeFile) fd.append('resume', resumeFile);
      await adminApi.updateProfile(fd);
      setSuccess(true);
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Profile</h1>
      <p className="text-gray-500 text-sm mb-8">Your public portfolio info</p>

      <form onSubmit={handleSave} className="card max-w-xl space-y-5">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-3xl font-bold text-indigo-500">
            {hasAvatar
              ? <img src={`${adminApi.avatarUrl}?t=${Date.now()}`} alt="avatar" className="w-full h-full object-cover" />
              : form.name.charAt(0) || 'J'}
          </div>
          <div className="flex-1">
            <label className="label">Profile photo</label>
            <input type="file" accept="image/*" className="input py-1.5"
              onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        {[
          { key: 'name',        label: 'Full name',   type: 'text'  },
          { key: 'headline',    label: 'Headline',    type: 'text'  },
          { key: 'email',       label: 'Email',       type: 'email' },
          { key: 'github_url',  label: 'GitHub URL',  type: 'url'   },
          { key: 'linkedin_url',label: 'LinkedIn URL',type: 'url'   },
        ].map(f => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input className="input" type={f.type} value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}

        <div>
          <label className="label">Bio</label>
          <textarea className="input min-h-28 resize-none" value={form.bio}
            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} />
        </div>

        <div>
          <label className="label">Resume / CV (PDF)</label>
          <input type="file" accept=".pdf" className="input py-1.5"
            onChange={e => setResumeFile(e.target.files?.[0] ?? null)} />
          <p className="text-gray-600 text-xs mt-1">Leave empty to keep existing resume</p>
        </div>

        {success && <p className="text-green-400 text-sm">✓ Profile saved successfully</p>}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
