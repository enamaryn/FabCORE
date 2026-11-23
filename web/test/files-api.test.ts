import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/api.ts';
const code = (expected: string) => (error: unknown) => error instanceof ApiError && error.code === expected;
test('API fichiers : liste bornée et données inconnues, chemins malformés refusés', async () => {
  const api = createApi(async url => { assert.equal(url, '/api/machines/one/files'); return Response.json({ files: [{ path: 'usb/cube.gcode', size: null, modified: 'fake' }], truncated: true }); });
  assert.deepEqual(await api.files('one'), { files: [{ path: 'usb/cube.gcode', size: null, modified: null }], truncated: true });
  for (const files of [[{ path: '../cube.gcode' }], Array.from({ length: 301 }, () => ({ path: 'a.gcode' }))]) await assert.rejects(createApi(async () => Response.json({ files })).files('one'), code('files-unavailable'));
});
test('API fichiers : transfert puis lancement sont des appels distincts, réponses ambiguës sans rejeu', async () => {
  const calls: { url: unknown; body: unknown }[] = [];
  const api = createApi(async (url, options) => { calls.push({ url, body: JSON.parse(String(options?.body)) }); return Response.json(String(url).endsWith('/transfer') ? { path: 'actual/part.gcode', destination: 'two' } : { status: 'printing' }, { status: 201 }); });
  const copy = await api.transfer('one', 'usb/part.gcode', 'two', 'renamed.gcode'); assert.equal(calls.length, 1); assert.equal(copy.path, 'actual/part.gcode');
  assert.deepEqual(calls[0]?.body, { path: 'usb/part.gcode', destination: 'two', name: 'renamed.gcode', confirm: true });
  await api.print('two', copy.path, { filamentMode: 'external' }); assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.body, { path: 'actual/part.gcode', confirm: true, filamentMode: 'external' });
  let attempts = 0; const unknown = createApi(async () => { attempts++; return Response.json({}); });
  await assert.rejects(unknown.transfer('one', 'a.gcode', 'two', 'a.gcode'), code('upload-unknown'));
  await assert.rejects(unknown.print('two', 'a.gcode', {}), code('command-unconfirmed')); assert.equal(attempts, 2);
});
class Xhr {
  upload: { onprogress: ((event: { lengthComputable: boolean; total: number; loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  timeout = 0; status = 0; responseText = ''; sent: Blob | undefined; url = ''; headers: Record<string, string> = {}; attempts = 0;
  open(method: string, url: string) { assert.equal(method, 'POST'); this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(blob: Blob) { this.sent = blob; this.attempts++; }
  abort() { this.onabort?.(); }
  finish(status: number, payload: unknown) { this.status = status; this.responseText = JSON.stringify(payload); this.onload?.(); }
}
function setup() { const xhr = new Xhr(); let revoked = 0; const api = createApi(async () => assert.fail('XHR upload must not use fetch'), () => revoked++, () => xhr as unknown as XMLHttpRequest); return { xhr, api, revoked: () => revoked }; }
test('Envoi : progrès réseau ne confirme pas stockage, original Blob transmis, chemin réel seulement après 201', async () => {
  const { xhr, api } = setup(); const progress: number[] = []; const file = new File(['G1 X1'], 'part.gcode'); let settled = false;
  const pending = api.upload('one', file, n => progress.push(n)).then(value => { settled = true; return value; });
  assert.equal(xhr.sent, file); assert.equal(xhr.headers['Content-Type'], 'application/octet-stream'); assert.equal(xhr.url, '/api/machines/one/files?name=part.gcode');
  xhr.upload.onprogress?.({ lengthComputable: true, total: 5, loaded: 5 }); await Promise.resolve(); assert.equal(settled, false); assert.deepEqual(progress, [100]);
  xhr.finish(201, { path: 'storage/part.gcode' }); assert.deepEqual(await pending, { path: 'storage/part.gcode' }); assert.equal(xhr.attempts, 1); assert.equal(xhr.upload.onprogress, null);
});
test('Envoi : interruption, expiration, quota et succès malformé restent explicites, sans renvoi', async () => {
  const file = new File(['M5'], 'a.gcode');
  for (const kind of ['abort', 'timeout', 'malformed', 'forbidden', 'expired', 'proxy']) {
    const { xhr, api, revoked } = setup(); const controller = new AbortController(); const pending = api.upload('one', file, () => {}, controller.signal);
    if (kind === 'abort') controller.abort(); else if (kind === 'timeout') xhr.ontimeout?.(); else xhr.finish(kind === 'malformed' ? 201 : kind === 'expired' ? 401 : kind === 'proxy' ? 413 : 403, kind === 'forbidden' ? { error: 'forbidden' } : {});
    await assert.rejects(pending, code(kind === 'forbidden' ? 'forbidden' : kind === 'proxy' ? 'upload-proxy-limit' : 'upload-unknown')); assert.equal(xhr.attempts, 1); assert.equal(revoked(), kind === 'expired' ? 1 : 0);
  }
  const { xhr, api } = setup(); const controller = new AbortController(); controller.abort(); await assert.rejects(api.upload('one', file, () => {}, controller.signal)); assert.equal(xhr.attempts, 0);
});
