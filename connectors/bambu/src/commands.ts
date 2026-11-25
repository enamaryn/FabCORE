import type { P2SChannel } from './types.ts';

/** Application identity supplied by the encrypted vault, never returned by HTTP. */
export interface BambuCommandSigner {
  revision: string;
  sign(params: Record<string, unknown>, command: string, sequenceId: string, printerCert?: string): string;
  install(sequenceId: string): string;
}
interface Reply { [key: string]: unknown }
interface Pending {
  serial: string; channel: string; command: string;
  resolve(reply: Reply): void; reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Options {
  publish(serial: string, wire: string, done: (error?: Error) => void): void;
  fresh(serial: string): boolean;
  createSigner?: (() => BambuCommandSigner | null) | undefined;
  log(event: string, details: Record<string, unknown>): void;
  timeoutMs?: number;
}
let sequence = Date.now();
const nextSequence = () => String(sequence = Math.max(sequence + 1, Date.now()));
const success = (reply: Reply) => ['success', 'ok'].includes(String(reply.result).toLowerCase()) && !Number(reply.err_code ?? 0);
const certificate = (reply: Reply) => {
  for (const field of ['printer_cert', 'cert', 'dev_cert']) {
    const value = reply[field];
    if (typeof value === 'string' && value.length < 48 * 1024 && value.includes('BEGIN CERTIFICATE')) return value.replaceAll('\\n', '\n');
  }
  return undefined;
};

/** Signed cloud writes only; subscription/status reads never install a certificate. */
export function createCloudCommands({ publish, fresh, createSigner, log, timeoutMs = 6000 }: Options) {
  const pending = new Map<string, Pending>();
  const installed = new Map<string, { revision: string; printerCert: string | undefined }>();
  const installing = new Map<string, { revision: string; task: Promise<void> }>();
  let generation = 0;
  const check = (serial: string) => { if (!fresh(serial)) throw new Error('bambu-connection'); };
  const signer = () => {
    try { const identity = createSigner?.(); if (identity) return identity; } catch { /* Do not propagate private-key parsing errors. */ }
    throw new Error('bambu-authorization');
  };
  function request(serial: string, channel: string, command: string, id: string, wire: string) {
    check(serial);
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); log('mqtt-command-unconfirmed', { serial, channel, command, sequence_id: id }); reject(new Error('command-unconfirmed')); }, timeoutMs);
      pending.set(id, { serial, channel, command, resolve, reject, timer });
      log('mqtt-command-send', { serial, channel, command, sequence_id: id });
      const failed = (error?: Error) => {
        if (error && pending.delete(id)) { clearTimeout(timer); reject(new Error('command-unconfirmed')); }
      };
      try { publish(serial, wire, failed); } catch { failed(new Error('publish')); }
    });
  }
  async function install(serial: string, identity: BambuCommandSigner) {
    if (installed.get(serial)?.revision === identity.revision) return;
    const active = installing.get(serial);
    if (active) { if (active.revision !== identity.revision) throw new Error('bambu-authorization'); return active.task; }
    const epoch = generation;
    const task = (async () => {
      const id = nextSequence();
      const reply = await request(serial, 'security', 'app_cert_install', id, identity.install(id));
      if (!success(reply)) throw new Error('bambu-authorization');
      if (epoch !== generation) throw new Error('bambu-connection');
      installed.set(serial, { revision: identity.revision, printerCert: certificate(reply) });
    })();
    installing.set(serial, { revision: identity.revision, task });
    try { await task; } finally { if (installing.get(serial)?.task === task) installing.delete(serial); }
  }
  return {
    /** ACKs must match device, channel, command AND sequence; foreign/delayed replies cannot authorize writes. */
    receive(serial: string, envelope: Record<string, unknown>) {
      for (const channel of ['security', 'print', 'system']) {
        const reply = envelope[channel];
        if (!reply || typeof reply !== 'object' || Array.isArray(reply)) continue;
        const body = reply as Reply;
        const id = String(body.sequence_id);
        const item = pending.get(id);
        if (!item || item.serial !== serial || item.channel !== channel || body.command !== item.command) continue;
        pending.delete(id); clearTimeout(item.timer);
        log('mqtt-command-response', { serial, channel, command: item.command, sequence_id: id, result: body.result, err_code: body.err_code });
        item.resolve(body);
        return true;
      }
      return false;
    },
    async send(serial: string, command: string, params: Record<string, unknown> = {}, channel: P2SChannel = 'print') {
      check(serial);
      const epoch = generation;
      let identity: BambuCommandSigner | undefined;
      let printerCert: string | undefined;
      if (channel === 'print') {
        identity = signer();
        await install(serial, identity);
        if (signer().revision !== identity.revision) throw new Error('bambu-authorization');
        printerCert = installed.get(serial)?.printerCert;
        if (['gcode_line', 'gcode_file', 'project_file'].includes(command) && !printerCert) {
          const id = nextSequence();
          const reply = await request(serial, 'security', 'app_cert_list', id, JSON.stringify({ security: { sequence_id: id, command: 'app_cert_list', timestamp: Date.now(), type: 'app' } }));
          printerCert = certificate(reply);
          if (!printerCert) throw new Error('bambu-authorization');
          const state = installed.get(serial); if (state) state.printerCert = printerCert;
        }
      }
      check(serial);
      if (epoch !== generation) throw new Error('bambu-connection');
      if (identity && signer().revision !== identity.revision) throw new Error('bambu-authorization');
      const id = nextSequence();
      let wire: string;
      try { wire = identity ? identity.sign(params, command, id, printerCert) : JSON.stringify({ [channel]: { ...params, command, sequence_id: id } }); }
      catch { throw new Error('bambu-authorization'); }
      const reply = await request(serial, channel, command, id, wire);
      if (success(reply)) return true;
      if (Number(reply.err_code) >= 84033543 && Number(reply.err_code) <= 84033546 || /verify failed|signature verification failed/i.test(String(reply.reason))) {
        installed.delete(serial);
        throw new Error('bambu-authorization');
      }
      if (['fail', 'failed'].includes(String(reply.result).toLowerCase())) return false;
      throw new Error('command-unconfirmed');
    },
    reset() {
      generation++;
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('command-unconfirmed')); }
      pending.clear(); installed.clear(); installing.clear();
    },
  };
}
