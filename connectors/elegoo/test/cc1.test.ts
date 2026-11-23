import test from 'node:test';
import assert from 'node:assert/strict';
import { commandElegooCC1, readElegooCC1, readElegooCC1Status, requestElegooCC1 } from '../src/cc1.ts';
import { createElegooFileServices, stagedUpload } from '../src/upload.ts';
import { Readable } from 'node:stream';
import { access, readFile } from 'node:fs/promises';

const machine = { origin: 'ws://192.168.1.42:3030', serial: 'CC1TEST42', accessCode: '' };

test('CC1 : accusé corrélé au numéro de série, RequestID et Cmd ; fermeture sans rejeu', async () => {
  let closes = 0, sends = 0;
  class Socket extends EventTarget {
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    close() { closes++; this.dispatchEvent(new Event('close')); }
    send(payload: string) {
      sends++;
      const data = JSON.parse(payload) as { Data: { RequestID: string; Cmd: number } };
      assert.equal(data.Data.Cmd, 129);
      const deliver = (Topic: string, RequestID: string, Cmd: number, Ack: number) => this.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ Topic, Data: { RequestID, Cmd, Data: { Ack } } }),
      }));
      deliver('sdcp/response/OTHER01', data.Data.RequestID, 129, 1);
      deliver('sdcp/response/' + machine.serial, 'old-request', 129, 1);
      deliver('sdcp/response/' + machine.serial, data.Data.RequestID, 130, 1);
      deliver('sdcp/response/' + machine.serial, data.Data.RequestID, 129, 0);
    }
  }
  assert.equal(await commandElegooCC1(machine, 'pause', { Socket }), true);
  assert.equal(sends, 1); assert.equal(closes, 1);
  assert.equal(commandElegooCC1(machine, 'unsupported', { Socket }), false);
  assert.equal(await requestElegooCC1({ ...machine, serial: '!' }, 129, {}, { Socket }), false);
  assert.equal(sends, 1);
  class Lost extends Socket { override send(_payload: string) { sends++; this.dispatchEvent(new Event('error')); } }
  await assert.rejects(requestElegooCC1(machine, 130, {}, { Socket: Lost }), /command-unconfirmed/);
  assert.equal(sends, 2); assert.equal(closes, 2);
});

test('CC1 : annulation de lecture ferme le socket et retire son abonnement', async () => {
  const controller = new AbortController(); let closed = 0;
  class Socket extends EventTarget {
    constructor(_url: string) { super(); queueMicrotask(() => controller.abort()); }
    send(_payload: string) { assert.fail('Annulation avant ouverture'); }
    close() { closed++; this.dispatchEvent(new Event('close')); }
  }
  assert.deepEqual(await readElegooCC1(machine, { Socket, signal: controller.signal }), {
    status: 'offline', issue: 'cc1-connection', nozzle: null, bed: null, progress: 0, file: '', serial: machine.serial,
  });
  assert.equal(closed, 1);
});

test('CC1 : transfert segmenté natif, aucun lancement implicite, refus sans rejeu', async () => {
  const chunks: Uint8Array[] = []; let calls = 0, starts = 0;
  const createFiles = createElegooFileServices({ filePath: () => false, privateIPv4: () => true,
    readResponse: response => response.json() as Promise<unknown> });
  const bytes = Buffer.alloc(1024 * 1024 + 17, 65);
  const files = createFiles(async (_machine, cmd, params) => {
    starts++; assert.equal(cmd, 128); assert.equal(params.Filename, 'part.gcode'); return true;
  }, { cc1: true, fetcher: async (url, options) => {
    calls++; assert.equal(url, 'http://192.168.1.42:3030/uploadFile/upload');
    assert.equal(options?.method, 'POST'); assert.equal(options.redirect, 'error');
    const form = options.body as FormData;
    assert.equal(form.get('Offset'), calls === 1 ? '0' : String(1024 * 1024));
    assert.equal(form.get('TotalSize'), String(bytes.length));
    chunks.push(new Uint8Array(await (form.get('File') as Blob).arrayBuffer()));
    return Response.json({ code: '000000' });
  } });
  assert.equal(await files.upload(machine, 'part.gcode', Readable.from([bytes]), bytes.length), 'part.gcode');
  assert.deepEqual(Buffer.concat(chunks), bytes); assert.equal(calls, 2); assert.equal(starts, 0);
  assert.equal(await files.start(machine, 'part.gcode'), true); assert.equal(starts, 1);
  let refused = 0;
  const failed = createFiles(async () => assert.fail(), { cc1: true, fetcher: async () => { refused++; return Response.json({ code: 'refused' }); } });
  assert.equal(await failed.upload(machine, 'part.gcode', Readable.from([bytes]), bytes.length), null);
  assert.equal(refused, 1);
});

test('Elegoo : le staging supprime le temporaire après erreur du transport', async () => {
  let staged = '';
  await assert.rejects(stagedUpload(Readable.from([Buffer.from('G1 X1\n')]), 6, async path => {
    staged = path; assert.equal(await readFile(path, 'utf8'), 'G1 X1\n'); throw new Error('transport-lost');
  }), /transport-lost/);
  assert.ok(staged); await assert.rejects(access(staged));
  let called = false;
  await assert.rejects(stagedUpload(Readable.from([Buffer.from('short')]), 7, async () => { called = true; }), /upload-truncated/);
  assert.equal(called, false);
});

test('CC1 : rapport SDCP brut relu pour les contrôles manuels, résumé inchangé', async () => {
  const status = { PrintInfo: { Status: 0, Progress: 0, Filename: '' }, TempOfNozzle: 25, TempTargetNozzle: 0, TempOfHotbed: 22, TempTargetHotbed: 0,
    CurrentFanSpeed: { ModelFan: 0, AuxiliaryFan: 0, BoxFan: 40 }, LightStatus: { SecondLight: 1 } };
  class Socket extends EventTarget {
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    close() { this.dispatchEvent(new Event('close')); }
    send(_payload: string) {
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ Topic: 'sdcp/status/' + machine.serial, Status: status }) })));
    }
  }
  assert.deepEqual(await readElegooCC1Status(machine, { Socket }), status);
  assert.deepEqual(await readElegooCC1(machine, { Socket }), { status: 'ready', issue: null, nozzle: 25, bed: 22, progress: 0, file: '', serial: machine.serial });
});
