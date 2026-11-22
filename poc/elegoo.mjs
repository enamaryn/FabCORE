// Compatibilité POC : la session et le protocole CC2 sont implémentés une seule fois en TypeScript.
import { createCC2Services } from '../connectors/elegoo/src/monitor.ts';
import { reportedControls } from './manual-controls.mjs';
import { canvasFilaments } from './filaments.mjs';
import { readResponse } from './connector-http.mjs';

export const { elegooClientId, identifyElegoo, readElegoo, createElegooMonitor } =
  createCC2Services({ reportedControls, canvasFilaments, readResponse });
