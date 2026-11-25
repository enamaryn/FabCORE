import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createBambuCertificateVault } from './bambu-certificate-vault.mjs';

const openssl = spawnSync('openssl',['version'],{encoding:'utf8'}).status === 0;
test('Bambu PEM import: matching chain, encrypted storage, metadata only', { skip: !openssl && 'OpenSSL required for X509 fixture' }, () => {
  const dir=mkdtempSync(join(tmpdir(),'fabcore-bambu-vault-'));
  const run=(...args)=>execFileSync('openssl',args,{cwd:dir,stdio:'pipe'});
  try {
    writeFileSync(join(dir,'ca.ext'),'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
    writeFileSync(join(dir,'leaf.ext'),'basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature\n');
    run('req','-new','-x509','-newkey','rsa:2048','-nodes','-keyout','root.key','-out','root.pem','-days','2','-subj','/CN=FabCore Lab Root','-addext','basicConstraints=critical,CA:TRUE');
    run('req','-new','-newkey','rsa:2048','-nodes','-keyout','inter.key','-out','inter.csr','-subj','/CN=FabCore Lab Intermediate');
    run('x509','-req','-in','inter.csr','-CA','root.pem','-CAkey','root.key','-CAcreateserial','-out','inter.pem','-days','2','-extfile','ca.ext');
    run('req','-new','-newkey','rsa:2048','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=FabCore Test Application');
    run('x509','-req','-in','leaf.csr','-CA','inter.pem','-CAkey','inter.key','-CAcreateserial','-out','leaf.pem','-days','2','-extfile','leaf.ext');
    const key=readFileSync(join(dir,'leaf.key'),'utf8');
    const chain=['leaf.pem','inter.pem','root.pem'].map(x=>readFileSync(join(dir,x),'utf8')).join('');
    const crl='-----BEGIN X509 CRL-----\nYQ==\n-----END X509 CRL-----\n';
    const vault=createBambuCertificateVault(join(dir,'data'));
    assert.deepEqual(vault.status(),{configured:false});
    assert.throws(()=>vault.install({key:'wrong',chain,crl}),/bambu-cert-invalid/);
    const status=vault.install({key,chain,crl});
    assert.equal(status.configured,true);
    assert.equal(status.certificateCount,3);
    const ciphertext=readFileSync(join(dir,'data','bambu-application-credentials','credentials.enc'));
    assert.equal(ciphertext.includes(Buffer.from(key)),false);
    assert.equal(JSON.stringify(vault.status()).includes('PRIVATE KEY'),false);
    assert.equal(statSync(join(dir,'data','bambu-application-credentials','vault.key')).mode & 0o777,0o600);
    assert.equal(createBambuCertificateVault(join(dir,'data')).status().fingerprint,status.fingerprint);
    assert.throws(()=>vault.install({key,chain:chain.replace('CERTIFICATE','BROKEN'),crl}),/bambu-cert-invalid/);
    assert.equal(vault.status().fingerprint,status.fingerprint);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
