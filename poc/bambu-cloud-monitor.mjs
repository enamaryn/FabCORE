import { connect } from 'mqtt';
import { randomUUID } from 'node:crypto';
import { reportedControls } from './manual-controls.mjs';
import { bambuFilaments } from './filaments.mjs';

// Cloud supervision only. The only published messages are these two read requests.
export function createCloudMonitor({ account, token, username, log, connectMqtt = connect, now = Date.now }) {
  const host = account.region === 'china' ? 'cn.mqtt.bambulab.com' : 'us.mqtt.bambulab.com';
  const allowed = new Set(account.devices.map(device => device.serial));
  const reports = new Map(); const versions = new Map(); const timestamps = new Map();
  let status = 'connecting'; let issue = null; let closed = false; let lastRequest = -Infinity;
  const trace = (event, data = {}) => { if (closed) return; try { log(event, data); } catch { /* Storage cannot disrupt MQTT. */ } };
  const client = connectMqtt('mqtts://' + host + ':8883', { username, password: token,
    clientId: 'fabcore_' + randomUUID().replaceAll('-', '').slice(0, 24), rejectUnauthorized: true,
    reconnectPeriod: 10000, connectTimeout: 10000, clean: true });
  trace('mqtt-connect-start', { host, port: 8883 });
  function clear() { reports.clear(); versions.clear(); timestamps.clear(); }
  client.on('connect', () => {
    if (closed) return;
    status = 'connected'; issue = null; clear();
    trace('mqtt-connected', { host, tlsVerified: true });
    const topics = [...allowed].map(serial => 'device/' + serial + '/report');
    if (!topics.length) return;
    client.subscribe(topics, { qos: 0 }, (error, grants) => {
      if (closed) return;
      if (error || grants?.length !== topics.length || grants.some(item => item.qos >= 128)) {
        status = 'error'; issue = 'cloud-access'; trace('mqtt-subscribe-refused'); return;
      }
      trace('mqtt-subscribed', { count: topics.length });
      // At most once per five minutes, even when the network flaps.
      if (now() - lastRequest < 300000) return;
      lastRequest = now();
      for (const serial of allowed) for (const payload of [
        { pushing: { sequence_id: '91001', command: 'pushall', version: 1, push_target: 1 } },
        { info: { sequence_id: '91002', command: 'get_version' } }
      ]) {
        client.publish('device/' + serial + '/request', JSON.stringify(payload), { qos: 0, retain: false }, error => {
          if (!closed) trace('mqtt-read-request', { serial, payload, outcome: error ? 'failed' : 'sent' });
        });
      }
    });
  });
  client.on('message', (topic, bytes) => {
    if (closed || status !== 'connected' || bytes.length > 524288) return;
    const match = /^device\/([A-Za-z0-9_-]{1,64})\/report$/.exec(topic);
    if (!match || !allowed.has(match[1])) return;
    const serial = match[1]; let data;
    try { data = JSON.parse(bytes.toString()); } catch { trace('mqtt-invalid-json', { serial, bytes: bytes.length }); return; }
    if (data.info?.command === 'get_version' && Array.isArray(data.info.module)) {
      const modules = data.info.module.slice(0, 40).filter(item => item && typeof item === 'object').map(item => ({ name: String(item.name ?? '').slice(0, 80),
        model: String(item.product_name ?? '').slice(0, 100), serial: String(item.sn ?? '').slice(0, 80), firmware: String(item.sw_ver ?? '').slice(0, 80) }));
      versions.set(serial, modules); trace('mqtt-modules', { serial, modules });
    }
    const delta = data.print;
    if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return;
    const previous = reports.get(serial) ?? {};
    const next = { ...previous, ...delta };
    if (delta.device) next.device = { ...previous.device, ...delta.device };
    if (delta.ams) {
      next.ams = { ...previous.ams, ...delta.ams };
      if (Array.isArray(delta.ams.ams)) {
        const units = new Map((previous.ams?.ams ?? []).map(unit => [String(unit.id), unit]));
        for (const unit of delta.ams.ams) {
          const old = units.get(String(unit.id));
          const trays = new Map((old?.tray ?? []).map(tray => [String(tray.id), tray]));
          for (const tray of unit.tray ?? []) trays.set(String(tray.id), { ...trays.get(String(tray.id)), ...tray });
          units.set(String(unit.id), { ...old, ...unit, tray: [...trays.values()] });
        }
        next.ams.ams = [...units.values()];
      }
    }
    reports.set(serial, next); timestamps.set(serial, now());
    trace('mqtt-report', { serial, bytes: bytes.length, report: delta });
  });
  client.on('error', error => {
    if (closed) return;
    clear(); status = 'error'; issue = 'cloud-unavailable';
    trace('mqtt-error', { code: /^[A-Z0-9_]{1,60}$/.test(String(error.code)) ? error.code : 'network-error' });
    // Authentication refusal must not become an endless reconnect loop.
    if ([4, 5, 134, 135].includes(Number(error.code))) { issue = 'cloud-auth'; client.options.reconnectPeriod = 0; client.end(true); }
  });
  client.on('close', () => { clear(); if (!closed && status !== 'error') status = 'connecting'; trace('mqtt-closed'); });
  return {
    snapshot() {
      return { status, issue, devices: account.devices.map(device => {
        const report = reports.get(device.serial); const at = timestamps.get(device.serial);
        const stale = at === undefined || now() - at > 60000 || status !== 'connected';
        const heaters = stale ? [] : reportedControls('bambu', report).heaters;
        const filaments = stale ? [] : bambuFilaments(report.ams) ?? [];
        return { serial: device.serial, checkedAt: at === undefined ? null : new Date(at).toISOString(), stale,
          heaters: heaters.map(({ id, current, target }) => ({ id, current, target })), filaments: filaments.map(unit => {
            const raw = report.ams?.ams?.find(item => Number(item.id) === unit.id);
            const value = raw?.temp;
            const temperature = (typeof value === 'number' || typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) ? Number(value) : null;
            return { ...unit, temperature: Number.isFinite(temperature) && temperature >= -20 && temperature <= 150 ? temperature : null };
          }),
          progress: stale || !Number.isFinite(report.mc_percent) ? 0 : Math.max(0, Math.min(100, report.mc_percent)),
          file: stale ? '' : String(report.subtask_name ?? '').slice(0, 200),
          modules: versions.get(device.serial) ?? [], state: stale ? null : String(report.gcode_state ?? '').slice(0, 40) };
      }) };
    },
    close() { closed = true; clear(); status = 'disconnected'; client.options.reconnectPeriod = 0; client.end(true); }
  };
}
