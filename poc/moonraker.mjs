// Adaptateur POC : une seule implémentation Moonraker, dans le connecteur TypeScript.
import { createMoonrakerServices } from '../connectors/moonraker/src/index.ts';
import { encodePath, filePath, moonrakerOrigin, multipart, readResponse } from './connector-http.mjs';
export { privateIPv4, moonrakerOrigin, readResponse } from './connector-http.mjs';

export const { readMoonraker, commandMoonraker, emergencyStopMoonraker, createMoonrakerFiles, sendMoonrakerGcode, moonrakerWebcam } =
  createMoonrakerServices({ encodePath, filePath, validOrigin: moonrakerOrigin, multipart, readResponse });
