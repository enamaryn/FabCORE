import type { SessionState } from '../../src/http/routes/session.ts';
import type { MachineData } from './types.js';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.code = code; this.status = status; }
}
export function createApi(fetcher: typeof fetch = fetch, signedOut: () => void = () => {}) {
  async function request(path: string, data?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(path === 'machines' ? 18000 : 5000);
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
    login(username: string, password: string) { return request('login', { username, password }); },
    logout() { return request('logout', {}); },
  };
}
