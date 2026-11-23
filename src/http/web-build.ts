import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'web/dist');
let pending: Promise<void> | undefined;
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return lists.flat();
}
async function buildCurrent() {
  const source = [...await files(join(root, 'web/src')), ...await files(join(root, 'web/locales')),
    ...['web/index.html', 'web/vite.config.ts', 'web/tsconfig.json', 'package-lock.json', 'design/prototype.html'].map(path => join(root, path))];
  const hash = createHash('sha256');
  for (const path of source) { hash.update(path.slice(root.length)); hash.update(await readFile(path)); }
  const fingerprint = hash.digest('hex');
  const marker = join(dist, '.source-sha256');
  try { if (await readFile(marker, 'utf8') === fingerprint) { await readFile(join(dist, 'index.html')); return; } } catch { /* First installation or updated sources. */ }
  const { build } = await import('vite');
  await build({ configFile: join(root, 'web/vite.config.ts'), logLevel: 'error' });
  await mkdir(dist, { recursive: true });
  await writeFile(marker, fingerprint);
}
/** One build per process at most, deduplicated; failed builds are not retried by incoming requests. */
export function ensureWebBuild(): Promise<void> { return pending ??= buildCurrent(); }

export async function readWebAssets(): Promise<Map<string, { type: string; body: Buffer }>> {
  await ensureWebBuild();
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
