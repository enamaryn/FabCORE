import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectorCatalog, createConnectorRegistry } from './connectors.mjs';
import { readPrusaLink } from './prusalink.mjs';

test('le registre charge un connecteur à la demande, une fois par instance', async () => {
  const loads = [];
  const closed = [];
  const registry = createConnectorRegistry({}, kind => ({
    load() {
      loads.push(kind);
      return { close: () => closed.push(kind) };
    }
  }));
  assert.deepEqual(loads, []);
  const [first, second] = await Promise.all([registry.get('octoprint'), registry.get('octoprint')]);
  assert.equal(first, second);
  assert.deepEqual(loads, ['octoprint']);
  await registry.get('prusalink');
  assert.deepEqual(loads, ['octoprint', 'prusalink']);
  registry.close();
  assert.deepEqual(closed, loads);
});

test('PrusaLink lit le statut local et le fichier actif sans suivre de redirection', async () => {
  const origin = 'http://192.168.1.34';
  const visited = [];
  const result = await readPrusaLink({ origin, apiKey: 'test-key' }, { fetcher: async (url, request) => {
    assert.equal(request.headers['X-Api-Key'], 'test-key');
    assert.equal(request.redirect, 'error');
    assert.equal(request.method, 'GET');
    visited.push(url);
    return url.endsWith('/status')
      ? Response.json({ printer: { state: 'PRINTING', temp_nozzle: 210.4, temp_bed: 60.5 }, job: { id: 7, progress: 63.6 } })
      : Response.json({ file: { display_name: 'support.bgcode' } });
  } });
  assert.deepEqual(result, { status: 'printing', issue: null, nozzle: 210.4, bed: 60.5, progress: 64, file: 'support.bgcode' });
  assert.deepEqual(visited, [origin + '/api/v1/status', origin + '/api/v1/job']);
  assert.equal(connectorCatalog.prusalink.temperatures, true);
  assert.equal(connectorCatalog.prusalink.commands, true);
  const denied = await readPrusaLink({ origin, apiKey: 'invalid' }, { fetcher: async () => new Response(null, { status: 401 }) });
  assert.equal(denied.issue, 'prusalink-access');
});

test('P2S : terminal par gcode_line, accepté sans sortie, refus d’autorisation explicite, origine oubliée', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-p2s-terminal-'));
  const sent = [];
  let refuse = null;
  const bambu = {
    read: () => ({ status: 'ready' }), probe: async () => ({ ok: true }), close() {},
    controlState: () => ({ lights: [], heaters: [], fans: [], motion: null }),
    send: async (_machine, command, params) => { sent.push([command, params.param]); if (refuse) throw new Error(refuse); return true; },
  };
  const registry = createConnectorRegistry({ bambu, directory });
  try {
    const connector = await registry.get('bambu');
    const machine = { id: 'p2s', origin: 'mqtts://192.168.1.50:8883', serial: 'P2STEST01', accessCode: '12345678' };
    await connector.control.execute(machine, { action: 'home' }, await connector.control.read(machine));
    assert.deepEqual((await connector.control.read(machine)).motion.axes, ['X', 'Y', 'Z']);
    assert.deepEqual(await connector.gcode(machine, 'M105'), { outcome: 'accepted', responses: null });
    assert.deepEqual(sent.at(-1), ['gcode_line', 'M105\n']);
    assert.deepEqual((await connector.control.read(machine)).motion.axes, [], 'toute commande du terminal oublie l’origine');
    refuse = 'bambu-authorization';
    assert.deepEqual(await connector.gcode(machine, 'M105'), { outcome: 'rejected', message: 'bambu-authorization' });
    refuse = 'command-unconfirmed';
    await assert.rejects(connector.gcode(machine, 'M105'), /command-unconfirmed/, 'réponse perdue : inconnue, jamais renvoyée');
    assert.equal(sent.filter(([, line]) => line === 'M105\n').length, 3);
    assert.equal(connectorCatalog.bambu.terminal, true);
  } finally { registry.close(); await rm(directory, { recursive: true, force: true }); }
});
