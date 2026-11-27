import { safeFilePath } from './files.ts';

/** Visualiseur : fichier de la machine (`path`, suivi éventuel du fichier en cours) ou fichier local du navigateur. */
export type ViewerSource = { kind: 'machine'; path: string; follow: boolean } | { kind: 'local' };
export type Route = { kind: 'home' | 'machines' | 'history' | 'notifications' | 'diagnostics' | 'access' | 'projects' | 'production' } | { kind: 'machine'; id: string; tab?: 'files' | 'logs' | 'config' | 'tramming' } | { kind: 'viewer'; id: string; source: ViewerSource };
/** Le lien d’accès au contenu (#content) ne change pas d’écran. Chemins validés, jamais utilisés comme HTML. */
export function parseRoute(hash: string): Route | null {
  if (['', '#home', '#machines', '#history'].includes(hash)) return { kind: hash === '#machines' ? 'machines' : hash === '#history' ? 'history' : 'home' };
  if (['#notifications', '#diagnostics', '#access', '#projects', '#production'].includes(hash)) return { kind: hash.slice(1) as 'notifications' | 'diagnostics' | 'access' | 'projects' | 'production' };
  const match = /^#machine\/([a-f0-9-]{36})(?:\/(files|logs|config|tramming))?$/.exec(hash);
  if (match) return { kind: 'machine', id: match[1]!, ...(match[2] ? { tab: match[2] as 'files' | 'logs' | 'config' | 'tramming' } : {}) };
  const viewer = /^#machine\/([a-f0-9-]{36})\/(?:view\/([^/]{1,1024})(\/follow)?|(view-local))$/.exec(hash);
  if (!viewer) return null;
  if (viewer[4]) return { kind: 'viewer', id: viewer[1]!, source: { kind: 'local' } };
  let path: string;
  try { path = decodeURIComponent(viewer[2]!); } catch { return null; }
  return safeFilePath(path) ? { kind: 'viewer', id: viewer[1]!, source: { kind: 'machine', path, follow: Boolean(viewer[3]) } } : null;
}
