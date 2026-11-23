// Tables PostgreSQL (migrations dans `migrations/`). Colonnes JSONB : champs propres au connecteur ou au
// fournisseur, conservés tels quels pour un aller-retour sans perte avec `state.json`.
import type { ColumnType } from 'kysely';

type Json = ColumnType<unknown, string, string>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface Database {
  installation: { id: number; state_version: number; source: string; created_at: Timestamp; imported_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null> };
  organizations: { id: string; name: string };
  sites: { id: string; organization_id: string; name: string };
  farms: { id: string; site_id: string; name: string };
  users: { username: string; role: 'admin' | 'observer'; password_salt: string; password_hash: string; position: number };
  cloud_accounts: { id: string; provider: string; name: string; position: number; data: Json };
  machines: { id: string; farm_id: string; name: string; position: number; cloud_account_id: string | null; manual_spool: ColumnType<unknown, string | null, string | null> };
  machine_connections: { machine_id: string; kind: string | null; origin: string; serial: string | null; settings: Json };
  settings: { key: string; value: Json };
  kysely_migration?: { name: string; timestamp: string };
}
