import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { discoverXTool } from './xtool-discovery.mjs';
import { test } from 'node:test';
import { detectMoonraker, detectOctoPrint, discoveryNetworks, reconcileDiscovery, scanNetwork } from './discovery.mjs';

test('les réseaux sont locaux, privés, et plafonnés à une tranche /24', () => {
  const ipv4 = (address, cidr, internal = false) => ({ address, cidr, internal, family: 'IPv4' });
  const local = discoveryNetworks({
    lo: [ipv4('127.0.0.1', '127.0.0.1/8', true)],
    eth: [ipv4('192.168.1.22', '192.168.1.22/16'), ipv4('192.168.1.23', '192.168.1.23/16')],
    vpn: [ipv4('10.0.0.66', '10.0.0.66/26')],
    public: [ipv4('203.0.113.1', '203.0.113.1/24')]
  });
  assert.deepEqual(local.map(({ cidr, own }) => [cidr, own]), [
    ['192.168.1.0/24', ['192.168.1.22', '192.168.1.23']], ['10.0.0.64/26', ['10.0.0.66']]
  ]);
});

test('le scan ignore le serveur, l’adresse réseau et le broadcast', async () => {
  const [network] = discoveryNetworks({ eth: [{ family: 'IPv4', address: '192.168.1.1', cidr: '192.168.1.1/29' }] });
  const scanned = [];
  const devices = await scanNetwork(network, new AbortController().signal, {
    inspectHost: async (host) => {
      scanned.push(host);
      if (host.endsWith('.6')) return [{ host, kind: 'bambu' }];
      return host.endsWith('.3') ? [{ host, kind: 'xtool-m2', candidate: true }] : [];
    },
    broadcast: async () => [{ host: '192.168.1.4', kind: 'elegoo-cc1' }],
    xtoolDiscovery: async (hosts, localAddress) => {
      assert.equal(localAddress, '192.168.1.1');
      assert.deepEqual(hosts, [2, 3, 4, 5, 6].map(host => '192.168.1.' + host));
      return [{ host: '192.168.1.3', kind: 'xtool-m2', serial: 'M2TEST01' }];
    }
  });
  assert.deepEqual(scanned, [2, 3, 4, 5, 6].map((host) => '192.168.1.' + host));
  assert.deepEqual(devices.map(({ kind }) => kind), ['xtool-m2', 'elegoo-cc1', 'bambu']);
  assert.deepEqual(devices[0], { host: '192.168.1.3', kind: 'xtool-m2', serial: 'M2TEST01' });
});

test('le scan reconnaît OctoPrint au login sans clé ni imprimante connectée', async () => {
  const addresses = [];
  const fetcher = async (url, options) => {
    addresses.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return new Response(url.includes(':5000') ? '<title>OctoPrint Login</title>' : '<title>Connexion</title>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await detectOctoPrint('192.168.1.85', signal, fetcher), [
    { kind: 'octoprint', host: '192.168.1.85', origin: 'http://192.168.1.85:5000' }
  ]);
  assert.deepEqual(addresses, ['http://192.168.1.85:5000/login/', 'http://192.168.1.85/login/']);
  assert.deepEqual(await detectOctoPrint('1.1.1.1', signal, assert.fail), []);
});

test('le scan distingue les machines reconnues des machines déjà ajoutées non détectées', () => {
  const [network] = discoveryNetworks({ eth0: [{ family: 'IPv4', address: '192.168.1.10', cidr: '192.168.1.10/24' }] });
  const machines = [
    { id: '1', kind: 'bambu', name: 'P2S', origin: 'mqtts://192.168.1.21:8883', serial: 'BAMBUSERIAL', accessCode: 'secret' },
    { id: '2', kind: 'elegoo', name: 'CC2', origin: 'mqtt://192.168.1.22:1883', apiKey: 'secret' },
    { id: '3', kind: 'octoprint', name: 'Autre réseau', origin: 'http://192.168.2.20:5000' }
  ];
  const found = [{ kind: 'bambu', host: '192.168.1.23', serial: 'bambuserial' }];
  assert.deepEqual(reconcileDiscovery(network, found, machines), [
    { kind: 'elegoo', host: '192.168.1.22', name: 'CC2', registered: true, detected: false },
    { ...found[0], registered: true, name: 'P2S' }
  ]);
});

test('la découverte xTool valide le modèle, le sous-réseau et la requête', async () => {
  const socket = new EventEmitter();
  const abort = new AbortController();
  const host = '192.168.1.12';
  let closes = 0;
  socket.close = () => { closes++; };
  socket.bind = (_port, _address, ready) => queueMicrotask(ready);
  socket.send = (packet, port) => {
    if (port !== 25353) return;
    const iv = packet.subarray(0, 16);
    const decoder = createDecipheriv('aes-256-cbc', 'makeblockmakeblockmakeblock-2025', iv);
    const { data } = JSON.parse(Buffer.concat([decoder.update(packet.subarray(16)), decoder.final()]));
    const reply = (address, fields) => {
      const encoder = createCipheriv('aes-256-cbc', data.key, iv);
      const body = JSON.stringify({ type: 'deviceFind', method: 'response', data: fields });
      socket.emit('message', Buffer.concat([iv, encoder.update(body), encoder.final()]), { address });
    };
    const valid = { requestId: data.requestId, deviceCode: 'JS002', deviceSn: 'M2TEST01' };
    reply(host, valid);
    reply(host, { ...valid, requestId: valid.requestId + 1, deviceSn: 'WRONG01' });
    reply(host, { ...valid, deviceCode: 'GS003', deviceSn: 'WRONG02' });
    reply('192.168.1.13', valid);
    queueMicrotask(() => abort.abort());
  };
  assert.deepEqual(await discoverXTool([host], '192.168.1.1', abort.signal, () => socket),
    [{ host, kind: 'xtool-m2', serial: 'M2TEST01' }]);
  assert.equal(closes, 1);
});

test('Moonraker : après détection initiale, découvre chaque instance de la même IP avec son nom', async () => {
  const calls = []; const signal = new AbortController().signal;
  const devices = await detectMoonraker('192.168.1.176', signal, async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error');
    const port = Number(new URL(url).port);
    if (url.includes('/server/database/')) return Response.json({ result: { value: port === 7125 ? 'Ender 3 V2 MGN' : 'Tevo Tarantula Pro' } });
    return [7125, 7126].includes(port) ? Response.json({ result: { moonraker_version: '0.9', klippy_state: 'error' } }) : Response.json({ result: {} });
  });
  assert.deepEqual(devices, [
    { kind: 'klipper', host: '192.168.1.176', origin: 'http://192.168.1.176:7125', name: 'Ender 3 V2 MGN' },
    { kind: 'klipper', host: '192.168.1.176', origin: 'http://192.168.1.176:7126', name: 'Tevo Tarantula Pro' }
  ]);
  assert.equal(calls[0], 'http://192.168.1.176:7125/server/info');
  assert.equal(calls.filter(url => url.endsWith('/server/info')).length, 10);
});
test('Moonraker : aucun balayage supplémentaire sur un hôte non reconnu, ni hôte public', async () => {
  let calls = 0; const fetcher = async () => { calls++; return Response.json({ result: { version: 'unrelated' } }); };
  assert.deepEqual(await detectMoonraker('192.168.1.1', new AbortController().signal, fetcher), []); assert.equal(calls, 1);
  assert.deepEqual(await detectMoonraker('8.8.8.8', new AbortController().signal, assert.fail), []);
});
test('Moonraker : port personnalisé déjà enregistré et nom absent ne bloquent pas la découverte', async () => {
  const devices = await detectMoonraker('192.168.1.176', new AbortController().signal, async url => {
    if (url === 'http://192.168.1.176:9000/server/info') return Response.json({ result: { moonraker_version: '0.9' } });
    return new Response('', { status: 404 });
  }, ['http://192.168.1.176:9000', 'http://8.8.8.8:9000', 'http://secret:password@192.168.1.176:7127']);
  assert.deepEqual(devices, [{ kind: 'klipper', host: '192.168.1.176', origin: 'http://192.168.1.176:9000' }]);
});
test('Moonraker : rapprochement par origine complète, pas seulement par IP', () => {
  const network = { start: 3232235776, end: 3232236031 };
  const found = [7125,7126].map(port => ({ kind: 'klipper', host: '192.168.1.176', origin: `http://192.168.1.176:${port}` }));
  const registered = [{ id: 'ender', kind: 'klipper', name: 'Ender', origin: found[0].origin }];
  const devices = reconcileDiscovery(network, found, registered);
  assert.equal(devices.length, 2); assert.equal(devices[0].registered, true); assert.equal(devices[1].registered, false);
  assert.equal(devices[0].name, 'Ender');
});
