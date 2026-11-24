import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { certificate, certificateId, importPrivateKey, LabError, nodeCryptoProvider } from './crypto.ts';
import type { BambuCryptoProvider } from './crypto.ts';
import { BambuDiagnostics } from './diagnostics.ts';

export interface LabIdentity { id: string; certificate: string; chain: string[]; fingerprint: string; origin: 'lab' | 'imported' }
const validId = (id: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id);
const fingerprint = (value: string) => /^[a-f0-9]{64}$/.test(value);
async function inspect(path: string, directory: boolean) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new LabError('storage');
}
async function write(path: string, data: string | Buffer) {
  await inspect(resolve(path, '..'), true);
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
}
async function read(path: string, max = 32768) {
  await inspect(resolve(path, '..'), true);
  await inspect(path, false);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if ((await file.stat()).size > max) throw new LabError('storage'); return await file.readFile(); } finally { await file.close(); }
}
/** No shell; secret only on stdin. No raw OpenSSL error output crosses this boundary. */
async function openssl(args: string[], input = Buffer.alloc(0)) {
  await new Promise<void>((done, reject) => {
    const child = spawn('openssl', args, { stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: process.env.PATH, LANG: 'C', OPENSSL_CONF: '/dev/null' } });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000); timeout.unref();
    child.stdin.on('error', () => {}); child.stdin.end(input);
    child.once('error', () => { clearTimeout(timeout); reject(new LabError('openssl')); });
    child.once('exit', code => { clearTimeout(timeout); if (code === 0) done(); else reject(new LabError('openssl')); });
  });
}

/** Isolated laboratory storage. Not imported by the production Bambu connector or HTTP server. */
export class BambuCertificateManager {
  readonly diagnostics: BambuDiagnostics;
  readonly directory: string;
  #provider: BambuCryptoProvider;
  #bits: number;
  #now: () => number;
  #revocationVersion = 0;
  #revoking = new Set<string>();
  get revocationVersion() { return this.#revocationVersion; }
  private constructor(directory: string, options: { provider?: BambuCryptoProvider; bits?: number; now?: () => number; diagnostics?: BambuDiagnostics }) {
    this.directory = resolve(directory); this.diagnostics = options.diagnostics ?? new BambuDiagnostics();
    this.#provider = options.provider ?? nodeCryptoProvider; this.#bits = options.bits ?? 3072; this.#now = options.now ?? Date.now;
  }
  static async open(directory: string, options: { provider?: BambuCryptoProvider; bits?: number; now?: () => number; diagnostics?: BambuDiagnostics } = {}) {
    const manager = new BambuCertificateManager(directory, options);
    try {
      await mkdir(manager.directory, { recursive: true, mode: 0o700 });
      // Reject symlinks in every ancestor as well as the store itself.
      for (let path = manager.directory; path !== '/'; path = resolve(path, '..')) if ((await lstat(path)).isSymbolicLink()) throw new LabError('storage');
      await inspect(manager.directory, true);
      await manager.#exclusive(async () => {
        try { await inspect(join(manager.directory, 'authority'), true); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          const stage = await manager.#stage();
          try {
            await manager.#key(stage);
            const pass = await read(join(stage, 'passphrase'));
            try { await openssl(['req', '-new', '-x509', '-key', join(stage, 'key.pem'), '-passin', 'stdin', '-out', join(stage, 'certificate.pem'), '-subj', '/CN=FabCore Laboratory CA ' + randomUUID(), '-days', '365', '-sha256', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-addext', 'subjectKeyIdentifier=hash', '-addext', 'authorityKeyIdentifier=keyid:always'], pass); }
            finally { pass.fill(0); }
            await manager.#protectCertificate(stage);
            await rename(stage, join(manager.directory, 'authority'));
          } finally { await rm(stage, { recursive: true, force: true }); }
        }
        await inspect(join(manager.directory, 'authority'), true);
        await read(join(manager.directory, 'authority/key.pem'));
        await read(join(manager.directory, 'authority/passphrase'));
      });
      return manager;
    } catch (error) { throw error instanceof LabError ? error : new LabError('storage'); }
  }
  async #exclusive<T>(action: () => Promise<T>): Promise<T> {
    const lock = join(this.directory, '.lock'); await write(lock, 'locked');
    try { return await action(); } finally { await unlink(lock); }
  }
  #stage() { return mkdtemp(join(this.directory, '.pending-')); }
  async #key(directory: string, supplied?: ReturnType<typeof importPrivateKey>) {
    const key = supplied ?? (await this.#provider.generate(this.#bits)).privateKey;
    const pass = Buffer.from(randomBytes(32).toString('hex') + '\n');
    try {
      await write(join(directory, 'passphrase'), pass);
      const pem = key.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pass.toString().trim() });
      await write(join(directory, 'key.pem'), pem);
    } finally { pass.fill(0); }
  }
  async #protectCertificate(stage: string) {
    // OpenSSL creates public output under umask; rewrite into an exclusive 0600 file.
    const path = join(stage, 'certificate.pem'); const pem = await readFile(path, 'utf8'); certificate(pem);
    await unlink(path); await write(path, pem);
  }
  async authority() { return (await read(join(this.directory, 'authority/certificate.pem'))).toString(); }
  async createIdentity(): Promise<LabIdentity> {
    return this.#exclusive(async () => {
      const id = randomUUID(), stage = await this.#stage();
      try {
        await this.#key(stage);
        let pass = await read(join(stage, 'passphrase'));
        try { await openssl(['req', '-new', '-key', join(stage, 'key.pem'), '-passin', 'stdin', '-out', join(stage, 'request.pem'), '-subj', '/CN=FabCore Laboratory ' + id], pass); }
        finally { pass.fill(0); }
        const authority = join(this.directory, 'authority');
        await write(join(stage, 'extensions'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
        pass = await read(join(authority, 'passphrase'));
        try { await openssl(['x509', '-req', '-in', join(stage, 'request.pem'), '-CA', join(authority, 'certificate.pem'), '-CAkey', join(authority, 'key.pem'), '-passin', 'stdin', '-set_serial', '0x' + randomBytes(16).toString('hex'), '-days', '30', '-sha256', '-extfile', join(stage, 'extensions'), '-out', join(stage, 'certificate.pem')], pass); }
        finally { pass.fill(0); }
        await this.#protectCertificate(stage);
        await write(join(stage, 'metadata.json'), JSON.stringify({ origin: 'lab', chain: [] }));
        await unlink(join(stage, 'request.pem')); await unlink(join(stage, 'extensions'));
        await rename(stage, join(this.directory, id));
        const identity = await this.identity(id); this.diagnostics.record({ event: 'identity-created', ok: true }, identity.fingerprint); return identity;
      } finally { await rm(stage, { recursive: true, force: true }); }
    });
  }
  async identity(id: string): Promise<LabIdentity> {
    if (!validId(id)) throw new LabError('invalid-input');
    try {
      const path = join(this.directory, id); await inspect(path, true);
      const pem = (await read(join(path, 'certificate.pem'))).toString();
      const metadata = JSON.parse((await read(join(path, 'metadata.json'))).toString()) as { origin: 'lab' | 'imported'; chain: string[] };
      if (!['lab', 'imported'].includes(metadata.origin) || !Array.isArray(metadata.chain) || metadata.chain.length > 8) throw new LabError('storage');
      return { id, certificate: pem, chain: metadata.chain.map(c => certificate(c).toString()), fingerprint: certificateId(pem), origin: metadata.origin };
    } catch { throw new LabError('storage'); }
  }
  async validate(pem: string, roots: string[], chain: string[] = []) {
    const started = performance.now();
    const version = this.#revocationVersion;
    try {
      if (!roots.length || roots.length > 8 || chain.length > 8) throw new LabError('untrusted');
      const leaf = certificate(pem), all = [pem, ...chain, ...roots];
      if (leaf.ca || !roots.every(c => certificate(c).ca)) throw new LabError('untrusted');
      for (const item of all) {
        const cert = certificate(item);
        if (this.#now() < Date.parse(cert.validFrom) || this.#now() >= Date.parse(cert.validTo)) throw new LabError('expired');
        if (this.#revoking.has(certificateId(item))) throw new LabError('revoked');
        try { await read(join(this.directory, 'revoked-' + certificateId(item))); throw new LabError('revoked'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const stage = await mkdtemp(join(tmpdir(), 'fabcore-cert-verify-'));
      try {
        await write(join(stage, 'leaf.pem'), pem); await write(join(stage, 'roots.pem'), roots.join('\n'));
        if (chain.length) await write(join(stage, 'chain.pem'), chain.join('\n'));
        try { await openssl(['verify', '-no-CAfile', '-no-CApath', '-no-CAstore', '-check_ss_sig', '-x509_strict', '-purpose', 'sslclient', '-attime', String(Math.floor(this.#now() / 1000)), '-trusted', join(stage, 'roots.pem'), ...(chain.length ? ['-untrusted', join(stage, 'chain.pem')] : []), join(stage, 'leaf.pem')]); }
        catch { throw new LabError('untrusted'); }
      } finally { await rm(stage, { recursive: true, force: true }); }
      if (version !== this.#revocationVersion) throw new LabError('revoked');
      this.diagnostics.record({ event: 'certificate-check', ok: true, elapsedMs: performance.now() - started }, certificateId(pem));
      return { fingerprint: certificateId(pem), validUntil: leaf.validTo };
    } catch (error) {
      const failure = error instanceof LabError ? error : new LabError('untrusted');
      this.diagnostics.record({ event: 'certificate-check', ok: false, reason: failure.code, elapsedMs: performance.now() - started }); throw failure;
    }
  }
  async importIdentity(input: { certificate: string; privateKey: string; passphrase: Buffer; roots: string[]; chain?: string[] }): Promise<LabIdentity> {
    await this.validate(input.certificate, input.roots, input.chain);
    const key = importPrivateKey(input.privateKey, input.passphrase, input.certificate);
    return this.#exclusive(async () => {
      const id = randomUUID(), stage = await this.#stage();
      try {
        await this.#key(stage, key); await write(join(stage, 'certificate.pem'), input.certificate);
        await write(join(stage, 'metadata.json'), JSON.stringify({ origin: 'imported', chain: input.chain ?? [] })); await rename(stage, join(this.directory, id));
        const identity = await this.identity(id); this.diagnostics.record({ event: 'identity-imported', ok: true }, identity.fingerprint); return identity;
      } finally { await rm(stage, { recursive: true, force: true }); }
    });
  }
  async sign(id: string, data: Uint8Array) {
    const identity = await this.identity(id), directory = join(this.directory, id);
    const cert = certificate(identity.certificate);
    if (this.#now() < Date.parse(cert.validFrom) || this.#now() >= Date.parse(cert.validTo)) throw new LabError('expired');
    if (await this.revoked(identity.fingerprint)) throw new LabError('revoked');
    if (data.length > 128 * 1024) throw new LabError('invalid-input');
    // Always validate the full chain again at the authorization boundary too.
    const pass = await read(join(directory, 'passphrase'));
    try { return this.#provider.sign(data, importPrivateKey((await read(join(directory, 'key.pem'))).toString(), pass.subarray(0, -1), identity.certificate)); }
    catch (error) { throw error instanceof LabError ? error : new LabError('storage'); }
    finally { pass.fill(0); }
  }
  async revoke(pem: string) {
    const id = certificateId(pem);
    // Effective synchronously, even before the durable tombstone has been written.
    // Retain on I/O failure too: fail closed in this process and report storage failure.
    this.#revoking.add(id);
    this.#revocationVersion++;
    try { await write(join(this.directory, 'revoked-' + id), 'revoked'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new LabError('storage'); }
    this.diagnostics.record({ event: 'identity-revoked', ok: true }, id);
  }
  async rotate(id: string) {
    const old = await this.identity(id);
    if (old.origin !== 'lab') throw new LabError('interface-unqualified');
    const next = await this.createIdentity(); await this.revoke(old.certificate); return next;
  }
  async remove(id: string) {
    const identity = await this.identity(id); await this.revoke(identity.certificate);
    await this.#exclusive(async () => {
      // Logical deletion and revocation, NOT a promise of physical erasure on SSD/COW/backups.
      await unlink(join(this.directory, id, 'key.pem')); await unlink(join(this.directory, id, 'passphrase'));
    });
    this.diagnostics.record({ event: 'identity-deleted', ok: true }, identity.fingerprint);
  }
  async revoked(id: string) {
    if (!fingerprint(id)) throw new LabError('invalid-input');
    if (this.#revoking.has(id)) return true;
    try { await read(join(this.directory, 'revoked-' + id)); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new LabError('storage'); }
  }
}
