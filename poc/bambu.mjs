import { reportedControls } from './manual-controls.mjs';
import { readFileSync } from 'node:fs';
import { checkServerIdentity } from 'node:tls';
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from 'mqtt';
import { bambuFilaments } from './filaments.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));
const states = new Map([
  ['IDLE', 'ready'], ['INIT', 'connecting'], ['PREPARE', 'printing'],
  ['RUNNING', 'printing'], ['PAUSE', 'paused'], ['FINISH', 'done'], ['FAILED', 'error']
]);
const request = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });
const empty = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
// Keep nested temperature fields across incremental firmware reports.
function mergeReport(previous, update) {
  const result = { ...previous };
  for (const [key, value] of Object.entries(update)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeReport(previous?.[key] ?? {}, value) : value;
  }
  return result;
}

export function createBambuMonitor(connectPrinter = connect, diagnostics) {
  const printers = new Map();

  function open(machine, tracked = false) {
    const reportTopic = `device/${machine.serial}/report`;
    const requestTopic = `device/${machine.serial}/request`;
    const printer = { current: empty('connecting', null), lastReport: 0 };
    const pending = new Map();
    let report = {};
    let ams = {};
    let filaments = null;
    let timeout;
    const client = connectPrinter(machine.origin, {
      username: 'bblp',
      password: machine.accessCode,
      ca,
      rejectUnauthorized: true,
      checkServerIdentity: (_host, certificate) => checkServerIdentity(machine.serial, certificate),
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      connectTimeout: 5000,
      reconnectPeriod: 10000,
      keepalive: 20,
      queueQoSZero: false,
      resubscribe: false
    });
    printer.client = client;

    function requestReport() {
      clearTimeout(timeout);
      client.publish(requestTopic, request);
      timeout = setTimeout(() => {
        if (!printer.lastReport) printer.current = empty('error', 'bambu-report');
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
        if (error || !grants?.length || grants[0].qos >= 128) {
          printer.current = empty('error', 'bambu-access');
          return;
        }
        requestReport();
      });
    });
    client.on('message', (topic, payload) => {
      if (topic !== reportTopic || payload.length > 512 * 1024) return;
      let delta;
      let channel;
      try { const envelope = JSON.parse(payload); channel = envelope.print ? 'print' : 'system'; delta = envelope[channel]; } catch { return; }
      const acknowledgement = pending.get(String(delta?.sequence_id));
      if (acknowledgement && delta.command === acknowledgement.command && channel === acknowledgement.channel) {
        pending.delete(String(delta.sequence_id));
        clearTimeout(acknowledgement.timer);
        if (delta.result === 'success') acknowledgement.resolve(true);
        else if (delta.result === 'fail' || delta.result === 'failed') acknowledgement.resolve(false);
        else acknowledgement.reject(new Error('command-unconfirmed'));
        return;
      }
      if (delta?.command !== 'push_status') return;
      report = { ...report, ...delta, ...(delta.device ? { device: mergeReport(report.device ?? {}, delta.device) } : {}) };
      if (delta.ams && typeof delta.ams === 'object' && !Array.isArray(delta.ams)) {
        ams = { ...ams, ...delta.ams };
        filaments = bambuFilaments(ams);
      }
      // The printer can retain a failed job after its print error was cleared.
      const clearedFailure = report.gcode_state === 'FAILED' && report.print_error === 0;
      const status = clearedFailure ? 'ready' : states.get(report.gcode_state);
      if (!status) return;
      clearTimeout(timeout);
      printer.lastReport = Date.now();
      printer.controls = reportedControls('bambu', report);
      if (tracked) diagnostics?.report(machine.id);
      printer.current = {
        status,
        issue: status === 'error' ? 'bambu-print' : null,
        nozzle: temperature(printer.controls.heaters.find(item => item.id === 'nozzle')?.current),
        bed: temperature(printer.controls.heaters.find(item => item.id === 'bed')?.current),
        progress: status === 'done' ? 100 : !clearedFailure && Number.isFinite(report.mc_percent)
          ? Math.round(Math.max(0, Math.min(100, report.mc_percent))) : 0,
        ...(filaments !== null ? { filaments } : {}),
        file: !clearedFailure && typeof report.subtask_name === 'string' ? report.subtask_name.trim().slice(0, 200) : ''
      };
    });
    client.on('error', (error) => {
      const code = String(error.code ?? '');
      if (code === '4' || code === '5') printer.current = empty('error', 'bambu-access');
      else if (/CERT|ISSUER|SELF_SIGNED|SIGNATURE|VERIFY|TLS/.test(code)) printer.current = empty('error', 'bambu-tls');
      else printer.current = empty('offline', 'bambu-connection');
      if (tracked) diagnostics?.record('mqtt', printer.current.issue, machine.id);
    });
    client.on('close', () => {
      if (tracked) diagnostics?.record('mqtt', 'retry', machine.id);
      clearTimeout(timeout);
      printer.lastReport = 0;
      if (printer.current.status !== 'error') printer.current = empty('offline', 'bambu-connection');
    });
    printer.close = () => {
      clearTimeout(timeout);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('command-unconfirmed')); }
      pending.clear();
      client.end(true);
    };
    printer.send = (command, params, channel = 'print') => new Promise((resolve, reject) => {
      if (!client.connected || !printer.lastReport || Date.now() - printer.lastReport > 60000) return reject(new Error('bambu-connection'));
      const id = String(randomInt(1, 0x7fffffff));
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('command-unconfirmed')); }, 6000);
      pending.set(id, { command, channel, resolve, reject, timer });
      // QoS 0 avoids MQTT replay after reconnect; execution is verified by state.
      client.publish(requestTopic, JSON.stringify({ [channel]: { ...params, command, sequence_id: id } }), { qos: 0, retain: false }, error => {
        if (error && pending.has(id)) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    });
    return printer;
  }

  return {
    controlState(machine) {
      const printer = printers.get(machine.id);
      if (!printer?.lastReport || Date.now() - printer.lastReport > 60000 || !['ready', 'done', 'printing', 'paused'].includes(printer.current.status)) return undefined;
      return printer.controls;
    },
    send(machine, command, params = {}, channel = 'print') {
      if (!printers.has(machine.id)) printers.set(machine.id, open(machine, true));
      return printers.get(machine.id).send(command, params, channel);
    },
    command(machine, action) {
      if (!['pause', 'resume', 'stop'].includes(action)) return false;
      if (!printers.has(machine.id)) printers.set(machine.id, open(machine, true));
      return printers.get(machine.id).send(action, { param: '' });
    },
    read(machine) {
      if (!printers.has(machine.id)) printers.set(machine.id, open(machine, true));
      const { current, lastReport } = printers.get(machine.id);
      return { ...current, checkedAt: lastReport ? new Date(lastReport).toISOString() : null };
    },
    async probe(machine, signal) {
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
    forget(id) {
      printers.get(id)?.close();
      printers.delete(id);
    },
    close() {
      for (const printer of printers.values()) printer.close();
      printers.clear();
    }
  };
}
