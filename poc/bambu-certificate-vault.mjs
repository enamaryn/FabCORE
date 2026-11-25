import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, randomBytes, timingSafeEqual, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const limit = 48 * 1024;
const compare = (a,b) => a.length === b.length && timingSafeEqual(a,b);
const validPem = (text, kind) => typeof text === 'string' && text.length < limit && text.includes('-----BEGIN ' + kind + '-----') && text.includes('-----END ' + kind + '-----');
const reject = () => { const error = new Error('bambu-cert-invalid'); error.status = 400; throw error; };
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
  const status=()=>{
    if(!existsSync(dataPath)) return {configured:false};
    const bytes=readFileSync(dataPath);
    if(bytes.length < 29) throw new Error('bambu-cert-storage');
    const decipher=createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
    return {configured:true, fingerprint:data.fingerprint, updatedAt:data.updatedAt, certificateCount:data.certificateCount, validation:'local-only'};
  };
  return {
    status,
    install({key:privatePem,chain,crl}) {
      if(!validPem(privatePem,'PRIVATE KEY') && !validPem(privatePem,'RSA PRIVATE KEY')) reject();
      if(!validPem(chain,'CERTIFICATE') || !validPem(crl,'X509 CRL')) reject();
      try {
        const blocks=chain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)??[];
        if(blocks.length !== 3) reject();
        const certificates=blocks.map(block=>new X509Certificate(block));
        const privateKey=createPrivateKey(privatePem);
        if(privateKey.asymmetricKeyType !== 'rsa' || (privateKey.asymmetricKeyDetails?.modulusLength??0)<2048) reject();
        const derived=createPublicKey(privateKey).export({type:'spki',format:'der'});
        const leaf=certificates[0].publicKey.export({type:'spki',format:'der'});
        if(!compare(derived,leaf)) reject();
        if(!certificates[0].checkIssued(certificates[1]) || !certificates[0].verify(certificates[1].publicKey)) reject();
        if(!certificates[1].checkIssued(certificates[2]) || !certificates[1].verify(certificates[2].publicKey)) reject();
        if(!certificates[2].verify(certificates[2].publicKey)) reject();
        if(certificates.some(cert=>Date.parse(cert.validFrom)>Date.now() || Date.parse(cert.validTo)<Date.now())) reject();
        const fingerprint=certificates[0].fingerprint256;
        const updatedAt=new Date().toISOString();
        const plain=Buffer.from(JSON.stringify({key:privatePem,chain,crl,fingerprint,updatedAt,certificateCount:blocks.length}));
        const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
        const encrypted=Buffer.concat([iv,cipher.update(plain),cipher.final()]);
        const bytes=Buffer.concat([encrypted.subarray(0,12),cipher.getAuthTag(),encrypted.subarray(12)]);
        plain.fill(0);
        const temp=join(base,'.credentials-'+randomBytes(8).toString('hex'));
        try { writeFileSync(temp,bytes,{flag:'wx',mode:0o600});renameSync(temp,dataPath); }
        catch (err) { try { unlinkSync(temp); } catch {} throw err; }
        chmodSync(dataPath,0o600);
        return {configured:true,fingerprint,updatedAt,certificateCount:blocks.length,validation:'local-only'};
      } catch(error) { if(error.message==='bambu-cert-invalid') throw error; reject(); }
    }
  };
}
