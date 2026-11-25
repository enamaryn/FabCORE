import test from 'node:test';
import assert from 'node:assert/strict';
import { bambuCameraConfig, bambuCameraInfo, privateCameraHost } from './camera.ts';
test('Caméra : source séparée de la connexion, automatique par défaut, anciens choix normalisés sans vidéo distante inventée', () => {
  assert.equal(bambuCameraInfo(undefined, true).available, true);
  assert.equal(bambuCameraInfo({ mode: 'auto', host: '192.168.1.20' }, false).available, false);
  assert.deepEqual(bambuCameraInfo({ mode: 'auto', host: '192.168.1.20' }, true), { mode: 'auto', host: '192.168.1.20', experimental: true, available: true, source: 'lan', transport: 'rtsps', issue: null });
  assert.equal(bambuCameraInfo({ mode: 'cloud', host: '192.168.1.20' }, true).mode, 'auto');
  assert.equal(bambuCameraInfo({ mode: 'auto' }, true).issue, null);
  assert.deepEqual(bambuCameraConfig({ mode: 'disabled', password: 'discard' }), { mode: 'disabled', host: '' });
});
test('Caméra : IPv4 RFC1918 explicite, jamais hostname, URL, port, lien local ou notation ambiguë', () => {
  for (const host of ['10.2.3.4', '172.16.0.3', '172.31.2.3', '192.168.1.196']) assert.equal(privateCameraHost(host), true);
  for (const host of ['127.0.0.1', '169.254.169.254', '172.32.0.1', '8.8.8.8', '192.168.1.256', '192.168.01.3', 'localhost', 'http://192.168.1.2', '192.168.1.2:322', '0xc0a80101', '::1']) assert.equal(bambuCameraConfig({ mode: 'lan', host }), null, host);
  assert.equal(bambuCameraConfig({ mode: 'invented', host: '' }), null);
  assert.equal(bambuCameraConfig({ mode: { toString: 'invalid' } }), null);
});
