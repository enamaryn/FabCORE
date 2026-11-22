// Adaptateur POC : une seule implémentation PrusaLink, dans le connecteur TypeScript.
import { createPrusaLinkServices } from '../connectors/prusalink/src/index.ts';
import { encodePath, filePath, moonrakerOrigin, readResponse } from './connector-http.mjs';

export const { readPrusaLink, createPrusaOperations } =
  createPrusaLinkServices({ encodePath, filePath, validOrigin: moonrakerOrigin, readResponse });
