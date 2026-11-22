import { randomInt } from 'node:crypto';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import type { P2SChannel, P2SConnection, P2SControls, P2SMonitorOptions, P2SReport, P2SSnapshot, P2SStatus } from './types.ts';

const states = new Map<unknown, P2SStatus>([
  ['IDLE', 'ready'], ['INIT', 'connecting'], ['PREPARE', 'printing'],
  ['RUNNING', 'printing'], ['PAUSE', 'paused'], ['FINISH', 'done'], ['FAILED', 'error'],
]);
const request = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });
const empty = (status: P2SStatus, issue: string | null): P2SSnapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Conserve les températures imbriquées entre rapports incrémentaux du firmware. */
function mergeReport(previous: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(update)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    result[key] = isObject(value) ? mergeReport(isObject(previous[key]) ? previous[key] : {}, value) : value;
  }
  return result;
}

interface PendingCommand {
  command: string;
  channel: P2SChannel;
  resolve(value: boolean): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Printer {
  current: P2SSnapshot;
  lastReport: number;
  nextLog: number;
  client?: MqttClient;
  controls?: P2SControls;
  authorizationDenied?: boolean;
  close(): void;
  send(command: string, params: Record<string, unknown>, channel?: P2SChannel): Promise<boolean>;
}

/** Une seule implémentation P2S LAN : session MQTT persistante, corrélation par sequence_id, aucun rejeu. */
export function createP2SMonitor({ ca, reportedControls, bambuFilaments, connectPrinter = connect, diagnostics }: P2SMonitorOptions) {
  const printers = new Map<string, Printer>();
  // Après close(), plus aucune session n'est ouverte : un appel tardif ne doit pas recréer de connexion.
  let closed = false;

  function open(machine: P2SConnection, tracked = false): Printer {
    const reportTopic = `device/${machine.serial}/report`;
    const requestTopic = `device/${machine.serial}/request`;
    const trace = (event: string, details: Record<string, unknown> = {}) => { if (tracked) diagnostics?.trace?.(machine.id, event, details); };
    const endpoint = new URL(machine.origin);
    trace('mqtt-connect-start', { transport: 'mqtts', mode: 'lan', host: endpoint.hostname, port: endpoint.port });
    const pending = new Map<string, PendingCommand>();
    let report: P2SReport = {};
    let ams: Record<string, unknown> = {};
    let filaments: unknown = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const client = connectPrinter(machine.origin, {
      username: 'bblp',
      password: machine.accessCode,
      ca,
      rejectUnauthorized: true,
      checkServerIdentity: (_host: string, certificate: PeerCertificate) => checkServerIdentity(machine.serial, certificate),
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      connectTimeout: 5000,
      reconnectPeriod: 10000,
      keepalive: 20,
      queueQoSZero: false,
      resubscribe: false,
    } as IClientOptions);
    const printer: Printer = {
      current: empty('connecting', null), lastReport: 0, nextLog: 0, client,
      close() {
        clearTimeout(timeout);
        for (const pendingCommand of pending.values()) { clearTimeout(pendingCommand.timer); pendingCommand.reject(new Error('command-unconfirmed')); }
        pending.clear();
        client.end(true);
      },
      send: (command, params, channel = 'print') => new Promise<boolean>((resolve, reject) => {
        if (!client.connected || !printer.lastReport || Date.now() - printer.lastReport > 60000) { reject(new Error('bambu-connection')); return; }
        const id = String(randomInt(1, 0x7fffffff));
        const timer = setTimeout(() => { pending.delete(id); trace('mqtt-command-timeout', { command, channel, sequence_id: id, elapsedMs: 6000 }); reject(new Error('command-unconfirmed')); }, 6000);
        pending.set(id, { command, channel, resolve, reject, timer });
        // QoS 0 évite tout rejeu MQTT après reconnexion ; l'exécution est vérifiée par l'état.
        trace('mqtt-send', { topic: requestTopic, channel, qos: 0, retain: false, payload: { ...params, command, sequence_id: id } });
        client.publish(requestTopic, JSON.stringify({ [channel]: { ...params, command, sequence_id: id } }), { qos: 0, retain: false }, error => {
          if (error && pending.has(id)) { trace('mqtt-publish-failed', { command, channel, sequence_id: id }); pending.delete(id); clearTimeout(timer); reject(error); }
        });
      }),
    };

    function requestReport() {
      clearTimeout(timeout);
      trace('mqtt-send', { topic: requestTopic, payload: JSON.parse(request) });
      client.publish(requestTopic, request);
      timeout = setTimeout(() => {
        if (!printer.lastReport) { printer.current = empty('error', 'bambu-report'); trace('mqtt-report-timeout', { elapsedMs: 8000 }); }
      }, 8000);
      timeout.unref();
    }

    client.on('connect', () => {
      if (tracked) diagnostics?.record('mqtt', 'connected', machine.id);
      report = {};
      ams = {};
      filaments = null;
      printer.lastReport = 0;
      printer.current = empty('connecting', null);
      client.subscribe(reportTopic, (error, grants) => {
        const grant = grants?.[0];
        const refused = Boolean(error) || !grant || grant.qos >= 128;
        trace('mqtt-subscribe', { topic: reportTopic, qos: grant?.qos, outcome: refused ? 'rejected' : 'accepted' });
        if (refused) {
          printer.current = empty('error', 'bambu-access');
          return;
        }
        requestReport();
      });
    });
    client.on('message', (topic, payload) => {
      if (topic !== reportTopic || payload.length > 512 * 1024) return;
      let delta: Record<string, unknown> | undefined;
      let channel: P2SChannel;
      try {
        const envelope = JSON.parse(payload.toString()) as Record<string, unknown>;
        channel = envelope.print ? 'print' : envelope.system ? 'system' : 'info';
        const body = envelope[channel];
        delta = isObject(body) ? body : undefined;
      } catch { trace('mqtt-invalid-json', { bytes: payload.length }); return; }
      if (delta?.command !== 'push_status' || Date.now() >= printer.nextLog || (delta.gcode_state && delta.gcode_state !== report.gcode_state)) {
        trace('mqtt-receive', { topic, channel, bytes: payload.length, payload: delta });
        if (delta?.command === 'push_status') printer.nextLog = Date.now() + 10000;
      }
      const acknowledgement = pending.get(String(delta?.sequence_id));
      if (delta && acknowledgement && delta.command === acknowledgement.command && channel === acknowledgement.channel) {
        trace('mqtt-command-response', { channel, correlated: true, payload: delta });
        pending.delete(String(delta.sequence_id));
        clearTimeout(acknowledgement.timer);
        if (delta.result === 'success') {
          if (['pause', 'resume', 'stop', 'gcode_line', 'project_file'].includes(String(delta.command))) printer.authorizationDenied = false;
          acknowledgement.resolve(true);
        } else if (delta.result === 'fail' || delta.result === 'failed') {
          if (typeof delta.reason === 'string' && /mqtt message verify failed|signature verification failed/i.test(delta.reason)) {
            printer.authorizationDenied = true;
            acknowledgement.reject(new Error('bambu-authorization'));
          } else acknowledgement.resolve(false);
        } else acknowledgement.reject(new Error('command-unconfirmed'));
        return;
      }
      if (delta?.command !== 'push_status') return;
      report = { ...report, ...delta, ...(isObject(delta.device) ? { device: mergeReport(isObject(report.device) ? report.device : {}, delta.device) } : {}) };
      if (isObject(delta.ams)) {
        const previousUnits = Array.isArray(ams.ams) ? ams.ams as Record<string, unknown>[] : undefined;
        const units = Array.isArray(delta.ams.ams) ? (delta.ams.ams as Record<string, unknown>[]).map(unit => {
          const previous = previousUnits?.find(item => String(item?.id) === String(unit?.id));
          return { ...previous, ...unit };
        }) : previousUnits;
        ams = { ...ams, ...delta.ams, ...(units ? { ams: units } : {}) };
        filaments = bambuFilaments(ams);
      }
      // L'imprimante peut conserver une tâche échouée après effacement de l'erreur.
      const clearedFailure = report.gcode_state === 'FAILED' && report.print_error === 0;
      const status = clearedFailure ? 'ready' : states.get(report.gcode_state);
      if (!status) return;
      clearTimeout(timeout);
      printer.lastReport = Date.now();
      const controls = reportedControls('bambu', report);
      printer.controls = controls;
      if (tracked) diagnostics?.report(machine.id);
      const percent = report.mc_percent;
      printer.current = {
        status,
        issue: status === 'error' ? 'bambu-print' : null,
        nozzle: temperature(controls.heaters.find(item => item.id === 'nozzle')?.current),
        bed: temperature(controls.heaters.find(item => item.id === 'bed')?.current),
        progress: status === 'done' ? 100 : !clearedFailure && typeof percent === 'number' && Number.isFinite(percent)
          ? Math.round(Math.max(0, Math.min(100, percent))) : 0,
        ...(filaments !== null ? { filaments } : {}),
        file: !clearedFailure && typeof report.subtask_name === 'string' ? report.subtask_name.trim().slice(0, 200) : '',
      };
    });
    client.on('error', (error: Error & { code?: unknown }) => {
      const code = String(error.code ?? '');
      trace('mqtt-error', { code: /^[A-Z0-9_]{1,60}$/.test(code) ? code : 'network-error' });
      if (code === '4' || code === '5') printer.current = empty('error', 'bambu-access');
      else if (/CERT|ISSUER|SELF_SIGNED|SIGNATURE|VERIFY|TLS/.test(code)) printer.current = empty('error', 'bambu-tls');
      else printer.current = empty('offline', 'bambu-connection');
      if (tracked) diagnostics?.record('mqtt', printer.current.issue ?? '', machine.id);
    });
    client.on('close', () => {
      trace('mqtt-closed', { count: pending.size });
      if (tracked) diagnostics?.record('mqtt', 'retry', machine.id);
      clearTimeout(timeout);
      printer.lastReport = 0;
      if (printer.current.status !== 'error') printer.current = empty('offline', 'bambu-connection');
    });
    return printer;
  }

  const session = (machine: P2SConnection): Printer => {
    if (closed) throw new Error('bambu-connection');
    let printer = printers.get(machine.id);
    if (!printer) printers.set(machine.id, printer = open(machine, true));
    return printer;
  };

  return {
    controlState(machine: P2SConnection) {
      const printer = printers.get(machine.id);
      if (!printer?.lastReport || Date.now() - printer.lastReport > 60000 || !['ready', 'done', 'printing', 'paused'].includes(printer.current.status)) return undefined;
      return printer.controls;
    },
    send(machine: P2SConnection, command: string, params: Record<string, unknown> = {}, channel: P2SChannel = 'print') {
      if (closed) return Promise.reject(new Error('bambu-connection'));
      return session(machine).send(command, params, channel);
    },
    command(machine: P2SConnection, action: string) {
      if (!['pause', 'resume', 'stop'].includes(action)) return false;
      if (closed) return Promise.reject(new Error('bambu-connection'));
      return session(machine).send(action, { param: '' });
    },
    read(machine: P2SConnection) {
      if (closed) return { ...empty('offline', 'bambu-connection'), checkedAt: null };
      const { current, lastReport, authorizationDenied } = session(machine);
      return { ...current, ...(authorizationDenied ? { controlIssue: 'bambu-authorization' } : {}), checkedAt: lastReport ? new Date(lastReport).toISOString() : null };
    },
    async probe(machine: P2SConnection, signal?: AbortSignal) {
      if (closed) return { ok: false, issue: 'bambu-connection' };
      const printer = open(machine);
      try {
        const until = Date.now() + 14000;
        while (!printer.lastReport && printer.current.status === 'connecting' && Date.now() < until) {
          await delay(100, undefined, { signal });
        }
        return { ok: Boolean(printer.lastReport), issue: printer.lastReport ? null : printer.current.issue ?? 'bambu-report' };
      } finally {
        printer.close();
      }
    },
    forget(id: string) {
      printers.get(id)?.close();
      printers.delete(id);
    },
    close() {
      closed = true;
      for (const printer of printers.values()) printer.close();
      printers.clear();
    },
  };
}
