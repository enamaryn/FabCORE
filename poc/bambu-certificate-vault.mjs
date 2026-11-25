import { createCipheriv, createDecipheriv, randomBytes, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { credentialDates } from './bambu-credential-dates.mjs';
import { fetchFreshCredentials } from './bambu-credential-refresh.mjs';

const limit = 48 * 1024;
const validPem = (text, kind) => typeof text === 'string' && text.length < limit && text.includes('-----BEGIN ' + kind + '-----') && text.includes('-----END ' + kind + '-----');
const reject = (reason = 'invalid') => { const error = new Error('bambu-cert-' + reason); error.status = 400; throw error; };
// 4e champ optionnel : l'URL de requête cert (trigger-url), réutilisable pour rafraîchir la CRL.
const validRefreshUrl = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 4096) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && u.hostname.endsWith('.bambulab.com') && u.pathname.includes('/applications/'); }
  catch { return false; }
};
export function createBambuCertificateVault(directory) {
  const base = join(directory, 'bambu-application-credentials');
  mkdirSync(base, { recursive:true, mode:0o700 }); chmodSync(base, 0o700);
  const keyPath = join(base, 'vault.key'), dataPath = join(base, 'credentials.enc');
  if (!existsSync(keyPath)) {
    try { writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (!lstatSync(keyPath).isFile()) throw new Error('bambu-cert-storage');
  const key=readFileSync(keyPath);
  if (key.length !== 32) throw new Error('bambu-cert-storage');
  const decrypt=()=>{
    const bytes=readFileSync(dataPath);
    if(bytes.length < 29) throw new Error('bambu-cert-storage');
    const decipher=createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  };
  const status=()=>{
    if(!existsSync(dataPath)) return {configured:false};
    const data=decrypt();
    return {configured:true, fingerprint:data.fingerprint, updatedAt:data.updatedAt, certificateCount:data.certificateCount, refreshConfigured:Boolean(data.refreshUrl), ...credentialDates(data.chain, data.crl), validation:'pem-only'};
  };
  // Lecture interne des secrets déchiffrés (clé/chaîne/CRL + URL). JAMAIS exposée via HTTP.
  const load=()=>{ if(!existsSync(dataPath)) return null; const d=decrypt(); return {key:d.key, chain:d.chain, crl:d.crl, refreshUrl:d.refreshUrl ?? null, certId:d.certId ?? null}; };
  const persist=(input)=>{
    if (!input || typeof input !== 'object' || Array.isArray(input)) reject();
    const {key:privatePem,chain,crl,refreshUrl}=input;
    if(!validPem(privatePem,'PRIVATE KEY') && !validPem(privatePem,'RSA PRIVATE KEY')) reject('key-format');
    if(!validPem(chain,'CERTIFICATE')) reject('chain-format');
    if(!validPem(crl,'X509 CRL')) reject('crl-format');
    if(!validRefreshUrl(refreshUrl)) reject('refresh-url');
    try {
      const blocks=chain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)??[];
      // Import only: the printer decides whether these credentials are accepted.
      // Parse the first certificate solely for optional display metadata.
      let fingerprint=null, certId=null;
      try {
        const leaf=new X509Certificate(blocks[0]);
        fingerprint=leaf.fingerprint256;
        certId=leaf.serialNumber.toLowerCase()+leaf.issuer.split('\n').map(l=>l.trim()).filter(Boolean).reverse().join(',');
      } catch { /* PEM storage does not depend on local X509 parsing. */ }
      const updatedAt=new Date().toISOString();
      const dates=credentialDates(chain, crl);
      const record={key:privatePem,chain,crl,fingerprint,updatedAt,certificateCount:blocks.length,certId};
      if(refreshUrl) record.refreshUrl=refreshUrl;
      const plain=Buffer.from(JSON.stringify(record));
      const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
      const encrypted=Buffer.concat([iv,cipher.update(plain),cipher.final()]);
      const bytes=Buffer.concat([encrypted.subarray(0,12),cipher.getAuthTag(),encrypted.subarray(12)]);
      plain.fill(0);
      const temp=join(base,'.credentials-'+randomBytes(8).toString('hex'));
      try { writeFileSync(temp,bytes,{flag:'wx',mode:0o600});renameSync(temp,dataPath); }
      catch (err) { try { unlinkSync(temp); } catch {} throw err; }
      chmodSync(dataPath,0o600);
      return {configured:true,fingerprint,updatedAt,certificateCount:blocks.length,refreshConfigured:Boolean(refreshUrl),...dates,validation:'pem-only'};
    } catch(error) { if(error.status===400 && error.message.startsWith('bambu-cert-')) throw error; throw new Error('bambu-cert-storage'); }
  };
  return {
    status,
    load,
    install(data) { return persist(data); },
    setRefreshUrl(refreshUrl) { if (typeof refreshUrl !== 'string') reject('refresh-url'); if(!existsSync(dataPath)) reject(); return persist({ ...decrypt(), refreshUrl }); },
    // Rejoue l'URL de rafraîchissement (trigger-url) pour obtenir cert+clé+CRL frais.
    async refresh(fetchImpl, signal) {
      if(!existsSync(dataPath)) { const e=new Error('bambu-cert-invalid'); e.status=400; throw e; }
      const original=readFileSync(dataPath);
      const current=decrypt();
      if(!current.refreshUrl) { const e=new Error('bambu-cert-no-refresh-url'); e.status=400; throw e; }
      const fresh=await fetchFreshCredentials(current.refreshUrl, fetchImpl, signal);
      if (signal?.aborted || !readFileSync(dataPath).equals(original)) throw new Error('bambu-cert-refresh-stale');
      return persist({ ...fresh, refreshUrl:current.refreshUrl });
    }
  };
}
