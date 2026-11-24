#!/usr/bin/env node
// Local synthetic demonstration only. No Cloud account, LAN code or printer address accepted.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectAsync } from 'mqtt';
import { BambuCertificateManager } from '../connectors/bambu/src/lab/certificates.ts';
import { BambuAuthorizationManager, signSynthetic } from '../connectors/bambu/src/lab/authorization.ts';
import { startBambuSimulator, requestTopic, responseTopic } from '../connectors/bambu/src/lab/simulator.ts';

if (process.argv.length !== 2) throw new Error('This lab accepts no printer or credential arguments.');
const directory = await mkdtemp(join(tmpdir(), 'fabcore-crypto-demo-'));
let simulator, client;
const started = performance.now();
try {
  const certificates = await BambuCertificateManager.open(directory);
  const identity = await certificates.createIdentity();
  const authorization = new BambuAuthorizationManager(certificates, [await certificates.authority()]);
  simulator = await startBambuSimulator(authorization);
  client = await connectAsync(simulator.url, { protocolVersion: 4, clientId: 'fabcore_lab_demo', reconnectPeriod: 0, keepalive: 0, connectTimeout: 3000 });
  await client.subscribeAsync(responseTopic, { qos: 0 });
  const exchange = async envelope => {
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { client.off('message', receive); reject(new Error('lab-timeout')); }, 3000);
      const receive = (_topic, payload) => { clearTimeout(timeout); client.off('message', receive); resolve(JSON.parse(payload.toString())); };
      client.on('message', receive);
    });
    await client.publishAsync(requestTopic, JSON.stringify(envelope), { qos: 0 }); return response;
  };
  const signed = await signSynthetic(certificates, identity);
  assert.deepEqual(await exchange(signed), { ok: false, reason: 'not-approved' });
  await authorization.approve(identity.certificate);
  assert.deepEqual(await exchange(signed), { ok: true, temperature: 21, synthetic: true });
  assert.deepEqual(await exchange(signed), { ok: false, reason: 'replay' });
  const stale = await signSynthetic(certificates, identity);
  const rotated = await certificates.rotate(identity.id);
  assert.deepEqual(await exchange(stale), { ok: false, reason: 'revoked' });
  await authorization.approve(rotated.certificate);
  assert.deepEqual(await exchange(await signSynthetic(certificates, rotated)), { ok: true, temperature: 21, synthetic: true });
  await certificates.remove(rotated.id);
  console.log(JSON.stringify({ lab: 'BBL-CRYPTO-01', runtime: process.version, protocol: 'MQTT 3.1.1 loopback', elapsedMs: Math.round(performance.now() - started),
    checks: ['unapproved-rejected', 'approved-accepted', 'replay-rejected', 'revoked-rejected', 'rotated-approved-accepted', 'encrypted-key-deleted'],
    physicalCommands: 0, printerAuthorization: 'unqualified', diagnostic: certificates.diagnostics.report() }, null, 2));
} catch {
  console.error(JSON.stringify({ lab: 'BBL-CRYPTO-01', ok: false, reason: 'lab-failed', printerAuthorization: 'unqualified' })); process.exitCode = 1;
} finally {
  await client?.endAsync(true); await simulator?.close(); await rm(directory, { recursive: true, force: true });
}
