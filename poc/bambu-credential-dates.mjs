import { X509Certificate } from 'node:crypto';

// Informational DER date reader only: never validates trust or blocks PEM import.
function element(bytes, offset = 0) {
  const tag = bytes[offset++]; let size = bytes[offset++];
  if (tag === undefined || size === undefined) throw new Error('der');
  if (size & 128) {
    const count = size & 127; if (!count || count > 4 || offset + count > bytes.length) throw new Error('der');
    size = 0; for (let i = 0; i < count; i++) size = size * 256 + bytes[offset++];
  }
  if (offset + size > bytes.length) throw new Error('der');
  return { tag, body: bytes.subarray(offset, offset + size), end: offset + size };
}
function time(field) {
  const text = field.body.toString('ascii');
  const value = field.tag === 23 && /^\d{12}Z$/.test(text)
    ? (Number(text.slice(0, 2)) >= 50 ? '19' : '20') + text : field.tag === 24 && /^\d{14}Z$/.test(text) ? text : null;
  if (!value) throw new Error('date');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`;
  const date = new Date(iso); if (date.toISOString() !== iso) throw new Error('date');
  return iso;
}
export function credentialDates(chain, crl) {
  let certificateExpiresAt = null, crlExpiresAt = null;
  try {
    const certs = chain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    const dates = certs.map(cert => new Date(new X509Certificate(cert).validTo).toISOString());
    if (dates.length) certificateExpiresAt = dates.sort()[0];
  } catch { /* Unreadable metadata is not an import error. */ }
  try {
    const blocks = [...crl.matchAll(/-----BEGIN X509 CRL-----([\s\S]*?)-----END X509 CRL-----/g)];
    const dates = blocks.map(([, content]) => {
      const outer = element(Buffer.from(content.replace(/\s/g, ''), 'base64'));
      const tbs = element(outer.body); if (outer.tag !== 48 || tbs.tag !== 48) throw new Error('crl');
      const fields = []; for (let at = 0; at < tbs.body.length;) { const field = element(tbs.body, at); fields.push(field); at = field.end; }
      const start = fields[0]?.tag === 2 ? 1 : 0;
      if (fields[start]?.tag !== 48 || fields[start + 1]?.tag !== 48) throw new Error('crl');
      time(fields[start + 2]);
      return time(fields[start + 3]);
    });
    if (dates.length) crlExpiresAt = dates.sort()[0];
  } catch { /* A CRL can omit nextUpdate; unknown remains explicit. */ }
  return { certificateExpiresAt, crlExpiresAt };
}
