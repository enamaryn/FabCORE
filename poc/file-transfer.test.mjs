import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { transferMachineFile } from './file-transfer.mjs';

test('transfert : octets originaux sans longueur annoncée, taille exacte et nettoyage', async () => {
  const original = Buffer.from([0x50, 0x4b, 0, 255, 12]);
  let temporary;
  const source = { machine: {}, files: {
    download: () => { throw new Error('ne pas envoyer le G-code extrait du 3MF'); },
    downloadOriginal: async () => new Response(original)
  } };
  const destination = { machine: {}, files: { async upload(_machine, name, stream, size) {
    temporary = stream.path;
    assert.equal(name, 'copy.3mf'); assert.equal(size, original.length);
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), original);
    return 'usb/copy.3mf';
  } } };
  assert.equal(await transferMachineFile(source, destination, 'cache/original.3mf', 'copy.3mf'), 'usb/copy.3mf');
  await assert.rejects(stat(temporary), { code: 'ENOENT' });
});

test('transfert : limites, fichier tronqué, interruption et refus sans relance', async () => {
  let uploads = 0;
  const destination = { machine: {}, files: { async upload(_machine, _name, stream) {
    uploads++; for await (const _chunk of stream) {} return null;
  } } };
  const source = response => ({ machine: {}, files: { download: async () => response } });
  await assert.rejects(transferMachineFile(source(new Response('12345')), destination, 'a.gcode', 'b.gcode', undefined, 4), /file-too-large/);
  await assert.rejects(transferMachineFile(source(new Response('1', { headers: { 'Content-Length': '5' } })), destination, 'a.gcode', 'b.gcode'), /file-truncated/);
  await assert.rejects(transferMachineFile(source(new Response('1')), destination, 'a.gcode', 'b.gcode', AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(uploads, 0);
  await assert.rejects(transferMachineFile(source(new Response('1')), destination, 'a.gcode', 'b.gcode'), /upload-rejected/);
  assert.equal(uploads, 1);
});
