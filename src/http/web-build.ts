import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { InlineConfig } from 'vite';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const primary = join(root, 'web/dist');
let pending: { promise: Promise<string>; failedAt?: number } | undefined;
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return lists.flat();
}
async function current(dist: string, fingerprint: string) {
  try { return await readFile(join(dist, '.source-sha256'), 'utf8') === fingerprint && Boolean(await readFile(join(dist, 'index.html'))); } catch { return false; }
}
const unwritable = (error: unknown) => ['EACCES', 'EPERM', 'EROFS'].includes((error as { code?: string }).code ?? '');
/**
 * Compilation à jour dans `web/dist` (préparée par l'installation ou la mise à jour), sinon compilée sur place.
 * Si le dossier du code n'est pas modifiable par le service (utilisateur dédié), compilation dans `fallback`
 * (dossier de données). Renvoie le dossier servi.
 */
async function buildCurrent(fallback?: string): Promise<string> {
  const source = [...await files(join(root, 'web/src')), ...await files(join(root, 'web/locales')), ...await files(join(root, 'src/domain')),
    ...['web/index.html', 'web/vite.config.ts', 'web/tsconfig.json', 'package-lock.json', 'design/prototype.html'].map(path => join(root, path))];
  const hash = createHash('sha256');
  for (const path of source) { hash.update(path.slice(root.length)); hash.update(await readFile(path)); }
  const fingerprint = hash.digest('hex');
  for (const dist of [primary, ...(fallback ? [fallback] : [])]) if (await current(dist, fingerprint)) return dist;
  const { build } = await import('vite');
  // Configuration importée directement : sans fichier temporaire de Vite dans node_modules (non modifiable par un
  // service à utilisateur dédié). En secours, cache et sortie dans le dossier de données.
  const { default: config } = await import(pathToFileURL(join(root, 'web/vite.config.ts')).href) as { default: InlineConfig };
  const compile = async (dist: string) => {
    await build({ ...config, configFile: false, logLevel: 'error', ...(dist === primary ? {} : { cacheDir: join(dist, '..', 'vite-cache'), build: { ...config.build, outDir: dist, emptyOutDir: true } }) });
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, '.source-sha256'), fingerprint);
    return dist;
  };
  try { return await compile(primary); }
  catch (error) {
    if (!fallback || !unwritable(error)) throw error;
    return await compile(fallback);
  }
}
/** Une compilation par processus au plus ; après un échec, nouvel essai possible au bout d'une minute. */
export function ensureWebBuild({ fallback, now = Date.now() }: { fallback?: string; now?: number } = {}): Promise<string> {
  if (pending?.failedAt !== undefined && now - pending.failedAt > 60_000) pending = undefined;
  if (!pending) {
    const entry: { promise: Promise<string>; failedAt?: number } = { promise: buildCurrent(fallback) };
    entry.promise.catch(() => { entry.failedAt = Date.now(); });
    pending = entry;
  }
  return pending.promise;
}

export async function readWebAssets(options: { fallback?: string } = {}): Promise<Map<string, { type: string; body: Buffer }>> {
  const dist = await ensureWebBuild(options);
  const out = new Map<string, { type: string; body: Buffer }>();
  for (const path of await files(dist)) {
    const relative = path.slice(dist.length + 1).replaceAll('\\', '/');
    if (relative === 'index.html') {
      const asset = { type: 'text/html; charset=utf-8', body: await readFile(path) };
      out.set('/app', asset); out.set('/app/', asset);
    } else if (/^assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(relative)) out.set('/app/' + relative, {
      type: relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', body: await readFile(path),
    });
  }
  return out;
}
