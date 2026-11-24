import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('isolation des tests : TCP, UDP, HTTP, TLS et fetch refusés avant sortie réseau, même avec proxy', async () => {
  const preload = new URL('./test-network-isolation.mjs', import.meta.url).pathname;
  for (const source of [
    "import net from 'node:net'; net.connect({host:'outside.invalid',port:1})",
    "import tls from 'node:tls'; tls.connect({host:'outside.invalid',port:1})",
    "import http from 'node:http'; http.request('http://outside.invalid/')",
    "import https from 'node:https'; https.get('https://outside.invalid/')",
    "await fetch('https://outside.invalid/')",
    "import dgram from 'node:dgram'; dgram.createSocket('udp4').send('data',1,'outside.invalid')",
  ]) {
    await assert.rejects(promisify(execFile)(process.execPath, ['--import', preload, '--input-type=module', '-e', source], { timeout: 3000 }), error => {
      assert.equal(error.code, 1); assert.match(error.stderr, /TEST_NETWORK_BLOCKED/); return true;
    });
  }
});
