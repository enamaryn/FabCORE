export type Theme = 'dark' | 'light' | 'system';
export function readPreference(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
export function savePreference(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Preference storage can be disabled. */ } }
export function applyTheme(theme: Theme) {
  const media = matchMedia('(prefers-color-scheme: light)');
  const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'light' : 'dark' : theme; };
  update(); media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
