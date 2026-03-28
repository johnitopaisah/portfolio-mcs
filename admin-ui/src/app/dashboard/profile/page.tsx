'use client';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';

export default function ProfilePage() {
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [heroTags, setHeroTags]   = useState<string[]>([]);
  const [tagInput, setTagInput]   = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '', headline: '', bio: '', email: '',
    github_url: '', linkedin_url: '',
  });

  useEffect(() => {
    adminApi.getProfile().then((p: any) => {
      setForm({
        name:         p.name         || '',
        headline:     p.headline     || '',
        bio:          p.bio          || '',
        email:        p.email        || '',
        github_url:   p.github_url   || '',
        linkedin_url: p.linkedin_url || '',
      });
      setHasAvatar(p.has_avatar);
      setHeroTags(Array.isArray(p.hero_tags) ? p.hero_tags : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Add a tag — called on Enter or comma
  function addTag() {
    const val = tagInput.trim().replace(/,$/, '');
    if (!val || heroTags.includes(val)) {
      setTagInput('');
      return;
    }
    setHeroTags(prev => [...prev, val]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setHeroTags(prev => prev.filter(t => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    // Backspace on empty input removes last tag
    if (e.key === 'Backspace' && tagInput === '' && heroTags.length > 0) {
      setHeroTags(prev => prev.slice(0, -1));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      // Send hero_tags as a JSON string so the API can parse it as TEXT[]
      fd.append('hero_tags', JSON.stringify(heroTags));
      if (avatarFile) fd.append('avatar', avatarFile);
      if (resumeFile) fd.append('resume', resumeFile);
      await adminApi.updateProfile(fd);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
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

        {/* Text fields */}
        {[
          { key: 'name',         label: 'Full name',    type: 'text'  },
          { key: 'headline',     label: 'Headline',     type: 'text'  },
          { key: 'email',        label: 'Email',        type: 'email' },
          { key: 'github_url',   label: 'GitHub URL',   type: 'url'   },
          { key: 'linkedin_url', label: 'LinkedIn URL', type: 'url'   },
        ].map(f => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input className="input" type={f.type} value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}

        {/* Bio */}
        <div>
          <label className="label">Bio</label>
          <textarea className="input min-h-28 resize-none" value={form.bio}
            onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} />
        </div>

        {/* Hero tags */}
        <div>
          <label className="label">Tech stack pills (shown in hero section)</label>
          <p className="text-gray-600 text-xs mb-2">
            Type a tag and press <kbd className="bg-gray-800 px-1 rounded text-gray-400">Enter</kbd> or <kbd className="bg-gray-800 px-1 rounded text-gray-400">,</kbd> to add.
            Click a tag to remove it.
          </p>

          {/* Tag pills + input */}
          <div
            className="input flex flex-wrap gap-2 cursor-text min-h-[44px] py-2"
            onClick={() => tagInputRef.current?.focus()}
          >
            {heroTags.map(tag => (
              <span
                key={tag}
                onClick={e => { e.stopPropagation(); removeTag(tag); }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 cursor-pointer hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition-colors"
                title="Click to remove"
              >
                {tag}
                <span className="opacity-60">×</span>
              </span>
            ))}

            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              placeholder={heroTags.length === 0 ? 'e.g. Kubernetes, AWS, Docker…' : ''}
              className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-white placeholder-gray-600"
            />
          </div>

          <p className="text-gray-600 text-xs mt-1">
            {heroTags.length} tag{heroTags.length !== 1 ? 's' : ''} — displayed in order on the portfolio homepage.
            Backspace removes the last tag.
          </p>
        </div>

        {/* Resume */}
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
