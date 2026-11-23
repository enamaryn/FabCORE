import type { SessionState } from '../../src/http/routes/session.ts';
import type { ControlState } from '../../src/domain/control.ts';
import { safeFilePath } from './files.ts';
import type { FileInventory } from './files.ts';
import type { MachineData } from './types.js';

/** Réglages publics des notifications : jamais de secret. */
export type NotificationView = {
  ntfy: { mode: 'off' | 'internal' | 'external'; url?: string; topic?: string; auth?: 'none' | 'basic' | 'bearer'; username?: string };
  smtp: { enabled: boolean; host?: string; port?: number; tls?: 'tls' | 'starttls'; from?: string; to?: string; auth?: boolean; username?: string };
  internal: { url: string; topic: string } | null;
};
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}
export function createApi(fetcher: typeof fetch = fetch, signedOut: () => void = () => {}, makeXhr: () => XMLHttpRequest = () => new XMLHttpRequest()) {
  async function request(path: string, data?: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number): Promise<unknown> {
    const timeout = AbortSignal.timeout(timeoutMs ?? (path.endsWith('/controls') ? 30000 : path.startsWith('machines') ? 18000 : 5000));
    const response = await fetcher('/api/' + path, { credentials: 'same-origin', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
    });
    if (response.status === 401) signedOut();
    const payload: unknown = await response.json();
    if (!response.ok) throw new ApiError(typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'internal', response.status);
    return payload;
  }
  return {
    async session(signal?: AbortSignal): Promise<SessionState> {
      const value = await request('session', undefined, signal);
      if (!value || typeof value !== 'object' || !('installed' in value) || typeof value.installed !== 'boolean' || !('authenticated' in value) || typeof value.authenticated !== 'boolean') throw new ApiError('response', 502);
      const data = value as SessionState;
      if (data.authenticated && (typeof data.username !== 'string' || !['admin', 'observer'].includes(data.role ?? ''))) throw new ApiError('response', 502);
      return data;
    },
    async fleet(signal?: AbortSignal): Promise<MachineData[]> {
      const value = await request('machines', undefined, signal);
      if (!value || typeof value !== 'object' || !('machines' in value) || !Array.isArray(value.machines)) throw new ApiError('response', 502);
      const statuses = ['connecting', 'ready', 'printing', 'paused', 'done', 'offline', 'error'];
      if (value.machines.some((m: unknown) => !m || typeof m !== 'object' || !('id' in m) || typeof m.id !== 'string' || !('name' in m) || typeof m.name !== 'string' || !('kind' in m) || typeof m.kind !== 'string' || !('status' in m) || !statuses.includes(String(m.status)))) throw new ApiError('response', 502);
      return value.machines as MachineData[];
    },
    async files(id: string, signal?: AbortSignal): Promise<FileInventory> {
      const value = await request('machines/' + encodeURIComponent(id) + '/files', undefined, signal, 30000);
      if (!value || typeof value !== 'object' || !('files' in value) || !Array.isArray(value.files) || value.files.length > 300) throw new ApiError('files-unavailable', 502);
      const files = value.files.map((file: unknown) => {
        if (!file || typeof file !== 'object' || !('path' in file) || !safeFilePath(file.path)) throw new ApiError('files-unavailable', 502);
        const numeric = (key: string) => key in file && typeof file[key as keyof typeof file] === 'number' && Number.isFinite(file[key as keyof typeof file]) && Number(file[key as keyof typeof file]) >= 0 ? Number(file[key as keyof typeof file]) : null;
        return { path: file.path, size: numeric('size'), modified: numeric('modified') };
      });
      return { files, truncated: 'truncated' in value && value.truncated === true };
    },
    async transfer(id: string, path: string, destination: string, name: string, signal?: AbortSignal): Promise<{ path: string; destination: string }> {
      const value = await request('machines/' + encodeURIComponent(id) + '/transfer', { path, destination, name, confirm: true }, signal, 900000);
      if (!value || typeof value !== 'object' || !('path' in value) || !safeFilePath(value.path) || !('destination' in value) || value.destination !== destination) throw new ApiError('upload-unknown', 504);
      return { path: value.path, destination };
    },
    async print(id: string, path: string, options: { operatorPresent?: boolean; filamentMode?: 'external' }, signal?: AbortSignal): Promise<{ status: 'printing' }> {
      const value = await request('machines/' + encodeURIComponent(id) + '/print', { path, confirm: true, ...options }, signal, 30000);
      if (!value || typeof value !== 'object' || !('status' in value) || value.status !== 'printing') throw new ApiError('command-unconfirmed', 504);
      return { status: 'printing' };
    },
    upload(id: string, file: Blob & { name: string }, progress: (percent: number) => void, signal?: AbortSignal): Promise<{ path: string }> {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new ApiError('upload-unknown', 0)); return; }
        const xhr = makeXhr(); let finished = false;
        const abort = () => xhr.abort();
        const finish = (error?: ApiError, path?: string) => {
          if (finished) return; finished = true; signal?.removeEventListener('abort', abort);
          xhr.upload.onprogress = null; xhr.onload = null; xhr.onerror = null; xhr.onabort = null; xhr.ontimeout = null;
          if (error) reject(error); else resolve({ path: path! });
        };
        xhr.open('POST', '/api/machines/' + encodeURIComponent(id) + '/files?name=' + encodeURIComponent(file.name));
        xhr.timeout = 900000; xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = event => { if (!finished && event.lengthComputable && event.total > 0) progress(Math.max(0, Math.min(100, Math.floor(event.loaded / event.total * 100)))); };
        xhr.onload = () => {
          if (xhr.status === 401) signedOut();
          let payload: { path?: unknown; error?: unknown } = {};
          try { payload = JSON.parse(xhr.responseText) ?? {}; } catch { /* A malformed success cannot prove that the upload failed. */ }
          if (xhr.status === 201 && safeFilePath(payload.path)) finish(undefined, payload.path);
          else finish(new ApiError(typeof payload.error === 'string' ? payload.error : xhr.status === 413 ? 'upload-proxy-limit' : 'upload-unknown', xhr.status));
        };
        xhr.onerror = xhr.onabort = xhr.ontimeout = () => finish(new ApiError('upload-unknown', xhr.status));
        signal?.addEventListener('abort', abort, { once: true });
        try { xhr.send(file); } catch { finish(new ApiError('upload-unknown', 0)); }
      });
    },
    async controls(id: string, signal?: AbortSignal): Promise<ControlState> {
      const value = await request('machines/' + encodeURIComponent(id) + '/controls', undefined, signal);
      if (!value || typeof value !== 'object' || !('heaters' in value) || !Array.isArray(value.heaters) || !('lights' in value) || !Array.isArray(value.lights) || !('fans' in value) || !Array.isArray(value.fans)) throw new ApiError('response', 502);
      return value as ControlState;
    },
    async control(id: string, command: Record<string, unknown>, signal?: AbortSignal): Promise<{ outcome: string }> {
      const value = await request('machines/' + encodeURIComponent(id) + '/controls', command, signal);
      if (!value || typeof value !== 'object' || !('outcome' in value) || !['accepted', 'executed', 'confirmed'].includes(String(value.outcome))) throw new ApiError('command-unconfirmed', 504);
      return value as { outcome: string };
    },
    async command(id: string, action: string, confirm: boolean, signal?: AbortSignal): Promise<{ status: string }> {
      const value = await request('machines/' + encodeURIComponent(id) + '/command', { action, confirm }, signal);
      if (!value || typeof value !== 'object' || !('status' in value) || !['ready', 'done', 'printing', 'paused', 'error'].includes(String(value.status))) throw new ApiError('command-unconfirmed', 504);
      return value as { status: string };
    },
    spool(id: string, spool: Record<string, unknown> | null, signal?: AbortSignal) { return request('machines/' + encodeURIComponent(id) + '/spool', { spool }, signal); },
    async preview(id: string, view: string, signal?: AbortSignal): Promise<Blob> {
      const response = await fetcher('/api/machines/' + encodeURIComponent(id) + '/camera/preview' + (view ? '/' + view : ''), {
        credentials: 'same-origin', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      });
      if (response.status === 401) signedOut();
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/jpeg')) throw new ApiError('camera-unavailable', response.status);
      return response.blob();
    },
    async notifications(signal?: AbortSignal): Promise<NotificationView> {
      const value = await request('notifications', undefined, signal);
      if (!value || typeof value !== 'object' || !('ntfy' in value) || !('smtp' in value) || !('internal' in value)) throw new ApiError('response', 502);
      return value as NotificationView;
    },
    /** Un seul canal à la fois : `{ ntfy }` ou `{ smtp }` ; l'autre garde sa configuration (#121). */
    async saveNotifications(channel: Partial<Record<'ntfy' | 'smtp', Record<string, unknown>>>, signal?: AbortSignal): Promise<NotificationView> {
      const value = await request('notifications', channel, signal, 15000);
      if (!value || typeof value !== 'object' || !('ntfy' in value) || !('smtp' in value)) throw new ApiError('response', 502);
      return value as NotificationView;
    },
    testNotification(channel: 'ntfy' | 'smtp', signal?: AbortSignal) { return request('notifications/test', { channel }, signal, 20000); },
    login(username: string, password: string) { return request('login', { username, password }); },
    logout() { return request('logout', {}); },
  };
}
