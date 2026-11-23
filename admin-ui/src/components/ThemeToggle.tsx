'use client';
// Sun/moon button: switches the admin dashboard between the purple and the
// light theme. The choice is saved to your account; on load the saved value
// wins over this browser's copy, so every device shows the same theme.
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { applyTheme, currentTheme, onThemeChange, type AdminTheme } from '@/lib/theme';
import { showError } from '@/lib/dialog';

let synced = false;   // fetch the account's theme once per page load

export default function ThemeToggle({ className = '', showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [theme, setTheme] = useState<AdminTheme>('dark');

  useEffect(() => {
    setTheme(currentTheme());
    const off = onThemeChange(setTheme);
    if (!synced) {
      synced = true;
      adminApi.getUserSettings()
        .then((s: { admin_theme?: AdminTheme } | null) => {
          if ((s?.admin_theme === 'light' || s?.admin_theme === 'dark') && s.admin_theme !== currentTheme()) applyTheme(s.admin_theme, { save: false });
        })
        .catch(() => { /* keep the local theme */ });
    }
    return off;
  }, []);

  const next: AdminTheme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Switch to light theme' : 'Switch to purple theme';

  async function toggle() {
    const prev = theme;
    try { await applyTheme(next); }
    catch (err) { applyTheme(prev, { save: false }); showError(err, "Couldn't save your theme."); }
  }

  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className={`flex items-center rounded-xl transition-colors ${showLabel ? 'gap-3 px-3 py-2 text-sm w-full' : 'gap-2 w-9 h-9 justify-center'} ${className}`}
      style={showLabel ? { color: 'var(--text-3)' } : { color: 'var(--text-2)', border: '1px solid var(--border-2)' }}>
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {showLabel && <span>{theme === 'dark' ? 'Light theme' : 'Purple theme'}</span>}
    </button>
  );
}
