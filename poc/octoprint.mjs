// Adaptateur POC : une seule implémentation OctoPrint, dans le connecteur TypeScript.
import { createOctoPrintServices } from '../connectors/octoprint/src/index.ts';
import { encodePath, filePath, moonrakerOrigin, multipart, readResponse } from './connector-http.mjs';

export const { readOctoPrint, createOctoPrintFiles, commandOctoPrint, sendOctoPrintGcode } =
  createOctoPrintServices({ encodePath, filePath, validOrigin: moonrakerOrigin, multipart, readResponse });
