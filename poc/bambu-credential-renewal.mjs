import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const day = 86400000;
const iso = value => new Date(value).toISOString();
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

/** Internal application scheduler, independent of MQTT and of any physical command. */
export function createBambuCredentialRenewal({ vault, directory, now = Date.now, fetcher, notify = async () => false }) {
  const file = join(directory, 'bambu-application-credentials', 'renewal.json');
  let saved = {};
  try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { /* First start or unreadable history. */ }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  let running, timer, closed = false;
  const abort = new AbortController();
  function state(info) { return saved.sourceUpdatedAt === info.updatedAt ? saved : {}; }
  function due(info) {
    const expiration = [date(info.crlExpiresAt), date(info.certificateExpiresAt)].filter(value => value !== null);
    const periodic = (date(info.updatedAt) ?? now()) + (expiration.length ? 14 : 7) * day;
    return Math.min(periodic, ...expiration.map(value => value - 7 * day));
  }
  function status() {
    const info = vault.status(); if (!info.configured) return { state: 'unconfigured', nextAttemptAt: null, lastError: null };
    const current = state(info);
    return { state: running ? 'refreshing' : !info.refreshConfigured ? 'manual' : current.lastError ? 'failed' : 'scheduled',
      nextAttemptAt: info.refreshConfigured ? iso(Math.max(due(info), date(current.retryAt) ?? 0, (date(current.lastSuccessAt) ?? -Infinity) + day)) : null,
      lastAttemptAt: current.lastAttemptAt ?? null, lastSuccessAt: current.lastSuccessAt ?? null,
      lastError: current.lastError ?? null, failureCount: current.failureCount ?? 0 };
  }
  function save(next) {
    mkdirSync(join(directory, 'bambu-application-credentials'), { recursive: true, mode: 0o700 });
    writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); renameSync(file + '.tmp', file); saved = next;
  }
  async function alert(info, kind) {
    const current = state(info);
    if (date(current.lastAlertAt) !== null && now() - date(current.lastAlertAt) < day) return;
    const delivered = await notify(kind).catch(() => false);
    if (delivered && !closed && vault.status().updatedAt === info.updatedAt) save({ ...state(info), sourceUpdatedAt: info.updatedAt, lastAlertAt: iso(now()) });
  }
  async function attempt(force) {
    if (closed) return status();
    const info = vault.status(); if (!info.configured) return status();
    if (!info.refreshConfigured) {
      if (force) { const error = new Error('bambu-cert-no-refresh-url'); error.status = 400; throw error; }
      const expiration = [date(info.crlExpiresAt), date(info.certificateExpiresAt)].filter(value => value !== null);
      if (expiration.some(value => value <= now() + 7 * day)) await alert(info, 'expiry');
      return status();
    }
    if (!force && now() < Math.max(due(info), date(state(info).retryAt) ?? 0, (date(state(info).lastSuccessAt) ?? -Infinity) + day)) return status();
    const previous = state(info);
    const lastAttemptAt = iso(now());
    save({ ...previous, sourceUpdatedAt: info.updatedAt, lastAttemptAt });
    try {
      const refreshed = await vault.refresh(fetcher, abort.signal);
      if (!closed) save({ sourceUpdatedAt: refreshed.updatedAt, lastAttemptAt, lastSuccessAt: iso(now()), lastError: null, failureCount: 0 });
    } catch {
      if (!closed && vault.status().updatedAt === info.updatedAt) {
        const failureCount = Math.min(10, (previous.failureCount ?? 0) + 1);
        save({ ...previous, sourceUpdatedAt: info.updatedAt, lastAttemptAt, lastError: 'bambu-cert-refresh-failed', failureCount,
          retryAt: iso(now() + Math.min(day, 3600000 * 2 ** (failureCount - 1))) });
        await alert(info, 'failed');
      }
    }
    return status();
  }
  const run = ({ force = false } = {}) => {
    if (running) return running;
    running = attempt(force).then(() => { running = undefined; return status(); }, error => { running = undefined; throw error; });
    return running;
  };
  return { status, run,
    start() { if (timer || closed) return; timer = setInterval(() => { void run().catch(() => {}); }, 60000); timer.unref(); },
    close() { closed = true; clearInterval(timer); abort.abort(); },
  };
}
