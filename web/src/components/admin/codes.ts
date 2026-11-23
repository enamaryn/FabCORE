// Codes stables du serveur (ADR 0005) traduits par le catalogue `codes` ; un code inconnu reste affiché tel quel.
import type { TFunction } from 'i18next';

export function codeLabel(t: TFunction, code: string, groups: ('diagnostic' | 'issue' | 'status' | 'event')[]): string {
  for (const group of groups) {
    const key = group + '.' + code;
    const value = t(key, { ns: 'codes', defaultValue: '' });
    if (value) return value;
  }
  return code;
}
