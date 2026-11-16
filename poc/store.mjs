import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'state.json');
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { version: 1, admin: null, machines: [] };
  }
  if (state.version !== 1 || !Array.isArray(state.machines) || !Object.hasOwn(state, 'admin')) {
    throw new Error('Format de stockage FabCore inconnu.');
  }
  return {
    get state() { return state; },
    save(next) {
      const temp = join(directory, `.state-${randomUUID()}.tmp`);
      try {
        writeFileSync(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx', flush: true });
        renameSync(temp, file);
        state = next;
      } finally {
        try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  };
}
