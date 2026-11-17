import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';
import { createSocket } from 'node:dgram';

// Shared discovery constants documented by ha-xtool. They are separate from
// device authorization and provide no proof of identity for enrollment.
const requestKey = 'makeblockmakeblockmakeblock-2025';
const replyKey = 'makeblocsdbfjssjkkejqbcsdjfbqlla';
const ports = [25353, 25454];

export function discoverXTool(hosts, localAddress, signal, openSocket = () => createSocket('udp4')) {
  if (!hosts.length || signal.aborted) return Promise.resolve([]);
  const targets = new Set(hosts);
  const requestId = randomInt(1, 2 ** 30);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', requestKey, iv);
  const request = JSON.stringify({
    type: 'deviceFind',
    method: 'request',
    data: { version: '1.0', clientType: 'atomnClient', requestId, key: replyKey }
  });
  const frame = Buffer.concat([iv, cipher.update(request), cipher.final()]);

  return new Promise(resolve => {
    const socket = openSocket();
    const found = new Map();
    let ended = false;
    const timer = setTimeout(finish, 1700);
    function finish() {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      socket.close();
      resolve([...found.values()]);
    }
    socket.on('error', finish);
    socket.on('message', (packet, peer) => {
      if (!targets.has(peer.address) || packet.length < 32 || packet.length > 8192 || packet.length % 16) return;
      try {
        const decipher = createDecipheriv('aes-256-cbc', replyKey, packet.subarray(0, 16));
        const { type, method, data } = JSON.parse(Buffer.concat([
          decipher.update(packet.subarray(16)), decipher.final()
        ]));
        if (type !== 'deviceFind' || method !== 'response' || data?.requestId !== requestId ||
            data.deviceCode !== 'JS002' || typeof data.deviceSn !== 'string' ||
            !/^[A-Za-z0-9_-]{6,64}$/.test(data.deviceSn)) return;
        found.set(peer.address, { kind: 'xtool-m2', host: peer.address, serial: data.deviceSn });
      } catch { /* Ignore unrelated and invalid UDP packets. */ }
    });
    signal.addEventListener('abort', finish, { once: true });
    socket.bind(0, localAddress, () => {
      if (ended) return;
      for (const host of targets) {
        for (const port of ports) socket.send(frame, port, host, () => {});
      }
    });
  });
}
