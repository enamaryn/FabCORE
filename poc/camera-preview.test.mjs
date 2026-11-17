import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { cameraPreview } from './camera-preview.mjs';

test('un aperçu extrait une seule image fragmentée puis ferme son abonnement', async () => {
  const response = new PassThrough();
  response.writeHead = (code, headers) => {
    assert.equal(code, 200);
    assert.equal(headers['Content-Type'], 'image/jpeg');
  };
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  const preview = cameraPreview(response);
  const closed = once(preview, 'close');
  preview.write(Buffer.from([1, 2, 0xff]));
  preview.write(Buffer.from([0xd8, 3, 4, 0xff]));
  preview.write(Buffer.from([0xd9, 5, 6]));
  await closed;
  assert.deepEqual(Buffer.concat(chunks), Buffer.from([0xff, 0xd8, 3, 4, 0xff, 0xd9]));
});
