import WebSocket from 'ws';
import { privateIPv4 } from './connector-http.mjs';
import { createRay5Services } from '../connectors/longer/src/monitor.ts';
export const { ray5Target, parseRay5Status, createRay5Monitor } = createRay5Services({ privateIPv4,
  openWS: url => new WebSocket(url, 'arduino', { maxPayload: 8192, handshakeTimeout: 3500, followRedirects: false }) });
