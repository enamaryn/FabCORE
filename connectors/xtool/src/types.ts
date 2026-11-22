import type { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';

export type XToolStatus = 'connecting' | 'ready' | 'printing' | 'paused' | 'done' | 'error' | 'offline';
export interface XToolConnection {
  origin: string;
  serial?: string;
  fingerprint?: string;
  pairingToken?: string;
}
export interface XToolMachine extends XToolConnection { id: string }
export interface XToolSnapshot {
  status: XToolStatus;
  issue: string | null;
  nozzle: null;
  bed: null;
  progress: number;
  file: string;
  serial?: string;
  fingerprint?: string | undefined;
  pairingToken?: string;
  checkedAt?: string;
}
export type XToolIdentity = { serial: string; fingerprint: string | undefined } | { candidate: true };
export type XToolReadResult = XToolSnapshot | XToolIdentity;
/** Transport structurel : le constructeur ws et les doubles de test restent injectables. */
export interface XToolSocket extends EventEmitter {
  send(data: Buffer): void;
  terminate(): void;
}
export interface XToolSocketOptions {
  rejectUnauthorized: boolean;
  followRedirects: boolean;
  origin: string;
  handshakeTimeout: number;
  maxPayload: number;
}
export type XToolSocketConstructor = new (url: URL, options: XToolSocketOptions) => XToolSocket;
export interface XToolUpgrade {
  socket: { getPeerCertificate(): { fingerprint256?: string } };
}
export interface XToolSession {
  url: URL;
  fingerprint: string | undefined;
  Socket: XToolSocketConstructor;
  request<T = unknown>(method: string, path: string, data?: Record<string, unknown>, params?: Record<string, unknown>): Promise<T>;
}
export interface XToolReadOptions {
  signal?: AbortSignal;
  identityOnly?: boolean;
  pairing?: boolean;
  onStatus?(state: XToolReadResult): void;
  onReady?(session: XToolSession): void;
  Socket?: XToolSocketConstructor;
}
export interface XToolCamera { id: number; name: string; fps?: number }
export type XToolGetSession = () => XToolSession | null | undefined;
export interface XToolCameraServices {
  snapshotXToolCamera(getSession: XToolGetSession, signal: AbortSignal, view?: string): Promise<Buffer>;
  streamXToolCamera(getSession: XToolGetSession, output: ServerResponse, signal: AbortSignal, onFrame: () => void, view?: string): Promise<'invalid-stream' | undefined>;
}
/** Helpers/projections partagés du POC fournis uniquement par composition. */
export interface XToolPorts extends XToolCameraServices {
  privateIPv4(host: string): boolean;
  Socket: XToolSocketConstructor;
}
export interface XToolImagePorts {
  observeImages(stream: AsyncIterable<Buffer>, onFrame: () => void): AsyncIterable<Buffer>;
}
export interface XToolDiscovery { kind: 'xtool-m2'; host: string; serial: string }
