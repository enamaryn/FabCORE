import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { MqttClient } from 'mqtt';
import type { Client } from 'basic-ftp';
import { createP2SFiles } from '../src/files.ts';
import { createP2SMonitor } from '../src/monitor.ts';

const machine = { id: 'p2s', origin: 'mqtts://192.168.1.50:8883', serial: 'TESTP2S123', accessCode: '12345678' };
const report = 'device/TESTP2S123/report';

function fakeClient() {
  const client = Object.assign(new EventEmitter(), {
    connected: true,
    published: [] as { topic: string; body: Record<string, Record<string, unknown>>; options: unknown }[],
    ended: 0,
    subscribe(_topic: string, done: (error: Error | null, grants: { qos: number }[]) => void) { done(null, [{ qos: 0 }]); },
    publish(topic: string, message: string, options?: unknown, done?: (error?: Error) => void) {
      client.published.push({ topic, body: JSON.parse(message), options });
      done?.();
    },
    end() { client.ended += 1; },
  });
  return client;
}

function monitorWith(client: ReturnType<typeof fakeClient>) {
  return createP2SMonitor({
    ca: Buffer.from(''),
    reportedControls: () => ({ heaters: [{ id: 'nozzle', current: 25 }, { id: 'bed', current: 24 }] }),
    bambuFilaments: () => null,
    connectPrinter: () => client as unknown as MqttClient,
  });
}

const push = (client: ReturnType<typeof fakeClient>, print: Record<string, unknown>, channel = 'print') =>
  client.emit('message', report, Buffer.from(JSON.stringify({ [channel]: print })));
const lastCommand = (client: ReturnType<typeof fakeClient>) => {
  const sent = client.published.at(-1)!;
  return Object.values(sent.body)[0]!;
};

test('P2S : refus de vérification signalé comme refus d’autorisation, effacé au premier succès', async () => {
  const client = fakeClient();
  const monitor = monitorWith(client);
  monitor.read(machine);
  client.emit('connect');
  push(client, { command: 'push_status', gcode_state: 'RUNNING' });

  const denied = monitor.command(machine, 'pause') as Promise<boolean>;
  const pause = lastCommand(client);
  assert.deepEqual(client.published.at(-1)!.options, { qos: 0, retain: false }, 'QoS 0 : aucun rejeu MQTT après reconnexion');
  push(client, { command: 'pause', sequence_id: pause.sequence_id, result: 'fail', reason: 'mqtt message verify failed' });
  await assert.rejects(denied, /bambu-authorization/);
  assert.equal(monitor.read(machine).controlIssue, 'bambu-authorization');
  assert.equal(monitor.read(machine).status, 'printing', 'un refus ne met pas la machine hors ligne');

  const other = monitor.command(machine, 'stop') as Promise<boolean>;
  push(client, { command: 'stop', sequence_id: lastCommand(client).sequence_id, result: 'fail', reason: 'busy' });
  assert.equal(await other, false, 'un autre refus reste un refus simple');

  const accepted = monitor.command(machine, 'resume') as Promise<boolean>;
  push(client, { command: 'resume', sequence_id: lastCommand(client).sequence_id, result: 'success' });
  assert.equal(await accepted, true);
  assert.equal(monitor.read(machine).controlIssue, undefined);
  monitor.close();
});

test('P2S : accusé non corrélé ignoré, aucune commande sans rapport et fermeture sans rejeu', async () => {
  const client = fakeClient();
  const monitor = monitorWith(client);
  monitor.read(machine);
  client.emit('connect');
  const before = client.published.length;
  await assert.rejects(monitor.command(machine, 'pause') as Promise<boolean>, /bambu-connection/);
  assert.equal(client.published.length, before, 'rien n’est publié avant un premier rapport');
  assert.equal(monitor.command(machine, 'start'), false, 'action hors périmètre refusée sans envoi');

  push(client, { command: 'push_status', gcode_state: 'PAUSE' });
  const pending = monitor.command(machine, 'resume') as Promise<boolean>;
  const { sequence_id } = lastCommand(client);
  push(client, { command: 'pause', sequence_id, result: 'success' });
  push(client, { command: 'resume', sequence_id: 'autre', result: 'success' });
  const sent = client.published.length;
  monitor.forget(machine.id);
  await assert.rejects(pending, /command-unconfirmed/);
  assert.equal(client.published.length, sent, 'aucune commande renvoyée à la fermeture');
  assert.equal(client.ended, 1);
});

test('P2S : inventaire FTPS racine et cache filtré, lancement par la session MQTT', async () => {
  const listed: string[] = [];
  let closed = 0;
  const ftp = {
    async access(options: { port: number; user: string; secure: string }) { assert.equal(options.port, 990); assert.equal(options.user, 'bblp'); assert.equal(options.secure, 'implicit'); },
    async list(directory: string) {
      listed.push(directory);
      return directory === '/'
        ? [{ name: 'cube.3mf', isFile: true, size: 12, modifiedAt: new Date(1000) }, { name: 'notes.txt', isFile: true, size: 1 }, { name: 'cache', isFile: false }]
        : [{ name: 'plate.gcode', isFile: true, size: 5, modifiedAt: undefined }];
    },
    close() { closed += 1; },
  };
  const sent: unknown[] = [];
  const files = createP2SFiles(async (_machine, command, params) => { sent.push([command, params]); return true; },
    { ca: Buffer.from(''), productionPath: (path: string) => /\.(3mf|gcode)$/.test(path) }, () => ftp as unknown as Client);
  assert.deepEqual(await files.list(machine), [
    { path: 'cube.3mf', size: 12, modified: 1000 },
    { path: 'cache/plate.gcode', size: 5, modified: null },
  ]);
  assert.deepEqual(listed, ['/', '/cache']);
  assert.equal(closed, 1);
  await files.start(machine, 'cache/plate.gcode');
  await files.start(machine, 'cube.3mf', 'Metadata/plate_1.gcode');
  assert.deepEqual(sent[0], ['gcode_file', { param: '/cache/plate.gcode' }]);
  const [command, params] = sent[1] as [string, Record<string, unknown>];
  assert.equal(command, 'project_file');
  assert.equal(params.url, 'ftp:///cube.3mf');
  assert.equal(params.use_ams, false, 'aucun mapping AMS automatique');
});
