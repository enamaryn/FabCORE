import { join } from 'node:path';
import { retainedFiles } from './production-files.mjs';
import { privateIPv4, moonrakerOrigin } from './connector-http.mjs';

const value = (data, key, max) => typeof data[key] === 'string' && data[key].length <= max ? data[key].trim() : '';
const secret = (data, existing, key, max) => value(data, key, max) || (data[key] === '' ? existing?.[key] ?? '' : '');

// Metadata is available without loading a connector's network client.
function httpConnector(model, port, required, load, capabilities = {}) {
  return {
    model, form: 'http', port, required, load, ...capabilities,
    configure(data, existing) {
      const origin = moonrakerOrigin(value(data, 'origin', 200));
      const apiKey = secret(data, !required || origin === existing?.origin ? existing : null, 'apiKey', 256);
      const valid = required ? /^[!-~]{1,256}$/.test(apiKey) : !data.apiKey || /^[!-~]+$/.test(apiKey);
      if (origin && valid) return { origin, apiKey };
    }
  };
}
function localConnector(model, form, configure, load, capabilities = {}) {
  return {
    model, form, load, ...capabilities,
    configure(data, existing) {
      const host = value(data, 'host', 15);
      if (privateIPv4(host)) return configure(host, data, existing);
    }
  };
}

const probeStatus = (read, allowed = [], keepIssue = false) => async (machine, { signal }) => {
  const result = await read(machine, { signal });
  const ok = !result.issue || allowed.includes(result.issue);
  return { ok, issue: ok && !keepIssue ? null : result.issue };
};
async function elegooCamera(machine, output, signal, onFrame, openCamera, identify) {
  const { cameraURL, streamCamera } = await import('./camera.mjs');
  const url = cameraURL(machine);
  if (!url) return 'invalid-stream';
  const identity = await identify(machine, { signal });
  if (signal.aborted) return;
  if (identity.serial !== machine.serial || (identity.issue && identity.issue !== 'elegoo-print')) return 'identity';
  if (!(await streamCamera(url, output, signal, openCamera, onFrame))) return 'invalid-stream';
}

const definitions = {
  klipper: httpConnector('Klipper · Moonraker', 7125, false, async ({ readPrinter, sendCommand, sendGcode, fetchFiles }) => {
    const mod = await import('./moonraker.mjs');
    const read = readPrinter ?? mod.readMoonraker;
    return { read: machine => read(machine), probe: probeStatus(machine => read(machine), ['print']), command: sendCommand ?? mod.commandMoonraker,
      files: mod.createMoonrakerFiles(fetchFiles), gcode: sendGcode ?? mod.sendMoonrakerGcode };
  }, { commands: true, commandActions: ['pause', 'resume', 'stop'], files: true, terminal: true, controls: true }),
  octoprint: httpConnector('OctoPrint', 5000, true, async ({ readOcto, sendGcode, fetchFiles, sendCommand }) => {
    const mod = await import('./octoprint.mjs');
    const read = readOcto ?? mod.readOctoPrint;
    return { read, probe: probeStatus(read, ['octoprint-disconnected', 'octoprint-printer-error'], true), files: mod.createOctoPrintFiles(fetchFiles),
      gcode: sendGcode ?? mod.sendOctoPrintGcode, command: sendCommand ?? ((machine, action) => mod.commandOctoPrint(machine, action, fetchFiles)) };
  }, { interval: 5000, commands: true, commandActions: ['pause', 'resume', 'stop'], files: true, terminal: true, controls: true }),
  prusalink: httpConnector('PrusaLink', 80, true, async ({ readPrusa, fetchFiles }) => {
    const mod = await import('./prusalink.mjs');
    const read = readPrusa ?? mod.readPrusaLink;
    return { read, probe: probeStatus(read, ['prusalink-printer-error'], true), ...mod.createPrusaOperations(fetchFiles) };
  }, { interval: 5000, commands: true, commandActions: ['pause', 'resume', 'stop'], files: true }),
  bambu: localConnector('Bambu Lab · P2S', 'bambu', (host, data, existing) => {
    const serial = value(data, 'serial', 32).toUpperCase();
    const accessCode = secret(data, existing, 'accessCode', 8);
    if (/^[A-Z0-9]{8,32}$/.test(serial) && /^[A-Za-z0-9]{8}$/.test(accessCode)) return { origin: `mqtts://${host}:8883`, serial, accessCode };
  }, async ({ bambu, diagnostics, directory }) => {
    const monitor = bambu ?? (await import('./bambu.mjs')).createBambuMonitor(undefined, diagnostics);
    const { createBambuFiles } = await import('./bambu-files.mjs');
    return {
      ...monitor, files: retainedFiles(join(directory, 'files'), createBambuFiles((...args) => monitor.send(...args)), { projects: true }), probe: (machine, { signal }) => monitor.probe(machine, signal),
      async camera(machine, output, signal, frame) {
        const { streamBambuCamera } = await import('./bambu-camera.mjs');
        if (!(await streamBambuCamera(machine, output, signal, frame))) return 'no-stream';
      }
    };
  }, { camera: true, filaments: 'AMS', controls: true, live: true, commands: true, commandActions: ['pause', 'resume', 'stop'], files: true, projects: true, externalFilament: true }),
  elegoo: localConnector('Elegoo · Centauri Carbon 2', 'elegoo', (host, data, existing) => {
    const accessCode = secret(data, existing, 'accessCode', 64);
    if (/^[!-~]{1,64}$/.test(accessCode)) return { origin: `mqtt://${host}:1883`, serial: existing?.serial, accessCode };
  }, async ({ readCC2, identifyCC2, diagnostics, openCamera, directory, fetchFiles }) => {
    const mod = await import('./elegoo.mjs');
    const identify = identifyCC2 ?? mod.identifyElegoo;
    const monitor = readCC2 ? null : mod.createElegooMonitor({ diagnostics });
    const read = readCC2 ?? monitor.read;
    const { createElegooFiles } = await import('./elegoo-files.mjs');
    return {
      read, controlState: monitor?.controlState, request: monitor?.request, close: monitor?.close, command: (...args) => monitor?.command(...args),
      files: retainedFiles(join(directory, 'files'), createElegooFiles((...args) => monitor.request(...args), { fetcher: fetchFiles })),
      forget(id, changed) { if (changed) monitor?.forget(id); },
      async probe(machine, options) {
        let result;
        if (options.sameConnection && monitor) {
          result = await identify(machine, options);
          if (options.testing && result.serial) result = await monitor.read(machine);
        } else result = await (readCC2 ?? mod.readElegoo)(machine, options);
        return identified(result, ['elegoo-print']);
      },
      camera: (machine, output, signal, frame) => elegooCamera(machine, output, signal, frame, openCamera, identify)
    };
  }, { camera: true, filaments: 'CANVAS', controls: true, interval: 7000, verify: true, commands: true, commandActions: ['pause', 'stop'], files: true, retainedOnly: true, externalFilament: true }),
  'elegoo-cc1': localConnector('Elegoo · Centauri Carbon', 'elegoo-cc1', (host, data, existing) => {
    const serial = existing?.serial ?? value(data, 'serial', 64);
    if (!serial || /^[a-zA-Z0-9_-]{6,64}$/.test(serial)) return { origin: `ws://${host}:3030`, serial: serial || undefined };
  }, async ({ readCC1, openCamera, directory, fetchFiles }) => {
    const mod = await import('./elegoo-cc1.mjs');
    const read = readCC1 ?? mod.readElegooCC1;
    const { createElegooFiles } = await import('./elegoo-files.mjs');
    return {
      read, command: mod.commandElegooCC1,
      files: retainedFiles(join(directory, 'files'), createElegooFiles(mod.requestElegooCC1, { cc1: true, fetcher: fetchFiles })),
      probe: async (machine, options) => identified(await read(machine, options), ['elegoo-print']),
      camera: (machine, output, signal, frame) => elegooCamera(machine, output, signal, frame, openCamera, read)
    };
  }, { camera: true, interval: 7000, verify: true, commands: true, commandActions: ['pause', 'resume', 'stop'], files: true, retainedOnly: true, externalFilament: true }),
  'xtool-m2': localConnector('xTool · M2', 'xtool-m2', (host, _data, existing) => ({
    origin: `wss://${host}:28900`, serial: existing?.serial, fingerprint: existing?.fingerprint,
    ...(existing?.origin === `wss://${host}:28900` && existing.pairingToken ? { pairingToken: existing.pairingToken } : {})
  }), async () => {
    const { readXTool, createXToolMonitor } = await import('./xtool.mjs');
    const monitor = createXToolMonitor();
    return { ...monitor, probe: async (machine, options) => {
      monitor.forget(machine.id);
      return identified(await readXTool(machine, options), ['xtool-device']);
    } };
  }, { temperatures: false, printJob: false, camera: true, live: true, verify: true, commands: true, commandActions: ['start', 'pause', 'resume', 'stop'] })
};

function identified(result, tolerated) {
  const ok = Boolean(result.serial && (!result.issue || tolerated.includes(result.issue)));
  return { ok, issue: ok ? null : result.issue, serial: result.serial,
    ...(result.fingerprint ? { fingerprint: result.fingerprint } : {}),
    ...(result.pairingToken ? { pairingToken: result.pairingToken } : {}) };
}
export const connectorDefinition = kind => typeof kind === 'string' && Object.hasOwn(definitions, kind) ? definitions[kind] : null;
export const connectorCatalog = Object.fromEntries(Object.entries(definitions).map(([kind, {
  model, form, port, required, camera = false, commands = false, commandActions = [], files = false, projects = false, retainedOnly = false, externalFilament = false, terminal = false, filaments = null, temperatures = true, printJob = true, controls = false
}]) => [kind, { model, form, port, required, camera, commands, commandActions, files, projects, retainedOnly, externalFilament, terminal, filaments, temperatures, printJob, controls }]));

export function createConnectorRegistry(options, definition = connectorDefinition) {
  const pending = new Map();
  const loaded = new Map();
  let closed = false;
  return {
    async get(kind) {
      const entry = definition(kind);
      if (!entry || closed) return null;
      if (!pending.has(kind)) {
        pending.set(kind, Promise.resolve().then(() => entry.load(options)).then(async connector => {
          if (entry.controls) {
            const { createManualControls } = await import('./manual-controls.mjs');
            connector.control = createManualControls(kind, { fetcher: options.fetchFiles, send: (...args) => connector.send(...args), request: (...args) => connector.request(...args), read: connector.controlState });
          }
          if (closed) { connector.close?.(); return null; }
          loaded.set(kind, connector);
          return connector;
        }, error => {
          pending.delete(kind);
          throw error;
        }));
      }
      return pending.get(kind);
    },
    forget(kind, id, changed) { loaded.get(kind)?.forget?.(id, changed); },
    close() {
      closed = true;
      for (const connector of loaded.values()) connector.close?.();
      loaded.clear();
      pending.clear();
    }
  };
}
