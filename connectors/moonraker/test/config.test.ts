import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoonrakerConfig, configPath } from '../src/config.ts';
const machine = { origin: 'http://192.168.1.20:7125', apiKey: 'test-key' };
const ports: Parameters<typeof createMoonrakerConfig>[0] = {
  encodePath: path => path.split('/').map(encodeURIComponent).join('/'),
  validOrigin: origin => origin === machine.origin ? origin : null,
  readResponse: response => response.json(),
  multipart: (field, name, source, size, extra) => {
    assert.equal(field, 'file'); assert.equal(extra?.root, 'config'); assert.equal(extra?.print, undefined);
    async function* encoded() { const chunks = []; for await (const chunk of source) chunks.push(chunk); const bytes = Buffer.concat(chunks); assert.equal(bytes.length, size); yield Buffer.from(JSON.stringify({ name, extra, content: bytes.toString() })); }
    return { body: ReadableStream.from(encoded()), headers: { 'Content-Type': 'application/json' } };
  },
};
function fixture() {
  const files = new Map([['printer.cfg', '\uFEFF[printer]\nmax_velocity: 200\n']]); const calls: string[] = [];
  let state = 'standby', klippy = 'ready', backupFailed = false, failedWrite = false, conflict = false;
  const fetcher = async (url: string, options: RequestInit = {}) => {
    assert.equal(new Headers(options.headers).get('X-Api-Key'), 'test-key'); assert.equal(options.redirect, 'error'); calls.push(options.method + ' ' + new URL(url).pathname);
    if (url.endsWith('/printer/info')) return Response.json({ result: { state: klippy } });
    if (url.includes('/printer/objects/query')) return Response.json({ result: { status: { print_stats: { state }, virtual_sdcard: { is_active: state === 'printing' } } } });
    if (url.endsWith('/server/files/list?root=config')) return Response.json({ result: [...files.keys()].map(path => ({ path, permissions: 'rw' })).concat([{ path: '../outside.cfg', permissions: 'rw' }]) });
    if (url.includes('/server/files/config/')) { const path = decodeURIComponent(url.split('/server/files/config/')[1]!); return files.has(path) ? new Response(files.get(path)!) : new Response('', { status: 404 }); }
    if (url.endsWith('/server/files/upload')) {
      const body = await new Response(options.body).json() as { name: string; content: string; extra: { path?: string } }; const name = body.name;
      const directory = body.extra.path; const path = directory ? directory + '/' + name : name;
      if (path.startsWith('.fabcore-backups/') && backupFailed) return new Response('', { status: 403 });
      if (!path.startsWith('.fabcore-backups/') && failedWrite) { files.set(path, 'unknown'); throw new Error('response lost'); }
      const content = body.content;
      files.set(path, content); if (conflict && path.startsWith('.fabcore-backups/')) files.set('printer.cfg', '[changed externally]');
      return Response.json({ item: { path, root: 'config' } }, { status: 201 });
    }
    if (url.endsWith('/printer/restart') || url.endsWith('/printer/firmware_restart') || url.endsWith('/server/restart')) return Response.json({ result: 'ok' });
    throw new Error('unexpected ' + url);
  };
  return { files, calls, service: createMoonrakerConfig(ports, fetcher), state(value: string) { state = value; }, klippy(value: string) { klippy = value; }, failBackup() { backupFailed = true; }, failWrite() { failedWrite = true; }, conflict() { conflict = true; } };
}
test('Klipper configuration : paths, cfg + moonraker.conf listing and UTF-8 original preserved in backup before verified save', async () => {
  for (const path of ['../printer.cfg', '/printer.cfg', 'a//b.cfg', 'a/../printer.cfg', '.secret.cfg', 'printer.cfg%00', 'printer.cfg?x', 'other.conf', 'sub/moonraker.conf', 'a\\printer.cfg']) assert.equal(configPath(path), null);
  const h = fixture(); assert.deepEqual((await h.service.list(machine)).map(item => item.path), ['printer.cfg']);
  const original = await h.service.read(machine, 'printer.cfg'); assert.ok(original.content.startsWith('\uFEFF'));
  const saved = await h.service.save(machine, 'printer.cfg', '[printer]\nmax_velocity: 220\n', original.revision);
  assert.equal(saved.content, h.files.get('printer.cfg')); assert.equal(h.files.get(saved.backupPath!), original.content);
  assert.equal(h.calls.filter(value => value.startsWith('POST')).length, 2); assert.ok(!h.calls.some(value => /restart|gcode/.test(value)));
});
test('Klipper configuration : conflicts, occupied state, backup failure and emergency gate prevent original replacement', async () => {
  for (const mode of ['conflict', 'printing', 'paused', 'backup', 'emergency']) {
    const h = fixture(); const original = await h.service.read(machine, 'printer.cfg');
    if (mode === 'conflict') h.conflict(); if (['printing', 'paused'].includes(mode)) h.state(mode); if (mode === 'backup') h.failBackup();
    await assert.rejects(h.service.save(machine, 'printer.cfg', 'changed', original.revision, () => mode !== 'emergency'), /config-conflict|config-state|config-backup|command-busy/);
    assert.ok(!h.calls.some(value => /restart/.test(value))); assert.equal(h.files.get('printer.cfg'), mode === 'conflict' ? '[changed externally]' : original.content);
  }
});
test('Klipper configuration : new uploads require absent path, restart distinct and uncertain writes never replayed', async () => {
  const h = fixture(); const created = await h.service.save(machine, 'macros/custom.cfg', '[gcode_macro TEST]\ngcode: M105', null);
  assert.equal(created.backupPath, null); assert.equal(h.files.get('macros/custom.cfg'), created.content);
  await assert.rejects(h.service.save(machine, 'macros/custom.cfg', 'overwrite without revision', null), /config-conflict/);
  assert.deepEqual(await h.service.restart(machine), { outcome: 'accepted' }); assert.equal(h.calls.filter(value => value === 'POST /printer/restart').length, 1);
  const original = await h.service.read(machine, 'printer.cfg'); h.failWrite();
  await assert.rejects(h.service.save(machine, 'printer.cfg', 'new', original.revision), /config-save-unknown/);
  assert.equal(h.calls.filter(value => value === 'POST /server/files/upload').length, 3, 'create + backup + one uncertain replacement, no retry');
});

test('Klipper configuration : actual NUL bytes rejected, literal backslash-zero remains valid text', async () => {
  const h = fixture(); const nul = String.fromCharCode(0);
  h.files.set('printer.cfg', 'before' + nul + 'after');
  await assert.rejects(h.service.read(machine, 'printer.cfg'), /config-encoding/);
  await assert.rejects(h.service.save(machine, 'new.cfg', 'before' + nul + 'after', null), /config-invalid/);
  const literal = 'literal ' + String.fromCharCode(92) + '0'; h.files.set('printer.cfg', literal);
  const opened = await h.service.read(machine, 'printer.cfg'); assert.equal(opened.content, literal);
  assert.equal((await h.service.save(machine, 'printer.cfg', literal, opened.revision)).content, literal);
});

test('Klipper : FIRMWARE_RESTART uniquement après arrêt d’urgence ou erreur, envoyé une seule fois', async () => {
  for (const blocked of ['ready', 'startup']) {
    const h = fixture(); h.klippy(blocked);
    await assert.rejects(h.service.firmwareRestart(machine), /config-state/);
    assert.ok(!h.calls.some(value => value.startsWith('POST')), blocked);
  }
  for (const state of ['shutdown', 'error']) {
    const h = fixture(); h.klippy(state);
    assert.deepEqual(await h.service.firmwareRestart(machine), { outcome: 'accepted' });
    assert.deepEqual(h.calls.filter(value => value.startsWith('POST')), ['POST /printer/firmware_restart']);
  }
  const busy = fixture(); busy.klippy('shutdown');
  await assert.rejects(busy.service.firmwareRestart(machine, () => false), /command-busy/);
  assert.ok(!busy.calls.some(value => value.startsWith('POST')));
});

test('moonraker.conf : seul fichier .conf accepté, à la racine ; redémarrage Moonraker unique et refusé en impression', async () => {
  assert.equal(configPath('moonraker.conf'), 'moonraker.conf');
  for (const path of ['sub/moonraker.conf', 'other.conf', '../moonraker.conf', 'moonraker.conf.bak', 'Moonraker.conf']) assert.equal(configPath(path), null, path);
  const h = fixture(); h.files.set('moonraker.conf', '[authorization]\ntrusted_clients:\n    192.168.1.0/24\n');
  const original = await h.service.read(machine, 'moonraker.conf');
  const saved = await h.service.save(machine, 'moonraker.conf', original.content + '    192.168.1.20\n', original.revision);
  assert.match(h.files.get('moonraker.conf')!, /192\.168\.1\.20/); assert.match(saved.backupPath!, /moonraker\.conf\.bak$/);
  assert.deepEqual(await h.service.restartMoonraker(machine), { outcome: 'accepted' });
  assert.equal(h.calls.filter(value => value === 'POST /server/restart').length, 1);
  const printing = fixture(); printing.state('printing');
  await assert.rejects(printing.service.restartMoonraker(machine), /config-state/);
  assert.ok(!printing.calls.some(value => value === 'POST /server/restart'));
});
