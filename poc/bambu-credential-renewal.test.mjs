import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBambuCredentialRenewal } from './bambu-credential-renewal.mjs';
import { credentialDates } from './bambu-credential-dates.mjs';
import { fetchFreshCredentials } from './bambu-credential-refresh.mjs';

const day = 86400000;
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-renewal-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-11-25T12:00:00Z'), count = 0, fail = false, wait;
  const info = { configured: true, refreshConfigured: true, updatedAt: new Date(clock - day).toISOString(),
    crlExpiresAt: new Date(clock + day).toISOString(), certificateExpiresAt: new Date(clock + 100 * day).toISOString() };
  const vault = { status: () => ({ ...info }), async refresh(_fetch, signal) { count++; if (wait) await wait;
    if (signal.aborted) throw new Error('aborted'); if (fail) throw new Error('SECRET-URL-AND-TOKEN');
    info.updatedAt = new Date(clock).toISOString(); info.crlExpiresAt = new Date(clock + 30 * day).toISOString(); return { ...info }; } };
  const alerts = [];
  const options = { vault, directory, now: () => clock, notify: async kind => { alerts.push(kind); return true; } };
  const renewal = createBambuCredentialRenewal(options); t.after(() => renewal.close());
  return { directory, renewal, options, info, alerts, count: () => count, advance(ms) { clock += ms; }, fail(value) { fail = value; }, wait(value) { wait = value; } };
}

test('Renouvellement : échéance anticipée, succès persistant et appels concurrents dédupliqués', async t => {
  const h = setup(t); let release; h.wait(new Promise(resolve => { release = resolve; }));
  const one = h.renewal.run(), two = h.renewal.run({ force: true });
  assert.equal(one, two); assert.equal(h.count(), 1); assert.equal(h.renewal.status().state, 'refreshing');
  release(); const result = await one;
  assert.equal(result.state, 'scheduled'); assert.equal(result.failureCount, 0); assert.ok(result.lastSuccessAt);
  assert.ok(Date.parse(result.nextAttemptAt) > Date.parse(result.lastSuccessAt));
  await h.renewal.run(); assert.equal(h.count(), 1, 'pas de rafale après un succès');
  const restarted = createBambuCredentialRenewal(h.options); t.after(() => restarted.close());
  assert.equal(restarted.status().lastSuccessAt, result.lastSuccessAt);
});

test('Renouvellement : échec conserve le coffre, retente avec délai et notifie au plus une fois par jour', async t => {
  const h = setup(t); h.fail(true); const original = { ...h.info };
  let result = await h.renewal.run(); assert.equal(result.state, 'failed'); assert.equal(result.lastError, 'bambu-cert-refresh-failed');
  assert.deepEqual(h.info, original); assert.deepEqual(h.alerts, ['failed']);
  await h.renewal.run(); assert.equal(h.count(), 1);
  await h.renewal.run({ force: true }); assert.equal(h.count(), 2); assert.equal(h.alerts.length, 1);
  assert.doesNotMatch(readFileSync(join(h.directory, 'bambu-application-credentials/renewal.json'), 'utf8'), /SECRET|URL|TOKEN/);
  h.advance(3 * 3600000); h.fail(false); result = await h.renewal.run();
  assert.equal(result.state, 'scheduled'); assert.equal(result.lastError, null);
});

test('Renouvellement : pas d’URL, import concurrent et arrêt ne lancent aucun renouvellement parasite', async t => {
  const h = setup(t); h.info.refreshConfigured = false;
  assert.equal((await h.renewal.run()).state, 'manual'); assert.equal(h.count(), 0);
  await assert.rejects(h.renewal.run({ force: true }), /bambu-cert-no-refresh-url/);
  assert.deepEqual(h.alerts, ['expiry']);
  h.info.refreshConfigured = true; h.fail(true); let release; h.wait(new Promise(resolve => { release = resolve; }));
  const pending = h.renewal.run(); h.info.updatedAt = '2026-11-25T12:00:10.000Z'; release();
  assert.equal((await pending).lastError, null, 'un nouvel import ne récupère pas l’erreur de l’ancien');
  h.renewal.close(); await h.renewal.run({ force: true }); assert.equal(h.count(), 1);
});

test('Dates CRL : UTC et GeneralizedTime, échéance la plus proche, format illisible sans blocage', () => {
  const tlv = (tag, ...items) => { const body = Buffer.concat(items.map(item => Buffer.isBuffer(item) ? item : Buffer.from(item))); assert.ok(body.length < 128); return Buffer.concat([Buffer.from([tag, body.length]), body]); };
  const crl = (tag, start, end) => {
    const der = tlv(48, tlv(48, tlv(2, Buffer.from([1])), tlv(48), tlv(48), tlv(tag, start), tlv(tag, end)), tlv(48), tlv(3, Buffer.from([0])));
    return '-----BEGIN X509 CRL-----\n' + der.toString('base64') + '\n-----END X509 CRL-----\n';
  };
  assert.equal(credentialDates('', crl(23, '261101000000Z', '261201000000Z')).crlExpiresAt, '2026-12-01T00:00:00.000Z');
  assert.equal(credentialDates('', crl(24, '20500101000000Z', '20500201000000Z')).crlExpiresAt, '2050-02-01T00:00:00.000Z');
  assert.equal(credentialDates('', crl(23, '261101000000Z', '261201000000Z') + crl(23, '261101000000Z', '261125000000Z')).crlExpiresAt, '2026-11-25T00:00:00.000Z');
  assert.deepEqual(credentialDates('invalid', 'invalid'), { certificateExpiresAt: null, crlExpiresAt: null });
});

test('Requête de renouvellement : timeout/redirect stricts et taille de réponse bornée', async () => {
  await assert.rejects(fetchFreshCredentials('https://api.bambulab.com/applications/test/cert?secret=FAKE', async (_url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal); return new Response('x'.repeat(256 * 1024 + 1));
  }), /bambu-cert-response/);
  await assert.rejects(fetchFreshCredentials('https://api.bambulab.com/applications/test/cert', async () => new Response('no', { status: 503 })), /bambu-cert-fetch/);
});

test('Coffre : un import effectué pendant le téléchargement ne peut pas être écrasé par le renouvellement', async t => {
  const { execFileSync } = await import('node:child_process');
  const { createPrivateKey } = await import('node:crypto');
  const { createBambuCertificateVault } = await import('./bambu-certificate-vault.mjs');
  const { __cipher } = await import('./bambu-credential-refresh.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-vault-race-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=RenewalTest', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem')], { stdio: 'ignore' });
  const key = readFileSync(join(directory, 'key.pem'), 'utf8'), chain = readFileSync(join(directory, 'cert.pem'), 'utf8');
  const jwk = createPrivateKey(key).export({ format: 'jwk' });
  const parts = [jwk.p, jwk.q, jwk.dp, jwk.dq, jwk.qi].map(value => Buffer.from(value, 'base64url'));
  const header = Buffer.alloc(32); __cipher.SKEY.copy(header); parts.forEach((part, index) => header.writeUInt32LE(part.length, 12 + index * 4));
  const plain = Buffer.concat([header, ...parts]), nonce = Buffer.alloc(12, 42), size = Buffer.alloc(4); size.writeUInt32LE(plain.length);
  const blob = Buffer.concat([nonce, Buffer.alloc(16), size, __cipher.ctrXor(__cipher.APPCERT_KEY, nonce, plain)]).toString('base64');
  const crl = '-----BEGIN X509 CRL-----\nYQ==\n-----END X509 CRL-----\n';
  const vault = createBambuCertificateVault(directory);
  vault.install({ key, chain, crl, refreshUrl: 'https://api.bambulab.com/applications/test/cert' });
  let release;
  const pending = vault.refresh(async () => new Promise(resolve => { release = resolve; }));
  const newerCrl = crl.replace('YQ==', 'Yg=='); vault.install({ key, chain, crl: newerCrl });
  release(Response.json({ code: 0, cert: chain, crl, key: blob }));
  await assert.rejects(pending, /bambu-cert-refresh-stale/);
  assert.equal(vault.load().crl, newerCrl); assert.equal(vault.load().refreshUrl, null);
});
