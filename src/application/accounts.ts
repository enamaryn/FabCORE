// Comptes locaux (MIG-04) : activation de l'administrateur, vérification des identifiants, observateurs.
// Hachage scrypt (sel 16 octets, clé 64 octets), comparaison à temps constant. Les sessions restent côté HTTP.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ServiceError } from './errors.ts';
import type { FabCoreState, StateStore } from './state-store.ts';

const derive = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
export const digest = (secret: string): Buffer => createHash('sha256').update(secret).digest();
export type Role = 'admin' | 'observer';
/** Jeton d'activation à usage unique : empreinte SHA-256 et échéance (ms). */
export type Activation = { hash: Buffer; expires: number } | null;
type Input = Record<string, unknown>;

const field = (data: Input, key: string, max: number) => typeof data[key] === 'string' && data[key].length <= max ? data[key] : '';
const credentials = (data: Input) => ({ username: field(data, 'username', 40).trim(), password: field(data, 'password', 128) });

async function account(password: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await derive(password, salt, 64)).toString('hex') };
}

export function createAccountService({ store, persist, activation, now = () => Date.now() }: {
  store: StateStore; persist: (next: FabCoreState) => Promise<void>; activation: Activation; now?: () => number;
}) {
  return {
    installed: () => Boolean(store.state.admin),
    /** Création de l'administrateur avec le jeton affiché au premier démarrage. */
    async setup(data: Input): Promise<{ username: string; role: 'admin' }> {
      const { username, password } = credentials(data);
      if (!activation || activation.expires <= now()) throw new ServiceError(410, 'expired');
      if (!timingSafeEqual(digest(field(data, 'token', 128).trim()), activation.hash)) throw new ServiceError(403, 'token');
      if (username.length < 3 || password.length < 12) throw new ServiceError(400, 'credentials');
      const created = await account(password);
      // Revérifié après le hachage asynchrone : une seule activation possible.
      if (store.state.admin) throw new ServiceError(409, 'installed');
      if (activation.expires <= now()) throw new ServiceError(410, 'expired');
      await persist({ ...store.state, admin: { username, ...created } });
      return { username, role: 'admin' };
    },
    /** Identifiants valides → rôle ; sinon 401 `credentials`, avec un calcul scrypt même pour un compte inconnu. */
    async authenticate(data: Input): Promise<{ username: string; role: Role }> {
      const { username, password } = credentials(data);
      const admin = store.state.admin;
      if (!admin || !password) throw new ServiceError(401, 'credentials');
      const role: Role = username === admin.username ? 'admin' : 'observer';
      const found = role === 'admin' ? admin : (store.state.observers ?? []).find(entry => entry.username === username);
      const hash = await derive(password, found?.salt ?? admin.salt, 64);
      if (!found || !timingSafeEqual(hash, Buffer.from(found.hash, 'hex'))) throw new ServiceError(401, 'credentials');
      return { username, role };
    },
    async addObserver(data: Input): Promise<{ username: string }> {
      const { username, password } = credentials(data);
      if (username.length < 3 || password.length < 12) throw new ServiceError(400, 'credentials');
      const created = await account(password);
      const latest = store.state.observers ?? [];
      if (store.state.admin?.username === username || latest.some(entry => entry.username === username)) throw new ServiceError(409, 'observer-duplicate');
      if (latest.length >= 16) throw new ServiceError(409, 'observer-limit');
      await persist({ ...store.state, observers: [...latest, { username, ...created }] });
      return { username };
    },
  };
}
