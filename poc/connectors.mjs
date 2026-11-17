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
  klipper: httpConnector('Klipper · Moonraker', 7125, false, async ({ readPrinter, sendCommand, fetchFiles }) => {
    const mod = await import('./moonraker.mjs');
    const read = readPrinter ?? mod.readMoonraker;
    return { read: machine => read(machine), probe: probeStatus(machine => read(machine), ['print']), command: sendCommand ?? mod.commandMoonraker,
      files: mod.createMoonrakerFiles(fetchFiles) };
  }, { commands: true, files: true }),
  octoprint: httpConnector('OctoPrint', 5000, true, async ({ readOcto, fetchFiles }) => {
    const mod = await import('./octoprint.mjs');
    const read = readOcto ?? mod.readOctoPrint;
    return { read, probe: probeStatus(read, ['octoprint-disconnected', 'octoprint-printer-error'], true), files: mod.createOctoPrintFiles(fetchFiles) };
  }, { interval: 5000, files: true }),
  prusalink: httpConnector('PrusaLink', 80, true, async ({ readPrusa }) => {
    const read = readPrusa ?? (await import('./prusalink.mjs')).readPrusaLink;
    return { read, probe: probeStatus(read, ['prusalink-printer-error'], true) };
  }, { interval: 5000 }),
  bambu: localConnector('Bambu Lab · P2S', 'bambu', (host, data, existing) => {
    const serial = value(data, 'serial', 32).toUpperCase();
    const accessCode = secret(data, existing, 'accessCode', 8);
    if (/^[A-Z0-9]{8,32}$/.test(serial) && /^[A-Za-z0-9]{8}$/.test(accessCode)) return { origin: `mqtts://${host}:8883`, serial, accessCode };
  }, async ({ bambu, diagnostics }) => {
    const monitor = bambu ?? (await import('./bambu.mjs')).createBambuMonitor(undefined, diagnostics);
    return {
      ...monitor, probe: (machine, { signal }) => monitor.probe(machine, signal),
      async camera(machine, output, signal, frame) {
        const { streamBambuCamera } = await import('./bambu-camera.mjs');
        if (!(await streamBambuCamera(machine, output, signal, frame))) return 'no-stream';
      }
    };
  }, { camera: true, filaments: 'AMS', live: true }),
  elegoo: localConnector('Elegoo · Centauri Carbon 2', 'elegoo', (host, data, existing) => {
    const accessCode = secret(data, existing, 'accessCode', 64);
    if (/^[!-~]{1,64}$/.test(accessCode)) return { origin: `mqtt://${host}:1883`, serial: existing?.serial, accessCode };
  }, async ({ readCC2, identifyCC2, diagnostics, openCamera }) => {
    const mod = await import('./elegoo.mjs');
    const identify = identifyCC2 ?? mod.identifyElegoo;
    const monitor = readCC2 ? null : mod.createElegooMonitor({ diagnostics });
    const read = readCC2 ?? monitor.read;
    return {
      read, close: monitor?.close,
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
  }, { camera: true, filaments: 'CANVAS', interval: 7000, verify: true }),
  'elegoo-cc1': localConnector('Elegoo · Centauri Carbon', 'elegoo-cc1', (host, data, existing) => {
    const serial = existing?.serial ?? value(data, 'serial', 64);
    if (!serial || /^[a-zA-Z0-9_-]{6,64}$/.test(serial)) return { origin: `ws://${host}:3030`, serial: serial || undefined };
  }, async ({ readCC1, openCamera }) => {
    const read = readCC1 ?? (await import('./elegoo-cc1.mjs')).readElegooCC1;
    return {
      read,
      probe: async (machine, options) => identified(await read(machine, options), ['elegoo-print']),
      camera: (machine, output, signal, frame) => elegooCamera(machine, output, signal, frame, openCamera, read)
    };
  }, { camera: true, interval: 7000, verify: true }),
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
  }, { temperatures: false, printJob: false, live: true, verify: true })
};

function identified(result, tolerated) {
  const ok = Boolean(result.serial && (!result.issue || tolerated.includes(result.issue)));
  return { ok, issue: ok ? null : result.issue, serial: result.serial,
    ...(result.fingerprint ? { fingerprint: result.fingerprint } : {}),
    ...(result.pairingToken ? { pairingToken: result.pairingToken } : {}) };
}
export const connectorDefinition = kind => typeof kind === 'string' && Object.hasOwn(definitions, kind) ? definitions[kind] : null;
export const connectorCatalog = Object.fromEntries(Object.entries(definitions).map(([kind, {
  model, form, port, required, camera = false, commands = false, files = false, filaments = null, temperatures = true, printJob = true
}]) => [kind, { model, form, port, required, camera, commands, files, filaments, temperatures, printJob }]));

export function createConnectorRegistry(options, definition = connectorDefinition) {
  const pending = new Map();
  const loaded = new Map();
  let closed = false;
  return {
    async get(kind) {
      const entry = definition(kind);
      if (!entry || closed) return null;
      if (!pending.has(kind)) {
        pending.set(kind, Promise.resolve().then(() => entry.load(options)).then(connector => {
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
