import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdtemp, readFile, readdir, rm, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { connectAsync } from 'mqtt';
import { certificate, LabError, nodeCryptoProvider } from '../../src/lab/crypto.ts';
import { BambuCertificateManager } from '../../src/lab/certificates.ts';
import { BambuAuthorizationManager, signSynthetic, syntheticMessage } from '../../src/lab/authorization.ts';
import { startBambuSimulator, requestTopic, responseTopic } from '../../src/lab/simulator.ts';
import { BambuDiagnostics } from '../../src/lab/diagnostics.ts';

const failure = (code: string) => (error: unknown) => error instanceof LabError && error.code === code;
test('BBL-CRYPTO : primitives RSA-PSS/SHA256, message modifié, signature et mauvaise clé', async () => {
  const a = await nodeCryptoProvider.generate(2048), b = await nodeCryptoProvider.generate(2048), payload = Buffer.from('synthetic only');
  const signature = nodeCryptoProvider.sign(payload, a.privateKey);
  assert.equal(nodeCryptoProvider.verify(payload, signature, a.publicKey), true);
  assert.equal(nodeCryptoProvider.verify(Buffer.from('tampered'), signature, a.publicKey), false);
  assert.equal(nodeCryptoProvider.verify(payload, signature, b.publicKey), false);
  assert.equal(nodeCryptoProvider.verify(payload, Buffer.alloc(signature.length), a.publicKey), false);
  assert.equal(nodeCryptoProvider.fingerprint(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(nodeCryptoProvider.generate(1024), failure('weak-key'));
});

test('BBL-CRYPTO : cycle identité, confiance, import, révocation, rotation et MQTT réellement local', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-crypto-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = Date.now();
  const diagnostics = new BambuDiagnostics();
  const manager = await BambuCertificateManager.open(join(directory, 'installation-a'), { bits: 2048, now: () => now, diagnostics });
  const other = await BambuCertificateManager.open(join(directory, 'installation-b'), { bits: 2048 });
  const root = await manager.authority(), otherRoot = await other.authority();
  const identity = await manager.createIdentity(), unapproved = await manager.createIdentity();
  now = Date.now();
  const policy = new BambuAuthorizationManager(manager, [root], () => now);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value));

  await t.test('stockage chiffré, fichiers 0600, dossiers 0700, installations isolées', async () => {
    const walk = async (path: string) => {
      const stat = await lstat(path); assert.equal(stat.mode & 0o077, 0, path);
      if (stat.isDirectory()) for (const child of await readdir(path)) await walk(join(path, child));
    };
    await walk(manager.directory);
    assert.match(await readFile(join(manager.directory, identity.id, 'key.pem'), 'utf8'), /^-----BEGIN ENCRYPTED PRIVATE KEY-----/);
    assert.notEqual(root, otherRoot);
    const keyPath = join(manager.directory, identity.id, 'key.pem');
    await chmod(keyPath, 0o644);
    try { await assert.rejects(manager.sign(identity.id, Buffer.from('test')), failure('storage')); } finally { await chmod(keyPath, 0o600); }
    const alias = join(directory, 'hard-link'); await link(keyPath, alias);
    try { await assert.rejects(manager.sign(identity.id, Buffer.from('test')), failure('storage')); } finally { await unlink(alias); }
    assert.equal(certificate(root).ca, true); assert.equal(certificate(identity.certificate).ca, false);
    await assert.rejects(manager.identity('../authority'), failure('invalid-input'));
    await assert.rejects(manager.validate(identity.certificate, []), failure('untrusted'));
    await assert.rejects(manager.validate(identity.certificate, [otherRoot]), failure('untrusted'));
    const brokenRoot = Buffer.from(certificate(root).raw); brokenRoot[brokenRoot.length - 1] = brokenRoot[brokenRoot.length - 1]! ^ 1;
    const badSignature = '-----BEGIN CERTIFICATE-----\n' + brokenRoot.toString('base64').match(/.{1,64}/g)!.join('\n') + '\n-----END CERTIFICATE-----\n';
    await assert.rejects(manager.validate(identity.certificate, [badSignature]), failure('untrusted'));
    await assert.rejects(manager.validate(root, [root]), failure('untrusted'));
    const linked = join(directory, 'symlink'); await symlink(manager.directory, linked);
    await assert.rejects(BambuCertificateManager.open(linked), failure('storage'));
    const insecure = join(directory, 'insecure'); const bad = await mkdtemp(insecure); await chmod(bad, 0o755);
    await assert.rejects(BambuCertificateManager.open(bad), failure('storage'));
  });
  await t.test('dates, chaîne et approbation explicite avant signature applicative', async () => {
    await manager.validate(identity.certificate, [root]);
    const signed = await signSynthetic(manager, identity, syntheticMessage(now));
    assert.deepEqual(await policy.handle(encode(signed)), { ok: false, reason: 'not-approved' });
    await policy.approve(identity.certificate);
    assert.deepEqual(await policy.handle(encode(signed)), { ok: true, temperature: 21, synthetic: true });
    assert.deepEqual(await policy.handle(encode(signed)), { ok: false, reason: 'replay' });
    const fresh = await signSynthetic(manager, identity, syntheticMessage(now));
    assert.deepEqual(await Promise.all([policy.handle(encode(fresh)), policy.handle(encode(fresh))]).then(results => results.map(r => r.ok).sort()), [false, true]);
    assert.equal((await policy.capabilities({ mqttAuthenticated: true, target: 'bambu' })).applicationAuthorized, false);
    assert.equal((await policy.capabilities({ mqttAuthenticated: true, target: 'bambu' })).physicalCommands, false);
    assert.equal(policy.classifyResponse({ result: 'failed', reason: 'mqtt message verify failed' }), 'application-authorization-denied');
    assert.equal(policy.classifyResponse({ result: 'success' }), 'unknown');
    now += 31 * 86400000;
    await assert.rejects(manager.validate(identity.certificate, [root]), failure('expired'));
    await assert.rejects(manager.sign(identity.id, Buffer.from('test')), failure('expired'));
    now -= 32 * 86400000;
    await assert.rejects(manager.validate(identity.certificate, [root]), failure('expired'));
    now += 86400000;
  });
  await t.test('import de clé appartenant au demandeur : confiance explicite et correspondance', async () => {
    const privateKey = await readFile(join(manager.directory, identity.id, 'key.pem'), 'utf8');
    const pass = await readFile(join(manager.directory, identity.id, 'passphrase'));
    try {
      await assert.rejects(other.importIdentity({ certificate: identity.certificate, privateKey, passphrase: pass.subarray(0, -1), roots: [otherRoot] }), failure('untrusted'));
      await assert.rejects(manager.importIdentity({ certificate: unapproved.certificate, privateKey, passphrase: pass.subarray(0, -1), roots: [root] }), failure('key-mismatch'));
      const imported = await other.importIdentity({ certificate: identity.certificate, privateKey, passphrase: pass.subarray(0, -1), roots: [root] });
      assert.equal(imported.origin, 'imported'); assert.equal(imported.fingerprint, identity.fingerprint);
      const data = Buffer.from('import test'), signature = await other.sign(imported.id, data);
      assert.equal(nodeCryptoProvider.verify(data, signature, certificate(identity.certificate).publicKey), true);
      await assert.rejects(other.rotate(imported.id), failure('interface-unqualified'));
    } finally { pass.fill(0); }
  });
  await t.test('rejets : message modifié, mauvaise clé, audience, ancien message, payload invalide', async () => {
    const signed = await signSynthetic(manager, identity, syntheticMessage(now));
    assert.deepEqual(await policy.handle(encode({ ...signed, message: { ...signed.message, expiresAt: now + 29999 } })), { ok: false, reason: 'bad-signature' });
    assert.deepEqual(await policy.handle(encode({ ...signed, signature: Buffer.alloc(256).toString('base64') })), { ok: false, reason: 'bad-signature' });
    assert.deepEqual(await policy.handle(encode({ ...signed, certificate: unapproved.certificate })), { ok: false, reason: 'not-approved' });
    assert.deepEqual(await policy.handle(encode({ ...signed, message: { ...signed.message, audience: 'P2S' } })), { ok: false, reason: 'invalid-input' });
    assert.deepEqual(await policy.handle(encode({ ...signed, extra: 'ignored?' })), { ok: false, reason: 'invalid-input' });
    assert.deepEqual(await policy.handle(Buffer.alloc(128 * 1024 + 1)), { ok: false, reason: 'invalid-input' });
    now += 31000; assert.deepEqual(await policy.handle(encode(signed)), { ok: false, reason: 'expired' }); now -= 31000;
  });
  await t.test('retirer une approbation pendant une lecture asynchrone interdit la requête en vol', async st => {
    const original = manager.revoked.bind(manager);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const signed = await signSynthetic(manager, identity, syntheticMessage(now));
    st.mock.method(manager, 'revoked', async (id: string) => { enter(); await gate; return original(id); });
    const pending = policy.handle(encode(signed)); await entered;
    policy.removeApproval(identity.certificate); release();
    assert.deepEqual(await pending, { ok: false, reason: 'not-approved' });
    await policy.approve(identity.certificate);
  });
  await t.test('révoquer une CA après validation asynchrone interdit aussi la requête en vol', async st => {
    const temporary = await BambuCertificateManager.open(join(directory, 'race-installation'), { bits: 2048 });
    const leaf = await temporary.createIdentity(), ca = await temporary.authority();
    const authorization = new BambuAuthorizationManager(temporary, [ca]); await authorization.approve(leaf.certificate);
    const signed = await signSynthetic(temporary, leaf), original = temporary.validate.bind(temporary);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    st.mock.method(temporary, 'validate', async (...args: Parameters<BambuCertificateManager['validate']>) => { const result = await original(...args); enter(); await gate; return result; });
    const pending = authorization.handle(encode(signed)); await entered;
    await temporary.revoke(ca); release();
    assert.deepEqual(await pending, { ok: false, reason: 'revoked' });
  });
  await t.test('MQTT malformé, trop grand ou sans CONNECT : fermeture sans autorisation', async () => {
    const simulator = await startBambuSimulator(policy);
    try {
      for (const payload of [Buffer.from([0x10, 0x80, 0x80, 0x80, 0x80]), Buffer.from([0x10, 0xff, 0xff, 0x7f]), Buffer.from([0x30, 0])]) {
        await new Promise<void>((resolve, reject) => {
          const socket = connect({ host: '127.0.0.1', port: Number(new URL(simulator.url).port) });
          const timer = setTimeout(() => { socket.destroy(); reject(new Error('lab-parser-timeout')); }, 1000);
          socket.once('connect', () => socket.write(payload)); socket.on('error', () => {});
          socket.once('close', () => { clearTimeout(timer); resolve(); });
        });
      }
    } finally { await simulator.close(); }
  });
  await t.test('MQTT 3.1.1 loopback : refus, approbation, révocation persistée et rotation', async () => {
    now = Date.now();
    const simulator = await startBambuSimulator(policy); t.after(() => simulator.close());
    assert.match(simulator.url, /^mqtt:\/\/127\.0\.0\.1:\d+$/);
    const client = await connectAsync(simulator.url, { protocolVersion: 4, clientId: 'fabcore_lab_test', reconnectPeriod: 0, connectTimeout: 3000, keepalive: 0 });
    t.after(() => client.endAsync(true)); await client.subscribeAsync(responseTopic, { qos: 0 });
    const exchange = async (message: unknown) => {
      const response = new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => { client.off('message', receive); reject(new Error('lab-timeout')); }, 3000);
        const receive = (_topic: string, payload: Buffer) => { clearTimeout(timeout); client.off('message', receive); resolve(JSON.parse(payload.toString()) as unknown); };
        client.on('message', receive);
      });
      await client.publishAsync(requestTopic, encode(message), { qos: 0 }); return response;
    };
    const beforeApproval = await signSynthetic(manager, unapproved, syntheticMessage(now));
    assert.deepEqual(await exchange(beforeApproval), { ok: false, reason: 'not-approved' });
    await policy.approve(unapproved.certificate);
    assert.deepEqual(await exchange(beforeApproval), { ok: true, synthetic: true, temperature: 21 });
    const beforeRevocation = await signSynthetic(manager, unapproved, syntheticMessage(now));
    await manager.revoke(unapproved.certificate);
    assert.deepEqual(await exchange(beforeRevocation), { ok: false, reason: 'revoked' });
    await assert.rejects(manager.sign(unapproved.id, Buffer.from('test')), failure('revoked'));
    const reopened = await BambuCertificateManager.open(manager.directory, { bits: 2048 });
    await assert.rejects(reopened.validate(unapproved.certificate, [root]), failure('revoked'));
    const old = await signSynthetic(manager, identity, syntheticMessage(now));
    const rotated = await manager.rotate(identity.id); assert.notEqual(rotated.fingerprint, identity.fingerprint);
    now = Date.now();
    assert.deepEqual(await exchange(old), { ok: false, reason: 'revoked' });
    const next = await signSynthetic(manager, rotated, syntheticMessage(now));
    assert.deepEqual(await exchange(next), { ok: false, reason: 'not-approved' });
    await policy.approve(rotated.certificate); assert.deepEqual(await exchange(next), { ok: true, synthetic: true, temperature: 21 });
    policy.removeApproval(rotated.certificate);
    assert.deepEqual(await exchange(await signSynthetic(manager, rotated, syntheticMessage(now))), { ok: false, reason: 'not-approved' });
    await manager.remove(rotated.id);
    await assert.rejects(readFile(join(manager.directory, rotated.id, 'key.pem')), { code: 'ENOENT' });
    assert.equal(await manager.revoked(rotated.fingerprint), true);
    const last = await manager.createIdentity(); now = Date.now();
    await policy.approve(last.certificate); const lastMessage = await signSynthetic(manager, last, syntheticMessage(now));
    const revoking = manager.revoke(root);
    assert.equal(await manager.revoked(nodeCryptoProvider.fingerprint(certificate(root).raw)), true, 'effective before persistence completes');
    assert.deepEqual(await policy.handle(encode(lastMessage)), { ok: false, reason: 'revoked' }); await revoking;
    await assert.rejects(manager.validate(last.certificate, [root]), failure('revoked'));
    assert.equal((await policy.capabilities({ mqttAuthenticated: true, target: 'simulator' })).applicationAuthorized, false);
    await client.endAsync(true); await simulator.close();
  });
  await t.test('rapport anonymisé : jamais de clé, payload arbitraire, code LAN ni token', () => {
    const secret = 'SECRET_LAN_TOKEN_PRIVATE';
    diagnostics.record({ event: 'simulation', ok: false, elapsedMs: Infinity, ...{ password: secret, token: secret, privateKey: secret, reason: 'not-a-code' } } as unknown as Parameters<BambuDiagnostics['record']>[0], secret);
    const report = JSON.stringify(diagnostics.report());
    assert.doesNotMatch(report, /PRIVATE KEY|SECRET_LAN_TOKEN_PRIVATE|installation-a|BEGIN CERTIFICATE|not-a-code/);
    assert.match(report, /"printerAuthorization":"unqualified"/);
    for (let i = 0; i < 300; i++) diagnostics.record({ event: 'simulation', ok: true });
    assert.equal(diagnostics.report().events.length, 256);
  });
});
