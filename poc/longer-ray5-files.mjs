import { ray5Target } from './longer-ray5.mjs';
import { readResponse } from './connector-http.mjs';
import { createRay5FileServices } from '../connectors/longer/src/files.ts';
export const { ray5Path, createRay5Files } = createRay5FileServices({ ray5Target, readResponse });
