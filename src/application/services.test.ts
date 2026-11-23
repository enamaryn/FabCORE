// Cas d'usage migrés (MIG-04) testés sans HTTP ni base : magasin en mémoire au contrat de StateStore.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService, digest } from './accounts.ts';
import { ServiceError } from './errors.ts';
import { createMachineMetadata } from './machines.ts';
import { createNotificationService, NotificationInputError, ntfySettings, smtpSettings } from './notifications.ts';
import { createPersist, type FabCoreState, type StateStore } from './state-store.ts';

function memory(initial: Partial<FabCoreState> = {}) {
  let state: FabCoreState = { version: 1, admin: null, machines: [], ...initial };
  let failing = false;
  const store: StateStore = { get state() { return state; }, async save(next) { if (failing) throw new Error('storage-unavailable'); state = next; } };
  return { store, persist: createPersist(store), fail: (value: boolean) => { failing = value; } };
}
const code = (status: number, error: string) => (failure: unknown) => failure instanceof ServiceError && failure.statusCode === status && failure.message === error;

test('comptes : activation unique, jeton, identifiants, observateurs et stockage indisponible', async () => {
  let clock = 1000;
  const { store, persist, fail } = memory();
  const service = createAccountService({ store, persist, activation: { hash: digest('jeton'), expires: 2000 }, now: () => clock });
  const admin = { username: 'atelier', password: 'long-admin-password' };
  await assert.rejects(service.setup({ ...admin, token: 'autre' }), code(403, 'token'));
  await assert.rejects(service.setup({ username: 'ab', password: 'long-admin-password', token: 'jeton' }), code(400, 'credentials'));
  fail(true);
  await assert.rejects(service.setup({ ...admin, token: 'jeton' }), code(503, 'storage-unavailable'));
  assert.equal(service.installed(), false);
  fail(false);
  assert.deepEqual(await service.setup({ ...admin, token: 'jeton' }), { username: 'atelier', role: 'admin' });
  await assert.rejects(service.setup({ ...admin, token: 'jeton' }), code(409, 'installed'));
  assert.notEqual(store.state.admin?.hash, admin.password, 'mot de passe haché');
  assert.deepEqual(await service.authenticate(admin), { username: 'atelier', role: 'admin' });
  await assert.rejects(service.authenticate({ ...admin, password: 'mauvais' }), code(401, 'credentials'));
  await assert.rejects(service.authenticate({ username: 'inconnu', password: 'peu importe' }), code(401, 'credentials'));
  await service.addObserver({ username: 'lecteur', password: 'long-viewer-password' });
  assert.deepEqual(await service.authenticate({ username: 'lecteur', password: 'long-viewer-password' }), { username: 'lecteur', role: 'observer' });
  await assert.rejects(service.addObserver({ username: 'atelier', password: 'long-viewer-password' }), code(409, 'observer-duplicate'));
  clock = 3000;
  const expired = createAccountService({ ...memory(), activation: { hash: digest('jeton'), expires: 2000 }, now: () => clock });
  await assert.rejects(expired.setup({ ...admin, token: 'jeton' }), code(410, 'expired'));
});

test('notifications : codes d’erreur, secret jamais renvoyé, test limité et sans réponse du fournisseur', async () => {
  const { store, persist } = memory();
  let allowed = true;
  const sent: string[] = [];
  const service = createNotificationService({ store, persist, internal: () => null, withinLimit: () => allowed,
    send: async channel => { sent.push(channel); if (channel === 'ntfy') throw new Error('réponse avec secret'); return true; } });
  const smtp = { enabled: true, host: 'smtp.example.test', port: '465', tls: 'tls', from: 'fab@example.test', to: 'atelier@example.test', auth: true, username: 'fab', secret: 'example-password' };
  await assert.rejects(service.save({ ntfy: { mode: 'internal' }, smtp }), code(400, 'ntfy-install-required'));
  await assert.rejects(service.save({ ntfy: { mode: 'off' }, smtp: { ...smtp, from: 'mail.example.test' } }), code(400, 'notifications-invalid'));
  const saved = await service.save({ ntfy: { mode: 'off' }, smtp });
  assert.equal(JSON.stringify(saved).includes('example-password'), false);
  assert.deepEqual(await service.test({ channel: 'smtp' }), { accepted: true });
  await assert.rejects(service.test({ channel: 'ntfy' }), code(502, 'notifications-failed'));
  await assert.rejects(service.test({ channel: 'autre' }), code(400, 'invalid'));
  allowed = false;
  await assert.rejects(service.test({ channel: 'smtp' }), code(429, 'rate'));
  assert.deepEqual(sent, ['smtp', 'ntfy']);
});

test('bobine manuelle : machine inconnue, type non pris en charge, saisie invalide, retrait', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const { store, persist } = memory({ machines: [{ id, name: 'Voron', origin: 'http://192.168.1.20' }, { id: 'laser', name: 'M2', kind: 'xtool-m2', origin: 'http://192.168.1.21' }] });
  const service = createMachineMetadata({ store, persist });
  await assert.rejects(service.setManualSpool('absente', { spool: null }), code(404, 'missing'));
  await assert.rejects(service.setManualSpool('laser', { spool: null }), code(400, 'spool-unsupported'));
  await assert.rejects(service.setManualSpool(id, { spool: { material: 'PLA', color: 'rouge' } }), code(400, 'spool-invalid'));
  assert.deepEqual(await service.setManualSpool(id, { spool: { material: ' PETG ', color: '#abcdef' } }), { manualSpool: { material: 'PETG', name: '', color: '#ABCDEF' } });
  assert.deepEqual(await service.setManualSpool(id, { spool: null }), { manualSpool: null });
  assert.equal(store.state.machines[0]?.manualSpool, null);
});

test('#121 : canaux enregistrés séparément, ntfy incomplet sans effet sur SMTP, champ en cause signalé', async () => {
  const { store, persist } = memory();
  const service = createNotificationService({ store, persist, internal: () => null, send: async () => true, withinLimit: () => true });
  const smtp = { enabled: true, host: 'mail.example.test', port: 465, tls: 'tls', from: 'fabcore@example.test', to: 'moi@example.test', auth: true, username: 'fabcore@example.test', secret: 'mot-de-passe' };
  // L'interface conservée envoie les deux canaux : ntfy interne non installé bloque tout, comme avant.
  await assert.rejects(service.save({ ntfy: { mode: 'internal' }, smtp }), code(400, 'ntfy-install-required'));
  // Un seul canal : SMTP enregistré, ntfy laissé tel quel.
  assert.deepEqual((await service.save({ smtp })).ntfy, { mode: 'off' });
  assert.equal(store.state.notifications?.smtp && (store.state.notifications.smtp as { secret?: string }).secret, 'mot-de-passe');
  await service.save({ ntfy: { mode: 'external', url: 'https://ntfy.example.test', topic: 'atelier', auth: 'none' } });
  assert.equal((store.state.notifications?.smtp as { host?: string }).host, 'mail.example.test', 'SMTP conservé');
  // Mot de passe conservé si la connexion ne change pas.
  await service.save({ smtp: { ...smtp, to: 'autre@example.test', secret: '' } });
  assert.equal((store.state.notifications?.smtp as { secret?: string }).secret, 'mot-de-passe');
  const field = (input: Record<string, unknown>) => { try { smtpSettings(input, undefined); return null; } catch (error) { return error instanceof NotificationInputError ? error.field : String(error); } };
  assert.equal(field({ ...smtp, from: 'mail.example.test' }), 'smtp.from', 'nom de serveur au lieu d’une adresse');
  assert.equal(field({ ...smtp, to: 'mail.example.test' }), 'smtp.to');
  assert.equal(field({ ...smtp, port: 'abc' }), 'smtp.port');
  assert.equal(field({ ...smtp, secret: '' }), 'smtp.secret');
  assert.equal(smtpSettings({ ...smtp, secret: '' }, { enabled: true, host: 'mail.example.test', port: 465, tls: 'tls', from: 'x@y.z', to: 'x@y.z', auth: true, username: 'fabcore@example.test' }, { assumeStoredSecret: true }).enabled, true, 'interface : secret conservé supposé');
  assert.throws(() => ntfySettings({ mode: 'external', url: 'http://ntfy.example.test', topic: 'a', auth: 'none' }, undefined), (error: unknown) => error instanceof NotificationInputError && error.field === 'ntfy.url');
  await assert.rejects(service.save({}), code(400, 'notifications-invalid'));
});
