import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeFleet } from '../src/events.ts';
import type { EventStream } from '../src/events.ts';
class Source implements EventStream {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, () => void>(); closed = 0;
  addEventListener(type: string, callback: () => void) { this.listeners.set(type, callback); }
  close() { this.closed++; }
}
test('React SSE : lectures regroupées, secours et reconnexion, nettoyage sans invalidation tardive', ctx => {
  ctx.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 10000 });
  const sources: Source[] = []; let reads = 0;
  const stop = subscribeFleet({ invalidate: () => reads++, open: url => { assert.equal(url, '/api/events'); const source = new Source(); sources.push(source); return source; } });
  const first = sources[0]!; first.onopen?.(new Event('open'));
  first.listeners.get('machine.telemetry')!(); first.listeners.get('fleet.changed')!(); ctx.mock.timers.tick(1);
  assert.equal(reads, 1);
  first.listeners.get('machine.telemetry')!(); ctx.mock.timers.tick(999); assert.equal(reads, 1);
  ctx.mock.timers.tick(1); assert.equal(reads, 2);
  first.listeners.get('resync')!(); assert.equal(reads, 3);
  first.readyState = 2; first.onerror?.(new Event('error'));
  ctx.mock.timers.tick(5000); assert.equal(sources.length, 2); assert.equal(first.closed, 1);
  const next = sources[1]!; next.onopen?.(new Event('open'));
  const before = reads; ctx.mock.timers.tick(2000); assert.equal(reads, before, 'Le secours s’arrête au retour SSE');
  next.listeners.get('fleet.changed')!(); stop(); const closed = reads;
  ctx.mock.timers.tick(100000); first.listeners.get('resync')!(); next.onerror?.(new Event('error'));
  assert.equal(reads, closed); assert.equal(next.closed, 1); assert.equal(sources.length, 2);
});
test('React SSE : navigateur sans EventSource ou création refusée conserve le secours borné', ctx => {
  ctx.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }); let reads = 0;
  const stop = subscribeFleet({ invalidate: () => reads++, open: () => { throw new Error('unavailable'); } });
  ctx.mock.timers.tick(4000); assert.equal(reads, 2); stop(); ctx.mock.timers.tick(4000); assert.equal(reads, 2);
});
