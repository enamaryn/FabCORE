import { createSocket } from 'node:dgram';
import { readFileSync } from 'node:fs';
import { setMaxListeners } from 'node:events';
import { networkInterfaces } from 'node:os';
import { connect } from 'node:tls';
import { privateIPv4, readResponse } from './connector-http.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));
const toNumber = (ip) => ip.split('.').reduce((number, octet) => number * 256 + Number(octet), 0);
const toIP = (number) => [24, 16, 8, 0].map((shift) => (number >>> shift) & 255).join('.');
const safeSerial = (serial) => typeof serial === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(serial);

export function discoveryNetworks(interfaces = networkInterfaces()) {
  const available = new Map();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4' || !privateIPv4(entry.address) || !entry.cidr) continue;
      const prefix = Math.max(24, Number(entry.cidr.split('/')[1]));
      if (!Number.isInteger(prefix) || prefix > 30) continue;
      const size = 2 ** (32 - prefix);
      const start = Math.floor(toNumber(entry.address) / size) * size;
      const cidr = `${toIP(start)}/${prefix}`;
      const network = available.get(cidr) ?? { cidr, start, end: start + size - 1, own: [] };
      network.own.push(entry.address);
      available.set(cidr, network);
    }
  }
  return [...available.values()];
}

async function httpJSON(url, signal) {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(550)])
    });
    if (response.ok) return await readResponse(response);
    await response.body?.cancel();
  } catch { /* An unavailable or unrelated service is skipped. */ }
  return null;
}

function detectBambu(host, signal) {
  return new Promise((resolve) => {
    const socket = connect({
      host, port: 8883, ca, rejectUnauthorized: true, maxVersion: 'TLSv1.2',
      // Discovery checks the manufacturer CA. Enrollment verifies the serial.
      checkServerIdentity: () => undefined
    });
    const abort = () => finish(null);
    const timeout = setTimeout(abort, 550);
    function finish(device) {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      socket.destroy();
      resolve(device);
    }
    socket.once('error', abort);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      const serial = cert.subject?.CN;
      const supportedIssuer = cert.issuer?.CN === 'BBL Device CA N7-V2';
      finish(supportedIssuer ? { kind: 'bambu', host,
        serial: typeof serial === 'string' && /^[A-Za-z0-9]{8,32}$/.test(serial) ? serial : undefined } : null);
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

function detectCC1(network, signal) {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const found = new Map();
    let ended = false;
    const timer = setTimeout(finish, 1400);
    function finish() {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      socket.close();
      resolve([...found.values()]);
    }
    socket.on('error', finish);
    socket.on('message', (payload, peer) => {
      const address = toNumber(peer.address);
      if (address <= network.start || address >= network.end || payload.length > 8192) return;
      try {
        const data = JSON.parse(payload)?.Data;
        if (data?.MachineName?.toLowerCase() === 'centauri carbon' && safeSerial(data.MainboardID)) {
          found.set(peer.address, { kind: 'elegoo-cc1', host: peer.address, serial: data.MainboardID });
        }
      } catch { /* Ignore unrelated UDP traffic. */ }
    });
    socket.bind(0, network.own[0], () => {
      if (ended) return;
      socket.setBroadcast(true);
      socket.send('M99999', 3000, '255.255.255.255', (error) => { if (error) finish(); });
    });
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  });
}

export async function detectOctoPrint(host, signal, fetcher = fetch) {
  if (!privateIPv4(host)) return [];
  const origins = [`http://${host}:5000`, `http://${host}`];
  const checks = await Promise.all(origins.map(async origin => {
    try {
      const response = await fetcher(origin + '/login/', {
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(550)])
      });
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
        await response.body?.cancel();
        return null;
      }
      const reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let prefix = '';
      let remaining = 16 * 1024;
      try {
        while (remaining > 0) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = value.subarray(0, remaining);
          remaining -= chunk.byteLength;
          prefix += decoder.decode(chunk, { stream: true });
          const title = /<title>\s*([^<]+?)\s*<\/title>/i.exec(prefix)?.[1];
          if (title) {
            return /^(?:.+\s[-–·]\s)?OctoPrint Login$/i.test(title)
              ? { kind: 'octoprint', host, origin } : null;
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } catch { /* An unavailable or unrelated service is skipped. */ }
    return null;
  }));
  return checks.filter(Boolean);
}

async function detectHost(host, signal) {
  const [moonraker, elegoo, bambu, octoprint] = await Promise.all([
    httpJSON(`http://${host}:7125/server/info`, signal),
    httpJSON(`http://${host}/system/info`, signal),
    detectBambu(host, signal),
    detectOctoPrint(host, signal)
  ]);
  const found = [];
  if (typeof moonraker?.result?.moonraker_version === 'string') {
    found.push({ kind: 'klipper', host, origin: `http://${host}:7125` });
  }
  const info = elegoo?.system_info;
  const model = info?.machine_model ?? info?.model ?? info?.hostname;
  if (typeof model === 'string' && /centauri[ _-]*carbon[ _-]*2/i.test(model) && safeSerial(info.sn)) {
    found.push({ kind: 'elegoo', host, serial: info.sn });
  }
  if (bambu) found.push(bambu);
  return [...found, ...octoprint];
}

export async function scanNetwork(network, signal, { inspectHost = detectHost, broadcast = detectCC1 } = {}) {
  setMaxListeners(32, signal);
  const found = [];
  const discovery = broadcast(network, signal);
  let cursor = network.start + 1;
  async function worker() {
    while (!signal.aborted && cursor < network.end) {
      const host = toIP(cursor++);
      if (!network.own.includes(host)) found.push(...await inspectHost(host, signal));
    }
  }
  await Promise.all(Array.from({ length: 20 }, worker));
  found.push(...await discovery);
  return found.sort((a, b) => toNumber(a.host) - toNumber(b.host) || a.kind.localeCompare(b.kind));
}


export function reconcileDiscovery(network, found, machines) {
  const registered = machines.flatMap(machine => {
    const host = URL.parse(machine.origin)?.hostname;
    return privateIPv4(host) ? [{ machine, host }] : [];
  });
  const matched = new Set();
  const devices = found.map(device => {
    const match = registered.find(({ machine, host }) => {
      if ((machine.kind ?? 'klipper') !== device.kind) return false;
      if (device.serial && machine.serial) return device.serial.toUpperCase() === machine.serial.toUpperCase();
      return device.origin ? device.origin === machine.origin : device.host === host;
    });
    if (match) matched.add(match.machine.id);
    return { ...device, registered: Boolean(match), ...(match ? { name: match.machine.name } : {}) };
  });
  for (const { machine, host } of registered) {
    const address = toNumber(host);
    if (matched.has(machine.id) || !(address > network.start && address < network.end)) continue;
    devices.push({ kind: machine.kind ?? 'klipper', host, name: machine.name, registered: true, detected: false });
  }
  return devices.sort((a, b) => toNumber(a.host) - toNumber(b.host) || a.kind.localeCompare(b.kind));
}
