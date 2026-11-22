// Compatibilité POC : la session et le protocole P2S LAN sont implémentés une seule fois en TypeScript.
import { readFileSync } from 'node:fs';
import { createP2SMonitor } from '../connectors/bambu/src/monitor.ts';
import { reportedControls } from './manual-controls.mjs';
import { bambuFilaments } from './filaments.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));

export function createBambuMonitor(connectPrinter, diagnostics) {
  return createP2SMonitor({ ca, reportedControls, bambuFilaments, ...(connectPrinter ? { connectPrinter } : {}), diagnostics });
}
