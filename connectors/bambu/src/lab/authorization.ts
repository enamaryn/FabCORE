import { randomUUID } from 'node:crypto';
import { certificate, certificateId, LabError, nodeCryptoProvider } from './crypto.ts';
import type { LabFailure } from './crypto.ts';
import type { BambuCertificateManager, LabIdentity } from './certificates.ts';

export interface LabMessage {
  version: 1;
  audience: 'fabcore-simulator';
  action: 'read-synthetic-temperature';
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}
export interface LabEnvelope { message: LabMessage; certificate: string; chain: string[]; signature: string }
// An explicit synthetic format, never published to device/<serial>/request or to Bambu Cloud.
export function messageBytes(m: LabMessage) {
  return Buffer.from(JSON.stringify([m.version, m.audience, m.action, m.nonce, m.issuedAt, m.expiresAt]));
}
export function syntheticMessage(now = Date.now()): LabMessage {
  return { version: 1, audience: 'fabcore-simulator', action: 'read-synthetic-temperature', nonce: randomUUID(), issuedAt: now, expiresAt: now + 30000 };
}
export async function signSynthetic(manager: BambuCertificateManager, identity: LabIdentity, message = syntheticMessage()): Promise<LabEnvelope> {
  return { message, certificate: identity.certificate, chain: identity.chain, signature: (await manager.sign(identity.id, messageBytes(message))).toString('base64') };
}
function parse(payload: Uint8Array): LabEnvelope {
  try {
    if (payload.length > 128 * 1024) throw new Error();
    const e = JSON.parse(Buffer.from(payload).toString()) as LabEnvelope;
    if (Object.keys(e).sort().join() !== 'certificate,chain,message,signature' || !e.message || typeof e.certificate !== 'string' || !Array.isArray(e.chain) || e.chain.length > 8 || !e.chain.every(c => typeof c === 'string') || typeof e.signature !== 'string' || !/^[A-Za-z0-9+/]{342,684}={0,2}$/.test(e.signature)) throw new Error();
    const m = e.message;
    if (Object.keys(m).sort().join() !== 'action,audience,expiresAt,issuedAt,nonce,version' || m.version !== 1 || m.audience !== 'fabcore-simulator' || m.action !== 'read-synthetic-temperature' || typeof m.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(m.nonce) || !Number.isSafeInteger(m.issuedAt) || !Number.isSafeInteger(m.expiresAt) || m.expiresAt - m.issuedAt > 30000 || m.expiresAt <= m.issuedAt) throw new Error();
    return e;
  } catch { throw new LabError('invalid-input'); }
}
export type LabResult = { ok: true; temperature: 21; synthetic: true } | { ok: false; reason: LabFailure };
/** Local policy, independent of MQTT. It cannot authorize a real printer in this increment. */
export class BambuAuthorizationManager {
  #approved = new Map<string, { certificate: string; chain: string[] }>();
  #nonces = new Map<string, number>();
  #manager: BambuCertificateManager;
  #roots: string[];
  #now: () => number;
  constructor(manager: BambuCertificateManager, roots: string[], now = Date.now) {
    if (!roots.length || roots.length > 8) throw new LabError('untrusted');
    this.#manager = manager; this.#roots = [...roots]; this.#now = now;
  }
  async capabilities(input: { mqttAuthenticated: boolean; target: 'simulator' | 'bambu' }) {
    if (input.target === 'simulator') for (const [id, identity] of this.#approved) {
      try { await this.#manager.validate(identity.certificate, this.#roots, identity.chain); }
      catch { this.#approved.delete(id); }
    }
    return { mqttAuthenticated: input.mqttAuthenticated, applicationAuthorized: input.target === 'simulator' && this.#approved.size > 0,
      physicalCommands: false, registration: input.target === 'bambu' ? 'interface-unqualified' : 'local-allowlist' };
  }
  async approve(pem: string, chain: string[] = []) {
    const { fingerprint } = await this.#manager.validate(pem, this.#roots, chain);
    if (this.#approved.size >= 128 && !this.#approved.has(fingerprint)) throw new LabError('invalid-input');
    this.#approved.set(fingerprint, { certificate: pem, chain: [...chain] });
  }
  removeApproval(pem: string) { this.#approved.delete(certificateId(pem)); }
  classifyResponse(response: { result?: unknown; reason?: unknown }) {
    return (response.result === 'failed' || response.result === 'fail') && typeof response.reason === 'string' && /mqtt message verify failed|signature verification failed/i.test(response.reason) ? 'application-authorization-denied' : 'unknown';
  }
  async handle(payload: Uint8Array): Promise<LabResult> {
    const started = performance.now();
    try {
      const envelope = parse(payload), m = envelope.message, now = this.#now();
      const revocationVersion = this.#manager.revocationVersion;
      if (m.issuedAt > now + 1000 || m.expiresAt <= now) throw new LabError('expired');
      const result = await this.#manager.validate(envelope.certificate, this.#roots, envelope.chain);
      if (!this.#approved.has(result.fingerprint)) throw new LabError('not-approved');
      if (!nodeCryptoProvider.verify(messageBytes(m), Buffer.from(envelope.signature, 'base64'), certificate(envelope.certificate).publicKey)) throw new LabError('bad-signature');
      // Recheck after asynchronous validation, before consuming the one-time nonce.
      const revoked = await this.#manager.revoked(result.fingerprint);
      if (revoked || this.#manager.revocationVersion !== revocationVersion) throw new LabError('revoked');
      if (!this.#approved.has(result.fingerprint)) throw new LabError('not-approved');
      if (m.expiresAt <= this.#now()) throw new LabError('expired');
      for (const [nonce, expiry] of this.#nonces) if (expiry <= this.#now()) this.#nonces.delete(nonce);
      const nonce = result.fingerprint + ':' + m.nonce;
      if (this.#nonces.has(nonce)) throw new LabError('replay');
      if (this.#nonces.size >= 1024) throw new LabError('invalid-input');
      this.#nonces.set(nonce, m.expiresAt);
      this.#manager.diagnostics.record({ event: 'authorization', ok: true, elapsedMs: performance.now() - started }, result.fingerprint);
      return { ok: true, temperature: 21, synthetic: true };
    } catch (error) {
      const reason = error instanceof LabError ? error.code : 'invalid-input';
      this.#manager.diagnostics.record({ event: 'authorization', ok: false, reason, elapsedMs: performance.now() - started });
      return { ok: false, reason };
    }
  }
}
