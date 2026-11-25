// Signature des commandes MQTT Bambu `print.*` pour imprimantes en mode cloud
// (verification ON, sans Mode Developpeur). Forme vérifiée sur matériel
// (ClusterM/open-bamboo-networking §10.4, nofuturekid/ha-bambulab-signed, et
// enamaryn/bamboo-sense tools/keyforge_connect.py) :
//   - enveloppe header-FIRST : {"header":{…},"print":{…}} ;
//   - octets signés = {"print":<section>} en JSON compact, CLES TRIEES,
//     octet-pour-octet identiques à ce qui est émis ;
//   - cert_id = serial(hex minuscule) + issuer(RFC4514) du leaf ;
//   - sequence_id = CHAINE, >= 2000, strictement croissant ;
//   - gcode_line/project_file : champ sensible chiffré (`param_enc`/`url_enc`)
//     vers la clé publique du certificat de l'imprimante (RSA PKCS#1 v1.5).
// Aucune dépendance réseau : pur crypto, testable isolément.
import { X509Certificate, constants, createHash, createSign, publicEncrypt } from 'node:crypto';

const PKCS1 = constants.RSA_PKCS1_PADDING;

/** JSON compact, clés triées récursivement (ensure_ascii=false par défaut en JS). */
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

/** Issuer RFC4514 (ordre le plus spécifique d'abord). Simple pour un seul CN. */
function issuerRfc4514(certificate) {
  return certificate.issuer.split('\n').map(line => line.trim()).filter(Boolean).reverse().join(',');
}

/** cert_id MQTT à partir de la chaîne PEM (le leaf est le 1er certificat). */
export function certIdFromChain(chainPem) {
  const block = chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  if (!block) throw new Error('bambu-sign-chain');
  const leaf = new X509Certificate(block[0]);
  return leaf.serialNumber.toLowerCase() + issuerRfc4514(leaf);
}

/** Chiffre un champ (G-code / url) vers la clé publique du cert imprimante. */
export function encryptToPrinter(printerCertPem, text) {
  const key = new X509Certificate(printerCertPem).publicKey;
  return publicEncrypt({ key, padding: PKCS1 }, Buffer.from(text, 'utf8')).toString('base64');
}

/**
 * Signe une commande `print.*` et renvoie le JSON complet prêt à publier.
 * @param printObj   contenu "print" (doit contenir sequence_id en CHAINE).
 * @param certId     cert_id du leaf.
 * @param keyPem     clé privée RSA de l'app (PEM).
 */
export function signPrint(printObj, certId, keyPem) {
  const value = canonicalJson(printObj);
  const signed = Buffer.from('{"print":' + value + '}', 'utf8');
  const signature = createSign('sha256').update(signed).sign({ key: keyPem, padding: PKCS1 }).toString('base64');
  const header = canonicalJson({
    cert_id: certId,
    payload_len: signed.length,
    sign_alg: 'RSA_SHA256',
    sign_string: signature,
    sign_ver: 'v1.0',
  });
  return '{"header":' + header + ',"print":' + value + '}';
}

/**
 * Prépare le contenu "print" pour la signature : injecte sequence_id (chaîne) et
 * remplace param/url par param_enc/url_enc chiffrés vers le cert imprimante.
 */
export function preparePrint(params, command, sequenceId, printerCertPem) {
  const printObj = { ...params, command, sequence_id: String(sequenceId) };
  if (printerCertPem && ['gcode_line', 'gcode_file', 'project_file'].includes(command)) {
    for (const field of ['param', 'url']) {
      if (typeof printObj[field] === 'string') {
        printObj[field + '_enc'] = encryptToPrinter(printerCertPem, printObj[field]);
        delete printObj[field];
      }
    }
  }
  return printObj;
}

/** Enveloppe `security.app_cert_install` (non signée) : installe la chaîne + CRL. */
export function buildCertInstall(chainPem, crlPem, sequenceId, timestampMs = Date.now()) {
  return JSON.stringify({
    security: {
      sequence_id: String(sequenceId),
      command: 'app_cert_install',
      timestamp: timestampMs,
      type: 'app',
      app_cert: chainPem,
      crl: crlPem,
    },
  });
}

/** Signataire prêt à l'emploi à partir des 3 PEM du coffre. */
export function createBambuSigner({ key, chain, crl }) {
  const certId = certIdFromChain(chain);
  return {
    revision: createHash('sha256').update(key).update(chain).update(crl).digest('hex'),
    certId,
    chain,
    crl,
    /** Enveloppe signée pour une commande print.*, avec param_enc si cert imprimante connu. */
    sign(params, command, sequenceId, printerCertPem) {
      const printObj = preparePrint(params, command, sequenceId, printerCertPem);
      return signPrint(printObj, certId, key);
    },
    install(sequenceId, timestampMs) {
      return buildCertInstall(chain, crl, sequenceId, timestampMs);
    },
  };
}
