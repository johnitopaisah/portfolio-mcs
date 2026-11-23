// Admin dashboard theme: 'dark' (purple, default) or 'light'.
// Applied before first paint from localStorage (see app/layout.tsx) and saved
// to the account (user_settings.admin_theme) so it follows you across devices.
import { adminApi } from './api';

export type AdminTheme = 'dark' | 'light';
export const THEME_KEY = 'admin-theme';
const EVENT = 'admin-theme-change';

export function currentTheme(): AdminTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Apply locally (instant) and optionally save to the account. */
export function applyTheme(theme: AdminTheme, { save = true } = {}): Promise<unknown> | void {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
  if (save) return adminApi.updateUserSettings({ admin_theme: theme });
}

export function onThemeChange(fn: (t: AdminTheme) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<AdminTheme>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// Inline <head> script: no flash of the wrong theme on load.
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
