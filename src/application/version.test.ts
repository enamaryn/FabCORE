import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVersionService, installedCommit, latestMain, originUrl } from './version.ts';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
function repo(t: test.TestContext, head: string, files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fabcore-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git/refs/heads'), { recursive: true });
  writeFileSync(join(root, '.git/HEAD'), head + '\n');
  writeFileSync(join(root, '.git/config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/enamaryn/FabCORE.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, '.git', path), content);
  return root;
}
const refs = (main: string) => async () => new Response('001e# service=git-upload-pack\n0000' + '00f1' + main + ' HEAD\0multi_ack\n003f' + main + ' refs/heads/main\n0000');

test('version installée : HEAD détachée, branche libre ou regroupée, sans git', async t => {
  assert.equal(await installedCommit(repo(t, a)), a);
  assert.equal(await installedCommit(repo(t, 'ref: refs/heads/main', { 'refs/heads/main': b })), b);
  assert.equal(await installedCommit(repo(t, 'ref: refs/heads/main', { 'packed-refs': `# pack-refs\n${c} refs/heads/main\n` })), c);
  assert.equal(await installedCommit(repo(t, 'ref: refs/heads/../../x')), null);
  assert.equal(await originUrl(repo(t, a)), 'https://github.com/enamaryn/FabCORE');
});

test('dernière version : main annoncée, réponse refusée sans valeur, cache et nouvelle lecture après mise à jour', async t => {
  assert.equal(await latestMain('https://github.com/x/y', refs(b), AbortSignal.timeout(1000)), b);
  assert.equal(await latestMain('https://github.com/x/y', async () => new Response('', { status: 404 }), AbortSignal.timeout(1000)), null);
  const root = repo(t, a);
  let calls = 0, clock = 0;
  const service = createVersionService({ root, fetcher: async () => { calls++; return refs(b)(); }, now: () => clock });
  assert.deepEqual(await service.status(), { current: a, latest: b, updateAvailable: true, checkedAt: new Date(0).toISOString() });
  clock = 60_000; await service.status();
  assert.equal(calls, 1, 'cache de 10 minutes');
  writeFileSync(join(root, '.git/HEAD'), b);
  assert.equal((await service.status()).updateAvailable, false, 'mise à jour faite : relu aussitôt');
  assert.equal(calls, 2);
  const offline = createVersionService({ root, fetcher: async () => { throw new Error('réseau'); } });
  assert.deepEqual(await offline.status(), { current: b, latest: null, updateAvailable: false, checkedAt: null });
});
