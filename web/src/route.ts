export type Route = { kind: 'home' | 'machines' | 'history' } | { kind: 'machine'; id: string; tab?: 'files' };
/** Le lien d’accès au contenu (#content) ne change pas d’écran. */
export function parseRoute(hash: string): Route | null {
  if (['', '#home', '#machines', '#history'].includes(hash)) return { kind: hash === '#machines' ? 'machines' : hash === '#history' ? 'history' : 'home' };
  const match = /^#machine\/([a-f0-9-]{36})(?:\/(files))?$/.exec(hash);
  return match ? { kind: 'machine', id: match[1]!, ...(match[2] ? { tab: 'files' as const } : {}) } : null;
}
