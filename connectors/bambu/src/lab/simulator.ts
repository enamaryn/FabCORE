/** Deliberately small MQTT 3.1.1 lab endpoint: QoS 0 + one subscription, loopback only.
 * Not a general-purpose broker and never used by the production server. */
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import type { BambuAuthorizationManager } from './authorization.ts';

export const requestTopic = 'fabcore-lab/request';
export const responseTopic = 'fabcore-lab/result';
const field = (s: string) => { const data = Buffer.from(s); const size = Buffer.alloc(2); size.writeUInt16BE(data.length); return Buffer.concat([size, data]); };
function packet(header: number, body: Buffer) {
  const length = []; let size = body.length;
  do { let byte = size % 128; size = Math.floor(size / 128); if (size) byte |= 128; length.push(byte); } while (size);
  return Buffer.concat([Buffer.from([header, ...length]), body]);
}
function stringAt(body: Buffer, offset: number) {
  if (offset + 2 > body.length) throw new Error();
  const size = body.readUInt16BE(offset), end = offset + 2 + size;
  if (end > body.length) throw new Error();
  return { value: body.subarray(offset + 2, end).toString(), end };
}
export async function startBambuSimulator(authorization: BambuAuthorizationManager) {
  const sockets = new Set<Socket>();
  const tasks = new Set<Promise<void>>();
  const server = createServer(socket => {
    if (sockets.size >= 4) { socket.destroy(); return; } sockets.add(socket);
    socket.setTimeout(15000, () => socket.destroy()); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0), connected = false, subscribed = false;
    let queue = Promise.resolve();
    const send = (data: Buffer) => { if (!socket.destroyed) { if (socket.writableLength + data.length > 256 * 1024) socket.destroy(); else socket.write(data); } };
    const processPacket = async (header: number, body: Buffer) => {
      if (!connected) {
        if (header !== 0x10) throw new Error();
        const protocol = stringAt(body, 0);
        if (protocol.value !== 'MQTT' || body[protocol.end] !== 4 || body[protocol.end + 1] !== 2) throw new Error();
        const client = stringAt(body, protocol.end + 4);
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(client.value) || client.end !== body.length) throw new Error();
        connected = true; send(Buffer.from([0x20, 2, 0, 0])); return;
      }
      if (header === 0x82) {
        const topic = stringAt(body, 2);
        if (body.length < 5 || body.readUInt16BE(0) === 0 || topic.value !== responseTopic || body[topic.end] !== 0 || topic.end + 1 !== body.length) throw new Error();
        subscribed = true; send(Buffer.from([0x90, 3, body[0]!, body[1]!, 0])); return;
      }
      if (header === 0x30) {
        const topic = stringAt(body, 0);
        if (!subscribed || topic.value !== requestTopic) throw new Error();
        const result = await authorization.handle(body.subarray(topic.end));
        send(packet(0x30, Buffer.concat([field(responseTopic), Buffer.from(JSON.stringify(result))]))); return;
      }
      if (header === 0xc0 && !body.length) { send(Buffer.from([0xd0, 0])); return; }
      if (header === 0xe0 && !body.length) { socket.end(); return; }
      throw new Error();
    };
    let pending = 0;
    socket.on('data', (chunk: Buffer) => {
      if (buffer.length + chunk.length > 128 * 1024 + 512) { socket.destroy(); return; }
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2 && !socket.destroyed) {
        let size = 0, index = 1, multiplier = 1;
        for (; index <= 4; index++) {
          if (index >= buffer.length) return;
          const byte = buffer[index]!; size += (byte & 127) * multiplier; multiplier *= 128;
          if (!(byte & 128)) break;
        }
        if (index > 4 || size > 128 * 1024) { socket.destroy(); return; }
        if (buffer.length < index + 1 + size) return;
        const header = buffer[0]!, body = Buffer.from(buffer.subarray(index + 1, index + 1 + size));
        buffer = buffer.subarray(index + 1 + size);
        if (++pending > 8) { socket.destroy(); return; }
        const task: Promise<void> = queue.then(() => processPacket(header, body)).catch(() => { socket.destroy(); }).finally(() => { pending--; tasks.delete(task); });
        queue = task; tasks.add(task);
      }
    });
  });
  // No configurable host, port or printer address. This process cannot be aimed at a printer.
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('lab-listen');
  let closing: Promise<void> | undefined;
  return { url: 'mqtt://127.0.0.1:' + address.port,
    close() { return closing ??= (async () => {
      for (const socket of sockets) socket.destroy();
      const closed = new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
      await Promise.all([closed, Promise.allSettled([...tasks])]);
    })(); },
  };
}
