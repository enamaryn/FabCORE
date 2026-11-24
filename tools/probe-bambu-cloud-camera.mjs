#!/usr/bin/env node
// Read-only bounded lab probe. No production configuration write or manufacturing command.
// Uses only FabCore's own JSON account storage, never Bambu Studio data. Prints no credentials or frames.
import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(process.env.FABCORE_CHECKOUT || '/opt/fabcore');
const directory = resolve(process.env.FABCORE_DATA || '/var/lib/fabcore');
const host = process.argv[2];
if (!host || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d/.test(host) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.split('.').some(n => Number(n) > 255)) throw new Error('Supply the authorized private printer IPv4');
const state = JSON.parse(readFileSync(resolve(directory, 'state.json'), 'utf8'));
const matches = state.machines.filter(m => m.kind === 'bambu-cloud' && (process.argv[3] ? m.id === process.argv[3] : /P2S/.test(m.model)));
if (matches.length !== 1) throw new Error('Select one Cloud machine by its FabCore ID');
const machine = matches[0], account = state.cloudAccounts?.find(a => a.id === machine.cloudAccountId && a.provider === 'bambu' && a.status === 'connected' && a.devices?.some(d => d.serial === machine.serial));
if (!account?.secret) throw new Error('No authorized FabCore Cloud account');
const raw = Buffer.from(account.secret, 'base64');
const decipher = createDecipheriv('aes-256-gcm', readFileSync(resolve(directory, 'cloud-secret.key')), raw.subarray(0, 12));
decipher.setAAD(Buffer.from(account.id)); decipher.setAuthTag(raw.subarray(-16));
let token = Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]).toString();
const response = await fetch('https://api.bambulab.' + (account.region === 'china' ? 'cn' : 'com') + '/v1/iot-service/api/user/bind', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': 'FabCore/POC' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
token = '';
if (!response.ok) { console.log(JSON.stringify({ phase: 'inventory', httpStatus: response.status })); process.exit(2); }
const inventory = await response.json(); const device = inventory.devices?.find(d => d.dev_id === machine.serial);
if (!/^[A-Za-z0-9]{8}$/.test(device?.dev_access_code ?? '')) { console.log(JSON.stringify({ phase: 'inventory', cameraCredentialAvailable: false })); process.exit(2); }
const connection = { id: machine.id, serial: machine.serial, origin: 'mqtts://' + host + ':8883', accessCode: device.dev_access_code };
device.dev_access_code = ''; inventory.devices = [];
let frames = 0, bytes = 0, timer, headersReceived = false;
const abort = new AbortController(); const total = setTimeout(() => abort.abort(), 22000);
const start = performance.now(), cpu = process.cpuUsage();
const output = new Writable({ write(chunk, _encoding, done) { bytes += chunk.length; done(); } });
output.writeHead = () => { headersReceived = true; };
const { streamBambuCamera } = await import(pathToFileURL(resolve(root, 'poc/bambu-camera.mjs')).href);
try { await streamBambuCamera(connection, output, abort.signal, () => { frames++; if (frames === 1) timer = setTimeout(() => abort.abort(), 8000); }); }
catch { /* Cancellation and errors are deliberately sanitized. Frame count is the success criterion. */ }
finally { clearTimeout(total); clearTimeout(timer); connection.accessCode = ''; }
const elapsedMs = Math.round(performance.now() - start), used = process.cpuUsage(cpu);
console.log(JSON.stringify({ revision: execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(), source: 'lan', transport: 'rtsps', tlsValidation: 'CA-and-serial', headersReceived, frames, bytes, elapsedMs, parentCpuMs: Math.round((used.user + used.system) / 1000), parentMaxRssKiB: process.resourceUsage().maxRSS, fabricationCommands: 0, productionConfigChanged: false, note: 'Standalone bounded probe, not a FabCore browser validation; child FFmpeg CPU/RAM not included' }));
process.exitCode = frames ? 0 : 2;
