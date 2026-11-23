import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventHub, type Subscriber } from './events.ts';
import { createFleetWatcher, observeFleet, toTelemetry } from './fleet-events.ts';
import type { FabCoreState, StateStore } from './state-store.ts';

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const at = new Date('2026-11-23T12:00:00Z');
function client(role: 'admin' | 'observer' = 'observer', accept = () => true) {
  const frames: string[] = [];
  let closed = false;
  const subscriber: Subscriber = { viewer: { role }, write: frame => { frames.push(frame); return accept(); }, close: () => { closed = true; } };
  return { subscriber, frames, closed: () => closed, events: () => frames.map(frame => /event: (.+)/.exec(frame)?.[1]) };
}

test('bus : identifiants croissants, schéma, droits avant émission, taille bornée', () => {
  const hub = createEventHub({ now: () => at, maxFrameBytes: 400 });
  const admin = client('admin'), observer = client('observer');
  hub.subscribe(admin.subscriber); hub.subscribe(observer.subscriber);
  const first = hub.publish('fleet.changed', { machineId: id(1) });
  const second = hub.publish('fleet.changed', { machineId: null }, 'admin');
  assert.ok(first && second && Number(second.split(':')[1]) === Number(first.split(':')[1]) + 1);
  assert.deepEqual(admin.events(), ['fleet.changed', 'fleet.changed']);
  assert.deepEqual(observer.events(), ['fleet.changed'], 'portée admin jamais envoyée à un observateur');
  assert.equal(hub.publish('fleet.changed', { machineId: 'pas-un-uuid' }), null, 'données hors schéma refusées');
  assert.equal(hub.publish('machine.telemetry', { ...toTelemetry(id(1), { status: 'ready', file: 'x'.repeat(500) }, at), file: 'x'.repeat(400) }), null, 'message trop gros refusé');
  assert.match(observer.frames[0]!, /^id: [0-9a-f]{8}:1\nevent: fleet.changed\ndata: \{"id":"[0-9a-f]{8}:1","type":"fleet.changed","at":"2026-11-23T12:00:00.000Z","data":\{"machineId":"00000001-/);
});

test('bus : reprise depuis Last-Event-ID, resync si autre démarrage ou historique expiré, abonné lent fermé', () => {
  const hub = createEventHub({ capacity: 3, maxPending: 2 });
  const ids = [1, 2, 3, 4].map(n => hub.publish('fleet.changed', { machineId: id(n) })!);
  const resumed = client();
  hub.subscribe(resumed.subscriber, ids[2]);
  assert.equal(resumed.frames.length, 1);
  assert.match(resumed.frames[0]!, /00000004-/);
  const edge = client();
  hub.subscribe(edge.subscriber, ids[0]);
  assert.equal(edge.events().length, 3, 'suite encore complète dans le tampon : reprise sans perte');
  hub.close(subscriber => subscriber !== resumed.subscriber);
  hub.publish('fleet.changed', { machineId: id(5) });
  const old = client();
  hub.subscribe(old.subscriber, ids[0]);
  assert.deepEqual(old.events(), ['resync'], 'au-delà du tampon : rechargement complet');
  const other = client();
  hub.subscribe(other.subscriber, 'autre:4');
  assert.deepEqual(other.events(), ['resync'], 'autre démarrage');
  const slow = client('observer', () => false);
  hub.subscribe(slow.subscriber);
  for (let n = 6; n < 10; n++) hub.publish('fleet.changed', { machineId: id(n) });
  assert.equal(slow.closed(), true);
  assert.equal(slow.frames.length, 3, 'plus aucune écriture après fermeture');
  hub.close(() => true);
  assert.equal(hub.size, 0);
});

test('télémétrie : conversion du POC, publication seulement au changement et sans lecture sans abonné', async () => {
  assert.deepEqual(toTelemetry(id(1), { status: 'connecting', progress: 0, file: '', nozzle: 900, issue: 'Bad Code' }, at),
    { machineId: id(1), at: at.toISOString(), status: 'unknown', issue: null, nozzle: null, bed: null, progress: null, file: null });
  const hub = createEventHub({ now: () => at });
  let reads = 0, nozzle = 20;
  const machine = { id: id(1), name: 'Voron', origin: 'http://192.168.1.20' };
  const watcher = createFleetWatcher({ hub, machines: () => [machine], read: async () => { reads += 1; return { status: 'ready', nozzle, checkedAt: new Date().toISOString() }; }, intervalMs: 60_000, now: () => at });
  await watcher.tick();
  assert.equal(reads, 0, 'aucun abonné : aucune lecture');
  const viewer = client();
  hub.subscribe(viewer.subscriber);
  await watcher.tick(); await watcher.tick();
  nozzle = 21;
  await watcher.tick();
  watcher.stop();
  assert.equal(reads, 3);
  assert.deepEqual(viewer.events(), ['machine.telemetry', 'machine.telemetry'], 'horodatage seul : rien de publié');
});

test('parc observé : fleet.changed après écriture durable, rien si l’écriture échoue', async () => {
  const hub = createEventHub();
  const viewer = client();
  hub.subscribe(viewer.subscriber);
  let state: FabCoreState = { version: 1, admin: null, machines: [{ id: id(1), name: 'A', origin: 'http://192.168.1.1' }] };
  let failing = false;
  const store = observeFleet({ get state() { return state; }, async save(next) { if (failing) throw new Error('storage-unavailable'); state = next; } } satisfies StateStore, hub);
  await store.save({ ...state, machines: [{ ...state.machines[0]!, name: 'B' }, { id: id(2), name: 'C', origin: 'http://192.168.1.2' }] });
  await store.save({ ...state, notifications: {} });
  assert.equal(viewer.frames.length, 2);
  failing = true;
  await assert.rejects(async () => { await store.save({ ...state, machines: [] }); });
  assert.equal(viewer.frames.length, 2);
});
