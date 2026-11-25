// Rafraîchissement des identifiants applicatifs Bambu (cert + clé + CRL).
//
// Le certificat applicatif dure ~1,5 an mais la CRL n'est valable qu'~1 mois et
// l'imprimante rejette une CRL périmée. L'URL de requête cert capturée une fois
// (`trigger-url`, forme `…/applications/<leaf-CN>/cert?aes256=…`) est réutilisable :
// un simple GET renvoie une réponse fraîche {cert, crl, key}. Ce module la
// déchiffre et reconstruit les 3 PEM — sans Bambu Studio sur le serveur.
//
// Déchiffrement de `key` : AES-256-CTR à S-box NON standard, clé fixe 00..1f,
// compteur démarrant à 2. Portage du travail de rétro-ingénierie AGPL
// (danielwoz/BambuSlicerKeySaver, Bambuzled/BambuKeySaver `bambu-api-decrypt.py`).
// Ce fichier est donc, pour cette logique, sous AGPL-3.0-or-later.
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';

const SBOX = Buffer.from(
  'c5574d6c3a9505e0a3ba361fea51533b0e074e64500440e8626e9f2d708b2849' +
  'd5f9658d74687c6f0a6ab3af38fe7e8a477fb01600d40f13c9804aac8c4fa798' +
  '83945d48b4e93019039925bf8e41a0e4c3cf2cabd2321a0c11b5566315a6690b' +
  '88bb4c10cb75fa81f8cda1d697b726c69ef15fe5a987c7dc8f7a86209ad108c2' +
  '8409331bdd1efd0171da770dd7de93caa5d0e6608937c821597996ad2434b944' +
  'fcc1aef382464331e32e4bfb9255ed45766daa3ff55a91782206ffd9357d7bdb' +
  '54129cd8d3ee1742523ea4e7df9df2f4ef73f65eb15b18e29b58a82ae13d90b6' +
  '1cbd61eb23a26739f0bcb2f7852772cc29b81dbe66c42fce143c6bec5c2bc002', 'hex');
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];
const APPCERT_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i)); // 00 01 .. 1f

const xtime = a => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
function gmul(a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xtime(a); b >>= 1; } return r & 0xff; }

function keyExpand(key) {
  const w = [];
  for (let i = 0; i < 8; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  for (let i = 8; i < 60; i++) {
    let t = w[i - 1].slice();
    if (i % 8 === 0) t = [SBOX[t[1]] ^ RCON[i / 8 - 1], SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
    else if (i % 8 === 4) t = t.map(x => SBOX[x]);
    w.push([0, 1, 2, 3].map(j => w[i - 8][j] ^ t[j]));
  }
  const rk = [];
  for (let r = 0; r < 15; r++) {
    const block = Buffer.alloc(16);
    for (let c = 0; c < 4; c++) for (let j = 0; j < 4; j++) block[4 * c + j] = w[4 * r + c][j];
    rk.push(block);
  }
  return rk;
}

function encryptBlock(block, rk) {
  let s = Array.from({ length: 16 }, (_, i) => block[i] ^ rk[0][i]);
  for (let rnd = 1; rnd < 15; rnd++) {
    s = s.map(b => SBOX[b]);
    const shifted = [];
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) shifted[4 * c + r] = s[4 * ((c + r) % 4) + r];
    s = shifted;
    if (rnd < 14) {
      const t = [];
      for (let c = 0; c < 4; c++) {
        const [a0, a1, a2, a3] = s.slice(4 * c, 4 * c + 4);
        t.push(gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3, a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3,
          a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3), gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2));
      }
      s = t;
    }
    s = s.map((b, i) => b ^ rk[rnd][i]);
  }
  return Buffer.from(s);
}

function ctrXor(key, nonce, data) {
  const rk = keyExpand(key);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < Math.ceil(data.length / 16); i++) {
    const counter = Buffer.alloc(4); counter.writeUInt32BE(2 + i, 0);
    const ks = encryptBlock(Buffer.concat([nonce, counter]), rk);
    for (let j = 0; j < 16 && i * 16 + j < data.length; j++) out[i * 16 + j] = data[i * 16 + j] ^ ks[j];
  }
  return out;
}

const SKEY = Buffer.from([0x59, 0x45, 0x4b, 0x53]); // "SKEY" en little-endian

// Exporté uniquement pour les tests (construire un blob chiffré connu).
export const __cipher = { ctrXor, APPCERT_KEY, SKEY };

/** Déchiffre le champ `key` -> composantes CRT {p,q,dp,dq,qinv} (BigInt). */
export function decodeKeyBlob(keyB64) {
  const blob = Buffer.from(keyB64.replace(/[-_]/g, c => (c === '-' ? '+' : '/')).replace(/\s+/g, ''), 'base64');
  if (blob.length < 32) throw new Error('bambu-key-blob');
  const nonce = blob.subarray(0, 12);
  let ctLen = blob.readUInt32LE(28);
  if (32 + ctLen > blob.length) ctLen = blob.length - 32;
  const pt = ctrXor(APPCERT_KEY, nonce, blob.subarray(32, 32 + ctLen));
  if (!pt.subarray(0, 4).equals(SKEY)) throw new Error('bambu-key-magic');
  const sizes = [3, 4, 5, 6, 7].map(i => pt.readUInt32LE(4 * i));
  if (sizes.some(s => s <= 0) || 32 + sizes.reduce((a, b) => a + b, 0) > pt.length) throw new Error('bambu-key-sizes');
  let off = 32; const vals = [];
  for (const sz of sizes) { vals.push(BigInt('0x' + pt.subarray(off, off + sz).toString('hex'))); off += sz; }
  const [p, q, dp, dq, qinv] = vals;
  return { p, q, dp, dq, qinv };
}

// --- reconstruction RSA -> PEM PKCS#1 (DER minimal, sans dépendance) ---
function bigintToBytes(value) {
  let hex = value.toString(16); if (hex.length % 2) hex = '0' + hex;
  let bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) bytes = Buffer.from([0]);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]); // entier positif
  return bytes;
}
function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = []; let x = n;
  while (x > 0) { bytes.unshift(x & 0xff); x = Math.floor(x / 256); }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derInt(value) { const b = bigintToBytes(value); return Buffer.concat([Buffer.from([0x02]), derLen(b.length), b]); }
function derSeq(payload) { return Buffer.concat([Buffer.from([0x30]), derLen(payload.length), payload]); }

function modInverse(a, m) {
  let [old_r, r] = [a % m, m], [old_s, s] = [1n, 0n];
  while (r) { const qt = old_r / r; [old_r, r] = [r, old_r - qt * r]; [old_s, s] = [s, old_s - qt * s]; }
  return ((old_s % m) + m) % m;
}
function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

/** Reconstruit la clé privée RSA complète (PEM PKCS#1) depuis les CRT. */
export function rsaPrivateKeyPem({ p, q, dp, dq, qinv }) {
  const n = p * q;
  const e = modInverse(dp, p - 1n);
  if (modInverse(dq, q - 1n) !== e) throw new Error('bambu-key-crt');
  const lam = ((p - 1n) * (q - 1n)) / gcd(p - 1n, q - 1n);
  const d = modInverse(e, lam);
  const body = Buffer.concat([0n, n, e, d, p, q, dp, dq, qinv].map(derInt));
  const der = derSeq(body);
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n');
  return '-----BEGIN RSA PRIVATE KEY-----\n' + b64 + (b64.endsWith('\n') ? '' : '\n') + '-----END RSA PRIVATE KEY-----\n';
}

/** Transforme une réponse JSON de l'endpoint /cert en {key, chain, crl} PEM. */
export function parseCertResponse(doc) {
  if (doc?.code && doc.code !== 0) throw new Error('bambu-cert-response');
  const certBlocks = (doc.cert ?? '').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (certBlocks.length < 1) throw new Error('bambu-cert-missing');
  const chain = certBlocks.map(b => b.trim() + '\n').join('');
  const crlField = Array.isArray(doc.crl) ? doc.crl : [doc.crl];
  const crlBlocks = crlField.flatMap(entry => (entry ?? '').match(/-----BEGIN X509 CRL-----[\s\S]*?-----END X509 CRL-----/g) ?? []);
  if (!crlBlocks.length) throw new Error('bambu-crl-missing');
  const crl = crlBlocks.map(b => b.trim() + '\n').join('');
  if (!doc.key) throw new Error('bambu-key-missing');
  const key = rsaPrivateKeyPem(decodeKeyBlob(doc.key));
  // garde-fou : le modulus de la clé doit correspondre à celui du leaf
  const leafN = new X509Certificate(certBlocks[0]).publicKey.export({ format: 'jwk' }).n;
  const keyN = createPublicKey(createPrivateKey(key)).export({ format: 'jwk' }).n;
  if (leafN !== keyN) throw new Error('bambu-key-mismatch');
  return { key, chain, crl };
}

/** GET l'URL de rafraîchissement (trigger-url) et renvoie {key, chain, crl} frais. */
export async function fetchFreshCredentials(refreshUrl, fetchImpl = fetch) {
  const response = await fetchImpl(refreshUrl, { headers: { 'User-Agent': 'bambu_network_agent' } });
  if (!response.ok) throw new Error('bambu-cert-fetch');
  const doc = await response.json();
  const { key, chain, crl } = parseCertResponse(doc);
  return { key, chain, crl };
}
