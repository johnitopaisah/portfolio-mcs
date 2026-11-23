'use client';
// Default theme of the public site (johnisah.com) for visitors who haven't
// picked one. A visitor's own choice (sun/moon button there) is kept.
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { showError } from '@/lib/dialog';

type Theme = 'dark' | 'light';
const OPTIONS: { value: Theme; label: string; hint: string; swatch: string }[] = [
  { value: 'dark',  label: 'Purple', hint: 'Rich purple gradient', swatch: 'linear-gradient(135deg, #1e1b4b, #7c3aed 60%, #c084fc)' },
  { value: 'light', label: 'Light',  hint: 'Soft lavender',        swatch: 'linear-gradient(135deg, #ffffff, #edeef8 60%, #ddd6fe)' },
];

export default function SiteThemeCard() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.getProfile()
      .then((p: { default_theme?: Theme }) => setTheme(p?.default_theme === 'light' ? 'light' : 'dark'))
      .catch(() => setTheme('dark'));
  }, []);

  async function choose(t: Theme) {
    if (t === theme || saving) return;
    const prev = theme;
    setTheme(t); setSaving(true); setSaved(false);
    try { await adminApi.setSiteDefaultTheme(t); setSaved(true); }
    catch (err) { setTheme(prev); showError(err, "Couldn't save the site theme."); }
    finally { setSaving(false); }
  }

  return (
    <section className="card max-w-xl mb-6" aria-labelledby="site-theme-title">
      <h2 id="site-theme-title" className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Public site theme</h2>
      <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-3)' }}>
        What visitors to johnisah.com see first. They can still switch with the sun/moon button, and their choice is remembered.
      </p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Default theme for visitors">
        {OPTIONS.map(o => {
          const active = theme === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={active} disabled={theme === null || saving}
              onClick={() => choose(o.value)}
              className="flex items-center gap-3 p-3 rounded-xl text-left transition-all disabled:opacity-60"
              style={{ border: `2px solid ${active ? '#A855F7' : 'var(--border-2)'}`, background: active ? 'rgba(168,85,247,0.1)' : 'transparent' }}>
              <span className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: o.swatch, border: '1px solid rgba(124,58,237,0.25)' }} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium" style={{ color: 'var(--text-1)' }}>{o.label}</span>
                <span className="block text-xs" style={{ color: 'var(--text-3)' }}>{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {saved && <p className="text-xs mt-3" role="status" style={{ color: 'var(--t-4ade80)' }}>Saved ✓ — visitors see it within a minute.</p>}
    </section>
  );
}
