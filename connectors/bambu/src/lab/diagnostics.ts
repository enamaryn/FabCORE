import { createHmac, randomBytes } from 'node:crypto';
import type { LabFailure } from './crypto.ts';

export interface LabEvent {
  event: 'identity-created' | 'identity-imported' | 'identity-revoked' | 'identity-deleted' | 'certificate-check' | 'authorization' | 'simulation';
  ok: boolean;
  reason?: LabFailure;
  elapsedMs?: number;
}
const names = new Set<LabEvent['event']>(['identity-created', 'identity-imported', 'identity-revoked', 'identity-deleted', 'certificate-check', 'authorization', 'simulation']);
const reasons = new Set<LabFailure>(['invalid-input', 'weak-key', 'storage', 'openssl', 'expired', 'revoked', 'untrusted', 'key-mismatch', 'not-approved', 'bad-signature', 'replay', 'interface-unqualified']);
/** Fixed allowlist, no payloads, exception strings, filenames, serials, keys or network identifiers. */
export class BambuDiagnostics {
  #salt = randomBytes(32);
  #events: (LabEvent & { at: string; identity?: string })[] = [];
  record(input: LabEvent, identity?: string) {
    if (!names.has(input.event)) return;
    const entry = { at: new Date().toISOString(), event: input.event, ok: input.ok === true,
      ...(input.reason && reasons.has(input.reason) ? { reason: input.reason } : {}),
      ...(Number.isFinite(input.elapsedMs) ? { elapsedMs: Math.min(60000, Math.max(0, Math.round(input.elapsedMs!))) } : {}),
      ...(identity ? { identity: createHmac('sha256', this.#salt).update(identity).digest('hex').slice(0, 16) } : {}),
    };
    this.#events.push(entry); if (this.#events.length > 256) this.#events.shift();
  }
  report() { return { schema: 'fabcore-lab-diagnostic/1', scope: 'synthetic-only', printerAuthorization: 'unqualified', events: this.#events.map(e => ({ ...e })) }; }
}
