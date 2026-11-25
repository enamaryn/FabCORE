import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  X509Certificate, constants, createPrivateKey, createPublicKey, generateKeyPairSync,
  privateDecrypt, verify,
} from 'node:crypto';

import { canonicalJson, certIdFromChain, createBambuSigner, preparePrint, signPrint } from './bambu-signing.mjs';
import { __cipher, decodeKeyBlob, parseCertResponse, rsaPrivateKeyPem } from './bambu-credential-refresh.mjs';

const PKCS1 = constants.RSA_PKCS1_PADDING;

// --- fabrique de certificats de test (chaîne auto-cohérente) ---------------
function selfCert(subject, publicKeyPem) {
  // Node n'a pas de builder X509 ; on fabrique un cert minimal via un pont OpenSSL-less :
  // on réutilise generateKeyPairSync + une autorité jetable. Comme Node ne signe pas de
  // X509 en pur JS, on s'appuie sur un cert pré-généré au besoin. Ici on vérifie la
  // logique de signature/chiffrement, pas l'émission X509 : on fabrique un cert via
  // le helper ci-dessous.
  return publicKeyPem; // non utilisé (voir makeLeaf)
}

// Génère une paire + un certificat auto-signé portant cette clé, en DER, via le
// constructeur X509Certificate alimenté par un cert OpenSSL généré par Node.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeCert(cn) {
  const dir = mkdtempSync(join(tmpdir(), 'bbl-'));
  try {
    const keyPath = join(dir, 'k.pem'), certPath = join(dir, 'c.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
      '-keyout', keyPath, '-out', certPath, '-subj', `/CN=${cn}`], { stdio: 'ignore' });
    return { keyPem: readFileSync(keyPath, 'utf8'), certPem: readFileSync(certPath, 'utf8') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('canonicalJson trie les clés et reste compact', () => {
  assert.equal(canonicalJson({ b: 1, a: 'x/y' }), '{"a":"x/y","b":1}');
});

test('enveloppe signée : header-first, clés triées, sequence_id chaîne, param_enc, signature valide', () => {
  const app = makeCert('GLOF3813734089.bambulab.com');       // sert de leaf (clé = app)
  const device = makeCert('TEST-P2S-SERIAL');                // cert imprimante (placeholder)
  const chain = app.certPem;
  const signer = createBambuSigner({ key: app.keyPem, chain, crl: '-----BEGIN X509 CRL-----\nAA==\n-----END X509 CRL-----\n' });

  const wire = signer.sign({ param: 'G28\n' }, 'gcode_line', 104546, device.certPem);
  const env = JSON.parse(wire);

  // header en premier, octet pour octet
  const header = canonicalJson(env.header);
  const value = canonicalJson(env.print);
  assert.equal(wire, '{"header":' + header + ',"print":' + value + '}');

  // print : clés triées, pas de param en clair, sequence_id chaîne
  assert.deepEqual(Object.keys(env.print), ['command', 'param_enc', 'sequence_id']);
  assert.equal(typeof env.print.sequence_id, 'string');
  assert.ok(!('param' in env.print));

  // header conforme
  assert.equal(env.header.sign_alg, 'RSA_SHA256');
  assert.equal(env.header.sign_ver, 'v1.0');
  assert.equal(env.header.cert_id, certIdFromChain(chain));

  // reconstruction firmware : « {" + section print jusqu'au } final »
  const i = wire.indexOf('"print":');
  const signed = Buffer.from('{' + wire.slice(i), 'utf8');
  assert.equal(env.header.payload_len, signed.length);
  const ok = verify('sha256', signed, { key: new X509Certificate(app.certPem).publicKey, padding: PKCS1 },
    Buffer.from(env.header.sign_string, 'base64'));
  assert.equal(ok, true, 'la signature doit vérifier contre la clé publique du leaf');

  // param_enc déchiffrable par la clé de l'imprimante -> G28
  const clair = privateDecrypt({ key: device.keyPem, padding: PKCS1 }, Buffer.from(env.print.param_enc, 'base64'));
  assert.equal(clair.toString('utf8'), 'G28\n');
});

test('sequence_id croissant via preparePrint', () => {
  const a = preparePrint({ command: 'pause' }, 'pause', 2000, null);
  const b = preparePrint({ command: 'pause' }, 'pause', 2001, null);
  assert.equal(a.sequence_id, '2000');
  assert.equal(Number(b.sequence_id) > Number(a.sequence_id), true);
});

test('déchiffrement : un blob key construit avec le chiffre se reconstruit à l’identique', () => {
  // clé RSA connue -> extraire les CRT (jwk) -> emballer en SKEY -> chiffrer -> décoder
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const full = privateKey.export({ format: 'jwk' });
  const b64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const limbs = [full.p, full.q, full.dp, full.dq, full.qi].map(b64u);
  const header = Buffer.alloc(32);
  __cipher.SKEY.copy(header, 0);
  limbs.forEach((l, i) => header.writeUInt32LE(l.length, 12 + 4 * i));
  const plain = Buffer.concat([header, ...limbs]);
  const nonce = Buffer.alloc(12, 7);
  const ct = __cipher.ctrXor(__cipher.APPCERT_KEY, nonce, plain);
  const ctLen = Buffer.alloc(4); ctLen.writeUInt32LE(plain.length, 0);
  const blob = Buffer.concat([nonce, Buffer.alloc(16), ctLen, ct]).toString('base64');

  const crt = decodeKeyBlob(blob);
  const pem = rsaPrivateKeyPem(crt);
  const recoveredN = createPublicKey(createPrivateKey(pem)).export({ format: 'jwk' }).n;
  assert.equal(recoveredN, jwk.n, 'le modulus reconstruit doit correspondre à la clé d’origine');
});

test('parseCertResponse rejette une clé qui ne correspond pas au leaf', () => {
  const app = makeCert('GLOF3813734089.bambulab.com');
  const other = makeCert('GLOF3813734089.bambulab.com');
  // réponse avec un cert (app) mais une clé (other) non assortie -> erreur
  const otherJwk = createPrivateKey(other.keyPem).export({ format: 'jwk' });
  const b64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const limbs = [otherJwk.p, otherJwk.q, otherJwk.dp, otherJwk.dq, otherJwk.qi].map(b64u);
  const h = Buffer.alloc(32); __cipher.SKEY.copy(h, 0);
  limbs.forEach((l, i) => h.writeUInt32LE(l.length, 12 + 4 * i));
  const plain = Buffer.concat([h, ...limbs]);
  const nonce = Buffer.alloc(12, 1);
  const ct = __cipher.ctrXor(__cipher.APPCERT_KEY, nonce, plain);
  const ctLen = Buffer.alloc(4); ctLen.writeUInt32LE(plain.length, 0);
  const blob = Buffer.concat([nonce, Buffer.alloc(16), ctLen, ct]).toString('base64');
  const doc = { code: 0, cert: app.certPem, crl: '-----BEGIN X509 CRL-----\nAA==\n-----END X509 CRL-----\n', key: blob };
  assert.throws(() => parseCertResponse(doc), /bambu-key-mismatch/);
});
