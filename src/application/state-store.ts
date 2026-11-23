// Port de persistance de l'état d'installation (ADR 0003) : implémenté par `poc/store.mjs` (JSON) et
// `src/persistence/postgres-store.ts` (PostgreSQL, MIG-04). L'état reste lu en mémoire, de façon synchrone ;
// `save` remplace l'instantané complet et ne se résout qu'une fois l'écriture durable.

export type Account = { username: string; salt: string; hash: string };
export type MachineRecord = { id: string; name: string; kind?: string; origin: string; [field: string]: unknown };
export type CloudAccountRecord = { id: string; provider: string; name: string; [field: string]: unknown };

export type FabCoreState = {
  version: 1;
  admin: Account | null;
  observers?: Account[];
  machines: MachineRecord[];
  cloudAccounts?: CloudAccountRecord[];
  notifications?: Record<string, unknown>;
};

export interface StateStore {
  readonly state: FabCoreState;
  /** Remplace l'état ; rejette `storage-unavailable` si l'écriture échoue, l'état précédent restant en vigueur. */
  save(next: FabCoreState): void | Promise<void>;
  close?(): Promise<void>;
}
