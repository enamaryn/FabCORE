import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMoonrakerFiles, readMoonraker } from './moonraker.mjs';

const machine = { origin: 'http://192.168.1.176:7125', apiKey: 'stream-test-key' };

test('Moonraker migré : multipart réellement diffusé, erreurs de taille propagées sans rejeu', async () => {
  let yielded = 0, calls = 0;
  async function* source() { for (let i = 0; i < 16; i++) { yielded++; yield Buffer.from('G\n'); } }
  const files = createMoonrakerFiles(async (url, options) => {
    calls++; assert.equal(url, machine.origin + '/server/files/upload');
    const reader = options.body.getReader(), chunks = [];
    const first = await reader.read(); chunks.push(first.value);
    assert.ok(yielded < 16, 'la source entière ne doit pas être mise en mémoire avant lecture du corps');
    while (true) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); }
    const body = Buffer.concat(chunks).toString();
    assert.ok(body.includes('G\n'.repeat(16))); assert.ok(body.includes('name="root"\r\n\r\ngcodes'));
    return Response.json({ result: { item: { path: 'stored.gcode' } } });
  });
  assert.equal(await files.upload(machine, 'upload.gcode', source(), 32), 'stored.gcode');
  assert.equal(calls, 1); assert.equal(yielded, 16);
  const failing = createMoonrakerFiles(async (_url, options) => {
    calls++;
    for await (const _chunk of options.body) { /* consommation du vrai multipart */ }
    assert.fail('un corps invalide ne doit pas être accepté');
  });
  async function* short() { yield Buffer.from('G\n'); }
  const before = calls;
  await assert.rejects(failing.upload(machine, 'short.gcode', short(), 4), /upload truncated/);
  await assert.rejects(failing.upload(machine, 'large.gcode', short(), 1), /upload larger than announced/);
  assert.equal(calls, before + 2, 'un seul envoi par tentative, aucun rejeu');
});

test('Moonraker migré : le décodeur partagé garde sa limite JSON de 64 Kio', async () => {
  const result = await readMoonraker(machine, async () => Response.json({ padding: 'x'.repeat(65536) }));
  assert.equal(result.status, 'error'); assert.equal(result.issue, 'moonraker');
});
