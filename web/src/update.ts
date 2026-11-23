// Règles de l'annonce de mise à jour (testables sans navigateur).
import type { VersionStatus } from './api.ts';
import { readPreference } from './preferences.ts';

export const day = 24 * 60 * 60 * 1000;
/** La pop-up s'ouvre-t-elle d'elle-même pour cette version ? */
export function shouldPrompt(version: VersionStatus | undefined, now: number, read: (key: string) => string = key => readPreference(key, '')): boolean {
  if (!version?.updateAvailable || !version.latest) return false;
  if (read('fabcore-update-dismissed') === version.latest) return false;
  const remind = Number(read('fabcore-update-remind'));
  return !(Number.isFinite(remind) && remind > now);
}

