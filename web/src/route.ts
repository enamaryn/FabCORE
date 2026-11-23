import { safeFilePath } from './files.ts';

/** Visualiseur : fichier de la machine (`path`, suivi éventuel du fichier en cours) ou fichier local du navigateur. */
export type ViewerSource = { kind: 'machine'; path: string; follow: boolean } | { kind: 'local' };
export type Route = { kind: 'home' | 'machines' | 'history' | 'notifications' } | { kind: 'machine'; id: string; tab?: 'files' } | { kind: 'viewer'; id: string; source: ViewerSource };
/** Le lien d’accès au contenu (#content) ne change pas d’écran. Chemins validés, jamais utilisés comme HTML. */
export function parseRoute(hash: string): Route | null {
  if (['', '#home', '#machines', '#history'].includes(hash)) return { kind: hash === '#machines' ? 'machines' : hash === '#history' ? 'history' : 'home' };
  if (hash === '#notifications') return { kind: 'notifications' };
  const match = /^#machine\/([a-f0-9-]{36})(?:\/(files))?$/.exec(hash);
  if (match) return { kind: 'machine', id: match[1]!, ...(match[2] ? { tab: 'files' as const } : {}) };
  const viewer = /^#machine\/([a-f0-9-]{36})\/(?:view\/([^/]{1,1024})(\/follow)?|(view-local))$/.exec(hash);
  if (!viewer) return null;
  if (viewer[4]) return { kind: 'viewer', id: viewer[1]!, source: { kind: 'local' } };
  let path: string;
  try { path = decodeURIComponent(viewer[2]!); } catch { return null; }
  return safeFilePath(path) ? { kind: 'viewer', id: viewer[1]!, source: { kind: 'machine', path, follow: Boolean(viewer[3]) } } : null;
}
