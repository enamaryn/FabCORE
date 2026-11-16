import { readFileSync } from 'node:fs';
import { checkServerIdentity } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from 'mqtt';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));
const states = new Map([
  ['IDLE', 'ready'], ['INIT', 'connecting'], ['PREPARE', 'printing'],
  ['RUNNING', 'printing'], ['PAUSE', 'paused'], ['FINISH', 'done'], ['FAILED', 'error']
]);
const request = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } });
const empty = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

export function createBambuMonitor(connectPrinter = connect) {
  const printers = new Map();

  function open(machine) {
    const reportTopic = `device/${machine.serial}/report`;
    const requestTopic = `device/${machine.serial}/request`;
    const printer = { current: empty('connecting', null), lastReport: 0 };
    let report = {};
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
      report = {};
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
      try { delta = JSON.parse(payload)?.print; } catch { return; }
      if (delta?.command !== 'push_status') return;
      report = { ...report, ...delta };
      // The printer can retain a failed job after its print error was cleared.
      const clearedFailure = report.gcode_state === 'FAILED' && report.print_error === 0;
      const status = clearedFailure ? 'ready' : states.get(report.gcode_state);
      if (!status) return;
      clearTimeout(timeout);
      printer.lastReport = Date.now();
      printer.current = {
        status,
        issue: status === 'error' ? 'bambu-print' : null,
        nozzle: temperature(report.nozzle_temper),
        bed: temperature(report.bed_temper),
        progress: status === 'done' ? 100 : !clearedFailure && Number.isFinite(report.mc_percent)
          ? Math.round(Math.max(0, Math.min(100, report.mc_percent))) : 0,
        file: !clearedFailure && typeof report.subtask_name === 'string' ? report.subtask_name.trim().slice(0, 200) : ''
      };
    });
    client.on('error', (error) => {
      const code = String(error.code ?? '');
      if (code === '4' || code === '5') printer.current = empty('error', 'bambu-access');
      else if (/CERT|ISSUER|SELF_SIGNED|SIGNATURE|VERIFY|TLS/.test(code)) printer.current = empty('error', 'bambu-tls');
      else printer.current = empty('offline', 'bambu-connection');
    });
    client.on('close', () => {
      clearTimeout(timeout);
      printer.lastReport = 0;
      if (printer.current.status !== 'error') printer.current = empty('offline', 'bambu-connection');
    });
    printer.close = () => {
      clearTimeout(timeout);
      client.end(true);
    };
    return printer;
  }

  return {
    read(machine) {
      if (!printers.has(machine.id)) printers.set(machine.id, open(machine));
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
