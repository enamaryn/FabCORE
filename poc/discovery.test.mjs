import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectOctoPrint, discoveryNetworks, scanNetwork } from './discovery.mjs';

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
      return host.endsWith('.6') ? [{ host, kind: 'bambu' }] : [];
    },
    broadcast: async () => [{ host: '192.168.1.4', kind: 'elegoo-cc1' }]
  });
  assert.deepEqual(scanned, [2, 3, 4, 5, 6].map((host) => '192.168.1.' + host));
  assert.deepEqual(devices.map(({ kind }) => kind), ['elegoo-cc1', 'bambu']);
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
