// Version installée et mise à jour disponible. Lecture directe de `.git` (le service à utilisateur dédié ne peut
// pas lancer git dans un dépôt appartenant à root) ; dernière version de `main` lue sur le dépôt d'origine en
// HTTPS (protocole Git « smart HTTP », sans clé ni quota d'API), mise en cache pour ne pas solliciter GitHub à
// chaque page. Aucune action : l'interface signale, la mise à jour reste une commande d'administration.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type VersionStatus = { current: string | null; latest: string | null; updateAvailable: boolean; checkedAt: string | null };
const sha = /^[0-9a-f]{40}$/;

async function readText(path: string) { try { return (await readFile(path, 'utf8')).trim(); } catch { return null; } }

/** Commit installé : HEAD détachée (mise à jour) ou branche, références libres puis regroupées. */
export async function installedCommit(root: string): Promise<string | null> {
  const git = join(root, '.git');
  const head = await readText(join(git, 'HEAD'));
  if (!head) return null;
  if (sha.test(head)) return head;
  const ref = /^ref: (refs\/[A-Za-z0-9._/-]+)$/.exec(head)?.[1];
  if (!ref || ref.includes('..')) return null;
  const loose = await readText(join(git, ref));
  if (loose && sha.test(loose)) return loose;
  const packed = await readText(join(git, 'packed-refs'));
  return packed?.split('\n').map(line => line.split(' ')).find(([value, name]) => name === ref && sha.test(value ?? ''))?.[0] ?? null;
}

/** Dépôt d'origine, seulement s'il s'agit d'un dépôt GitHub en HTTPS. */
export async function originUrl(root: string): Promise<string | null> {
  const config = await readText(join(root, '.git', 'config'));
  const url = config?.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)?.[1];
  return url && /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?(\.git)?$/.test(url) ? url.replace(/\.git$/, '') : null;
}

/** Dernier commit de `main` annoncé par le serveur Git (réponse bornée à 1 Mio). */
export async function latestMain(url: string, fetcher: typeof fetch, signal: AbortSignal): Promise<string | null> {
  const response = await fetcher(url + '.git/info/refs?service=git-upload-pack', { redirect: 'follow', signal, headers: { 'User-Agent': 'git/2 fabcore' } });
  if (!response.ok) { await response.body?.cancel(); return null; }
  const text = (await response.text()).slice(0, 1024 * 1024);
  return /([0-9a-f]{40}) refs\/heads\/main(?:\0|\n|$)/.exec(text)?.[1] ?? null;
}

export function createVersionService({ root, fetcher = fetch, ttlMs = 10 * 60_000, failureTtlMs = 5 * 60_000, now = () => Date.now() }: {
  root: string; fetcher?: typeof fetch; ttlMs?: number; failureTtlMs?: number; now?: () => number;
}) {
  let cached: { status: VersionStatus; until: number } | null = null;
  let pending: Promise<VersionStatus> | null = null;
  async function check(): Promise<VersionStatus> {
    const current = await installedCommit(root);
    const url = await originUrl(root);
    let latest: string | null = null;
    try { if (url) latest = await latestMain(url, fetcher, AbortSignal.timeout(8000)); } catch { latest = null; }
    const status = { current, latest, updateAvailable: Boolean(current && latest && current !== latest), checkedAt: latest ? new Date(now()).toISOString() : null };
    cached = { status, until: now() + (latest ? ttlMs : failureTtlMs) };
    return status;
  }
  return {
    /** État mis en cache ; une seule vérification réseau à la fois. */
    async status(): Promise<VersionStatus> {
      if (cached && cached.until > now()) {
        // Version installée relue à chaque appel : une mise à jour faite entre-temps est prise en compte aussitôt.
        const current = await installedCommit(root);
        if (current === cached.status.current) return cached.status;
      }
      pending ??= check().finally(() => { pending = null; });
      return pending;
    },
  };
}
