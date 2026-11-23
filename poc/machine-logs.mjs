import { mkdirSync, appendFileSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const fields = new Set(('file_list filename size create_time type storage_media operation kind transport mode host port path topic channel elapsedMs bytes count status issue outcome action id value max current target writable confirmed expected actual attempt code error_code reason result sequence_id command param params payload print system info data method nozzle bed progress file checkedAt gcode_state print_error nozzle_temper nozzle_target_temper bed_temper bed_target_temper chamber_temper temp device extruder heater_bed temperature machine_status sub_status sub_status_reason_code exception_status heater heaters lights fans motion percent rpm connected timeout qos retain result_code correlated omittedFields omittedItems').split(' '));
const secretName = /password|passwd|token|secret|cookie|auth|access.?code|api.?key|session.?key|pairing|user.?key/i;
export function safeMachineDetails(value, secrets = [], depth = 0, name = '') {
  if (depth > 6) return '[depth limit]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (name === 'param' && !/^M(?:104|140|106|107|220)\b[0-9A-Z .+\-\s]{0,100}$/.test(value)) return '[omitted]';
    let result = value.slice(0, 400);
    for (const secret of secrets) if (typeof secret === 'string' && secret.length) result = result.replaceAll(secret, '[redacted]');
    return result.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/(?:password|token|access_code|api_key|cookie)\s*[:=]\s*[^\s,;]+/gi, '[redacted]');
  }
  if (Array.isArray(value)) return value.slice(0, 32).map(item => safeMachineDetails(item, secrets, depth + 1, name));
  if (typeof value !== 'object') return undefined;
  const result = {}; let omitted = 0;
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (secretName.test(key) || !fields.has(key)) { omitted++; continue; }
    const cleaned = safeMachineDetails(item, secrets, depth + 1, key);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  if (omitted) result.omittedFields = omitted;
  return result;
}
// Niveaux de journal (MIG-03.2.2) : `debug` pour les échanges protocolaires, `info` pour les événements,
// `warn` pour les refus et résultats inconnus, `error` pour les défaillances internes.
export const logLevels = ['debug', 'info', 'warn', 'error'];
export function levelOf(area, code) {
  if (area === 'protocol') return 'debug';
  if (code === 'request-failed') return 'error';
  return /fail|error|unconfirmed|unavailable|reject|denied|authorization|timeout|refus|offline|retry|interrupted|connection|access|tls|unknown/i.test(String(code)) ? 'warn' : 'info';
}
export function createMachineLogs({ directory, machines, now = Date.now, limit = 1024 * 1024, context = () => undefined, minLevel = 'debug' }) {
  const threshold = Math.max(0, logLevels.indexOf(minLevel));
  const path = join(directory, 'machine-logs');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const failed = new Set();
  const file = id => join(path, id + '.log');
  const known = id => /^[a-f0-9-]{36}$/.test(id ?? '') && machines().find(item => item.id === id);
  return {
    record(id, area, event, details = {}, level = levelOf(area, event)) {
      if (logLevels.indexOf(level) < threshold) return;
      const machine = known(id); if (!machine) return;
      try {
        const secrets = Object.entries(machine).filter(([key]) => secretName.test(key)).map(([, value]) => value).filter(value => typeof value === 'string');
        const requestId = context();
        const entry = { at: new Date(now()).toISOString(), level, ...(requestId ? { requestId } : {}), area, event, details: safeMachineDetails(details, secrets) };
        const text = JSON.stringify(entry);
        // Preserve valid JSON even for unexpectedly large native reports.
        const line = (Buffer.byteLength(text) <= 16384 ? text : JSON.stringify({ at: entry.at, level, area, event, details: { bytes: Buffer.byteLength(text), outcome: 'log-entry-too-large' } })) + '\n';
        try { if (statSync(file(id)).size >= limit) renameSync(file(id), file(id) + '.1'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        appendFileSync(file(id), line, { mode: 0o600 }); failed.delete(id);
      } catch { failed.add(id); /* Logging must never block a machine command. */ }
    },
    read(id) {
      if (!known(id)) throw new Error('missing');
      if (failed.has(id)) throw new Error('logs-unavailable');
      return ['.1', ''].map(suffix => { try { return readFileSync(file(id) + suffix, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; return ''; } }).join('');
    },
    forget(id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return;
      for (const suffix of ['', '.1']) { try { unlinkSync(file(id) + suffix); } catch (error) { if (error.code !== 'ENOENT') failed.add(id); } }
      failed.delete(id);
    }
  };
}

// Record operations for every connector. Network-native details can add lower-level traces.
export function instrumentConnector(connector, diagnostics) {
  const trace = (machine, event, details) => diagnostics?.trace?.(machine?.id, event, details);
  function wrap(target, key, operation) {
    const original = target?.[key]; if (typeof original !== 'function') return;
    target[key] = async function(machine, ...args) {
      const at = Date.now();
      let endpoint = {};
      try { const url = new URL(machine.origin); endpoint = { transport: url.protocol.replace(':', ''), host: url.hostname, port: url.port, mode: machine.mode ?? 'lan' }; } catch { /* No unvalidated origin is logged. */ }
      const request = operation === 'control.execute' ? { command: args[0] } : operation === 'command' ? { action: args[0] } : operation === 'gcode' ? { command: '[terminal command omitted]' } : {};
      trace(machine, 'operation-start', { operation, ...endpoint, ...request });
      try {
        const result = await original.call(this, machine, ...args);
        trace(machine, 'operation-result', { operation, elapsedMs: Date.now() - at,
          ...(Array.isArray(result) ? { count: result.length } : typeof result === 'boolean' ? { outcome: result ? 'accepted' : 'rejected' } : result) });
        return result;
      } catch (error) {
        trace(machine, 'operation-error', { operation, elapsedMs: Date.now() - at,
          code: /^[a-zA-Z0-9_-]{1,60}$/.test(error.message) ? error.message : 'operation-failed' });
        throw error;
      }
    };
  }
  for (const key of ['read', 'probe', 'command', 'gcode']) wrap(connector, key, key);
  for (const key of ['read', 'execute']) wrap(connector.control, key, 'control.' + key);
  for (const key of ['list', 'download', 'downloadOriginal', 'upload', 'start']) wrap(connector.files, key, 'files.' + key);
  return connector;
}
