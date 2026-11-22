// Compatibilité POC : les fichiers P2S (FTPS) sont implémentés une seule fois en TypeScript.
import { readFileSync } from 'node:fs';
import { createP2SFiles } from '../connectors/bambu/src/files.ts';
import { productionPath } from './production-files.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));

export function createBambuFiles(send, makeClient) {
  return createP2SFiles(send, { ca, productionPath }, ...(makeClient ? [makeClient] : []));
}
