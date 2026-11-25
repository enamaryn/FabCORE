import { setMaxListeners } from 'node:events';
import { discoveryNetworks, detectBambu } from './discovery.mjs';
import { privateIPv4 } from './connector-http.mjs';

const toIP = number => [24, 16, 8, 0].map(shift => (number >>> shift) & 255).join('.');
/** Find LAN video/files by the serial in a manufacturer-verified TLS certificate; no MQTT login or command. */
export function createBambuLanResolver({ networks = discoveryNetworks, probe = detectBambu, now = Date.now } = {}) {
  let task, cache = new Map(), lastScan = -Infinity, networkKey = '', closed = false;
  const stop = new AbortController();
  async function scan(available) {
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(12000)]);
    setMaxListeners(96, signal);
    const hosts = new Set();
    for (const network of available) {
      if (!Number.isInteger(network.start) || !Number.isInteger(network.end) || network.end - network.start > 255 || network.end <= network.start) continue;
      for (let at = network.start + 1; at < network.end && hosts.size < 1024; at++) {
        const host = toIP(at); if (privateIPv4(host) && !network.own?.includes(host)) hosts.add(host);
      }
    }
    const addresses = [...hosts], found = new Map(); let cursor = 0;
    async function worker() {
      while (!signal.aborted && cursor < addresses.length) {
        const host = addresses[cursor++]; let device;
        try { device = await probe(host, signal); } catch { continue; }
        if (device?.kind !== 'bambu' || typeof device.serial !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(device.serial) || device.host !== host) continue;
        const serial = device.serial.toUpperCase(); if (!found.has(serial)) found.set(serial, new Set()); found.get(serial).add(host);
      }
    }
    await Promise.all(Array.from({ length: Math.min(32, addresses.length) }, worker));
    if (closed) return;
    cache = new Map([...found].filter(([, candidates]) => candidates.size === 1).map(([serial, candidates]) => [serial, [...candidates][0]]));
    lastScan = now();
  }
  return {
    async resolve(serial, signal) {
      if (closed || signal?.aborted || typeof serial !== 'string' || !/^[A-Za-z0-9]{8,32}$/.test(serial)) return null;
      const available = networks().slice(0, 4); const key = JSON.stringify(available);
      if (key !== networkKey) { if (task) await task; cache.clear(); lastScan = -Infinity; networkKey = key; }
      const known = cache.get(serial.toUpperCase());
      if (known && now() - lastScan < 300000) return known;
      if (!task && now() - lastScan < 60000) return null;
      if (!task) task = scan(available).finally(() => { task = undefined; });
      let onAbort;
      try {
        await Promise.race([task, ...(signal ? [new Promise(resolve => { onAbort = () => resolve(); signal.addEventListener('abort', onAbort, { once: true }); })] : [])]);
      } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
      return closed || signal?.aborted ? null : cache.get(serial.toUpperCase()) ?? null;
    },
    close() { closed = true; stop.abort(); cache.clear(); },
  };
}
