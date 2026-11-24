/** Laboratory primitives only. This is not Bambu's application authorization format. */
import { constants, createHash, createPrivateKey, createPublicKey, generateKeyPair, sign, verify, X509Certificate } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { promisify } from 'node:util';

export type LabFailure = 'invalid-input' | 'weak-key' | 'storage' | 'openssl' | 'expired' | 'revoked' | 'untrusted' | 'key-mismatch' | 'not-approved' | 'bad-signature' | 'replay' | 'interface-unqualified';
export class LabError extends Error {
  readonly code: LabFailure;
  constructor(code: LabFailure) { super(code); this.code = code; this.name = 'BambuLabError'; }
}
export interface BambuCryptoProvider {
  generate(bits?: number): Promise<{ privateKey: KeyObject; publicKey: KeyObject }>;
  fingerprint(data: Uint8Array): string;
  sign(data: Uint8Array, key: KeyObject): Buffer;
  verify(data: Uint8Array, signature: Uint8Array, key: KeyObject): boolean;
}
function rsa(key: KeyObject) {
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new LabError('weak-key');
  return key;
}
export const nodeCryptoProvider: BambuCryptoProvider = {
  async generate(bits = 3072) {
    if (![2048, 3072, 4096].includes(bits)) throw new LabError('weak-key');
    return promisify(generateKeyPair)('rsa', { modulusLength: bits, publicExponent: 65537 });
  },
  fingerprint: data => createHash('sha256').update(data).digest('hex'),
  sign: (data, key) => sign('sha256', data, { key: rsa(key), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }),
  verify(data, signature, key) {
    try { return verify('sha256', data, { key: rsa(key), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature); }
    catch { return false; }
  },
};
export const certificate = (pem: string) => {
  try {
    if (Buffer.byteLength(pem) > 16384 || !/^-----BEGIN CERTIFICATE-----\r?\n[\s\S]+\r?\n-----END CERTIFICATE-----\s*$/.test(pem) || (pem.match(/BEGIN CERTIFICATE/g)?.length ?? 0) !== 1) throw new Error();
    const cert = new X509Certificate(pem); rsa(cert.publicKey); return cert;
  } catch { throw new LabError('invalid-input'); }
};
export const certificateId = (pem: string) => nodeCryptoProvider.fingerprint(certificate(pem).raw);
export function importPrivateKey(pem: string, passphrase: Buffer, certPem: string) {
  try {
    if (Buffer.byteLength(pem) > 32768) throw new LabError('invalid-input');
    const key = rsa(createPrivateKey({ key: pem, passphrase }));
    if (!certificate(certPem).checkPrivateKey(key)) throw new LabError('key-mismatch');
    return key;
  } catch (error) { throw error instanceof LabError ? error : new LabError('invalid-input'); }
}
export const publicKey = (key: KeyObject) => rsa(createPublicKey(key));
