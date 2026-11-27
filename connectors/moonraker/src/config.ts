import { createHash, randomUUID } from 'node:crypto';
import type { HttpFilePorts } from '../../../packages/connector-sdk/src/index.ts';
import type { MoonrakerConnection, MoonrakerFetch, MoonrakerRequest } from './types.ts';
export const configLimit = 1024 * 1024;
/** Fichiers .cfg de Klipper, plus moonraker.conf à la racine du dossier config (adresses autorisées, CORS…). */
export const moonrakerConfigFile = 'moonraker.conf';
export function configPath(value: unknown): string | null {
  if (value === moonrakerConfigFile) return value;
  if (typeof value !== 'string' || value.length > 255 || !value.endsWith('.cfg') || !/^[a-zA-Z0-9_ ./-]+$/.test(value)) return null;
  if (value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || part.length > 120 || part.trim() !== part)) return null;
  return value;
}
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
export function createMoonrakerConfig({ encodePath, validOrigin, multipart, readResponse }: Pick<HttpFilePorts, 'encodePath' | 'validOrigin' | 'multipart' | 'readResponse'>, fetcher: MoonrakerFetch = fetch) {
  const call = (machine: MoonrakerConnection, path: string, options: MoonrakerRequest = {}) => {
    if (validOrigin(machine.origin) !== machine.origin) throw new Error('config-unavailable');
    return fetcher(machine.origin + path, { ...options, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(8000), headers: { ...(machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}), ...options.headers } });
  };
  async function json(machine: MoonrakerConnection, path: string) {
    const response = await call(machine, path, { method: 'GET' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('config-unavailable'); }
    return await readResponse(response) as { result?: Record<string, unknown> };
  }
  async function idle(machine: MoonrakerConnection) {
    const info = await json(machine, '/printer/info');
    const state = info.result?.state;
    if (state === 'error' || state === 'shutdown') return;
    if (state !== 'ready') throw new Error('config-state');
    const result = await json(machine, '/printer/objects/query?print_stats&virtual_sdcard');
    const status = result.result?.status as { print_stats?: { state?: string }; virtual_sdcard?: { is_active?: boolean } } | undefined;
    if (!['standby', 'complete', 'cancelled', 'error'].includes(status?.print_stats?.state ?? '') || status?.virtual_sdcard?.is_active === true) throw new Error('config-state');
  }
  async function read(machine: MoonrakerConnection, path: string) {
    if (!configPath(path)) throw new Error('config-invalid');
    const response = await call(machine, '/server/files/config/' + encodePath(path), { method: 'GET' });
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 404 ? 'config-missing' : 'config-unavailable'); }
    if (!response.body) throw new Error('config-unavailable');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > configLimit) { await reader.cancel(); throw new Error('config-size'); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    let content: string; try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw new Error('config-encoding'); }
    if (content.includes(String.fromCharCode(0))) throw new Error('config-encoding');
    return { path, content, revision: digest(bytes) };
  }
  async function upload(machine: MoonrakerConnection, path: string, bytes: Uint8Array) {
    const split = path.lastIndexOf('/'), name = path.slice(split + 1), directory = split < 0 ? '' : path.slice(0, split);
    async function* source() { yield bytes; }
    const form = multipart('file', name, source(), bytes.byteLength, { root: 'config', ...(directory ? { path: directory } : {}), checksum: digest(bytes) });
    const response = await call(machine, '/server/files/upload', { method: 'POST', body: form.body, duplex: 'half', headers: form.headers });
    if (!response.ok) { await response.body?.cancel(); throw new Error('config-upload'); }
    const body = await readResponse(response) as { result?: { item?: { path?: string; root?: string } }; item?: { path?: string; root?: string } };
    const item = (body.result ?? body).item;
    if (item?.path !== path || item.root !== 'config') throw new Error('config-upload');
  }
  return {
    read,
    async list(machine: MoonrakerConnection) {
      const response = await call(machine, '/server/files/list?root=config', { method: 'GET' });
      if (!response.ok) { await response.body?.cancel(); throw new Error('config-unavailable'); }
      const body = await readResponse(response) as { result?: unknown };
      if (!Array.isArray(body.result)) throw new Error('config-unavailable');
      return body.result.filter((entry: { path?: unknown }) => configPath(entry?.path)).slice(0, 300).map((entry: { path: string; permissions?: string }) => ({ path: entry.path, writable: entry.permissions === 'rw' })).sort((a, b) => a.path.localeCompare(b.path));
    },
    async save(machine: MoonrakerConnection, path: string, content: string, expectedRevision: string | null, canWrite = () => true) {
      if (!configPath(path) || typeof content !== 'string' || content.includes(String.fromCharCode(0)) || Buffer.byteLength(content) > configLimit || (expectedRevision !== null && !/^[a-f0-9]{64}$/.test(expectedRevision))) throw new Error('config-invalid');
      await idle(machine); let previous = null;
      try { previous = await read(machine, path); } catch (failure) { if (expectedRevision !== null || (failure as Error).message !== 'config-missing') throw failure; }
      if ((previous?.revision ?? null) !== expectedRevision) throw new Error('config-conflict');
      if (!canWrite()) throw new Error('command-busy');
      const backupPath = previous ? '.fabcore-backups/' + randomUUID() + '-' + path.split('/').at(-1) + '.bak' : null;
      if (previous && backupPath) { try { await upload(machine, backupPath, Buffer.from(previous.content)); } catch { throw new Error('config-backup'); } }
      // Recheck after backup: external editors may have changed the source while it was copied.
      let beforeWrite = null;
      try { beforeWrite = await read(machine, path); } catch (failure) { if (expectedRevision !== null || (failure as Error).message !== 'config-missing') throw failure; }
      if ((beforeWrite?.revision ?? null) !== expectedRevision) throw new Error('config-conflict');
      await idle(machine); if (!canWrite()) throw new Error('command-busy');
      try {
        await upload(machine, path, Buffer.from(content));
        const saved = await read(machine, path);
        if (saved.revision !== digest(Buffer.from(content))) throw new Error('config-save-unknown');
        return { ...saved, backupPath };
      } catch { throw new Error('config-save-unknown'); }
    },
    /** Redémarre le service Moonraker (relecture de moonraker.conf). Refusé pendant une impression ; un seul envoi.
     * La connexion peut se couper pendant le redémarrage : la réponse est alors « inconnue », jamais renvoyée. */
    async restartMoonraker(machine: MoonrakerConnection, canWrite = () => true) {
      await idle(machine); if (!canWrite()) throw new Error('command-busy');
      try {
        const response = await call(machine, '/server/restart', { method: 'POST' });
        if (!response.ok) { await response.body?.cancel(); return { outcome: response.status >= 500 ? 'unknown' : 'rejected' }; }
        const body = await readResponse(response) as { result?: unknown };
        return { outcome: body.result === 'ok' ? 'accepted' : 'unknown' };
      } catch { return { outcome: 'unknown' }; }
    },
    /** FIRMWARE_RESTART natif après un arrêt d'urgence (M112) ou une erreur Klipper : seul moyen de remettre les
     * microcontrôleurs en service. Refusé si Klipper est prêt ou démarre ; un seul envoi, jamais rejoué. */
    async firmwareRestart(machine: MoonrakerConnection, canWrite = () => true) {
      const state = (await json(machine, '/printer/info')).result?.state;
      if (state !== 'shutdown' && state !== 'error') throw new Error('config-state');
      if (!canWrite()) throw new Error('command-busy');
      try {
        const response = await call(machine, '/printer/firmware_restart', { method: 'POST' });
        if (!response.ok) { await response.body?.cancel(); return { outcome: response.status >= 500 ? 'unknown' : 'rejected' }; }
        const body = await readResponse(response) as { result?: unknown };
        return { outcome: body.result === 'ok' ? 'accepted' : 'unknown' };
      } catch { return { outcome: 'unknown' }; }
    },
    async restart(machine: MoonrakerConnection, canWrite = () => true) {
      await idle(machine); if (!canWrite()) throw new Error('command-busy');
      try {
        const response = await call(machine, '/printer/restart', { method: 'POST' });
        if (!response.ok) { await response.body?.cancel(); return { outcome: response.status >= 500 ? 'unknown' : 'rejected' }; }
        const body = await readResponse(response) as { result?: unknown };
        return { outcome: body.result === 'ok' ? 'accepted' : 'unknown' };
      } catch { return { outcome: 'unknown' }; }
    },
  };
}
