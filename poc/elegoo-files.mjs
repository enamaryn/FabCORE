import { createElegooFileServices } from '../connectors/elegoo/src/upload.ts';
import { filePath, privateIPv4, readResponse } from './connector-http.mjs';
export { stagedUpload } from '../connectors/elegoo/src/upload.ts';
export const createElegooFiles = createElegooFileServices({ filePath, privateIPv4, readResponse });
