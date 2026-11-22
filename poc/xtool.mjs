// Composition POC : le protocole M2 est implémenté une seule fois en TypeScript.
import WebSocket from 'ws';
import { createXToolServices } from '../connectors/xtool/src/monitor.ts';
import { privateIPv4 } from './connector-http.mjs';
import { snapshotXToolCamera, streamXToolCamera } from './xtool-camera.mjs';

export const { readXTool, createXToolMonitor } = createXToolServices({
  Socket: WebSocket, privateIPv4, snapshotXToolCamera, streamXToolCamera
});
