// Test-only preload. Prevent fixture addresses from becoming real printer/network access.
// No production module imports this file. Spawned external programs are outside this Node guard.
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const loopback = host => ['localhost', '127.0.0.1', '::1'].includes(host);
function deny(host) {
  process.exitCode = 1;
  process.stderr.write('TEST_NETWORK_BLOCKED: inject a transport instead of connecting to ' + String(host).slice(0, 128) + '\n');
  throw Object.assign(new Error('test-network-isolated'), { code: 'TEST_NETWORK_BLOCKED' });
}
function httpHost(input) {
  if (typeof input === 'string' || input instanceof URL) return new URL(input).hostname.replace(/^\[|\]$/g, '');
  if (input && typeof input.url === 'string') return new URL(input.url).hostname.replace(/^\[|\]$/g, '');
  return input?.hostname ?? input?.host ?? 'localhost';
}
// Check the destination before an environment HTTP proxy can translate it into a loopback socket.
const fetcher = globalThis.fetch;
globalThis.fetch = function (input, ...args) { const host = httpHost(input); if (!loopback(host)) deny(host); return fetcher(input, ...args); };
for (const module of [http, https]) for (const method of ['request', 'get']) {
  const original = module[method];
  module[method] = function (...args) { const host = httpHost(args[0]); if (!loopback(host)) deny(host); return original.apply(this, args); };
}
const tcp = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof value === 'object' && value !== null && typeof value.path === 'string') return tcp.apply(this, args); // Unix socket, no IP traffic.
  const host = typeof value === 'object' && value !== null ? value.host ?? 'localhost' : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (!loopback(host)) deny(host);
  return tcp.apply(this, args);
};
const send = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function (...args) {
  const address = args.slice(1).filter(value => typeof value === 'string').at(-1) ?? 'localhost';
  if (!loopback(address)) deny(address);
  return send.apply(this, args);
};
const udp = dgram.Socket.prototype.connect;
dgram.Socket.prototype.connect = function (...args) {
  const address = typeof args[1] === 'string' ? args[1] : 'localhost';
  if (!loopback(address)) deny(address);
  return udp.apply(this, args);
};
syncBuiltinESMExports();
