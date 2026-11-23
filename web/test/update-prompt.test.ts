import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrompt } from '../src/update.ts';

test('annonce de mise à jour : ne pas rappeler (cette version), plus tard (24 h), nouvelle version', () => {
  const version = { current: 'a'.repeat(40), latest: 'b'.repeat(40), updateAvailable: true, checkedAt: null };
  const prefs = (values: Record<string, string>) => (key: string) => values[key] ?? '';
  assert.equal(shouldPrompt(version, 0, prefs({})), true);
  assert.equal(shouldPrompt({ ...version, updateAvailable: false }, 0, prefs({})), false);
  assert.equal(shouldPrompt(version, 0, prefs({ 'fabcore-update-dismissed': 'b'.repeat(40) })), false);
  assert.equal(shouldPrompt({ ...version, latest: 'c'.repeat(40) }, 0, prefs({ 'fabcore-update-dismissed': 'b'.repeat(40) })), true, 'version plus récente : annoncée à nouveau');
  assert.equal(shouldPrompt(version, 1000, prefs({ 'fabcore-update-remind': '86400000' })), false);
  assert.equal(shouldPrompt(version, 86400001, prefs({ 'fabcore-update-remind': '86400000' })), true, 'rappel au plus une fois par jour');
  assert.equal(shouldPrompt(undefined, 0, prefs({})), false);
});
