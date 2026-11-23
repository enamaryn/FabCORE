// Sources d'événements du parc (MIG-05.1) : télémétrie observée par une seule boucle serveur, quel que soit le
// nombre de navigateurs, et modifications du parc détectées à chaque écriture d'état.
import type { MachineStatus, Telemetry } from '../domain/index.ts';
import type { EventHub } from './events.ts';
import type { FabCoreState, MachineRecord, StateStore } from './state-store.ts';

/** Télémétrie du POC (`connecting`, fichier `''`, progression 0 hors ligne) vers le contrat du domaine. */
export function toTelemetry(machineId: string, raw: Record<string, unknown>, at: Date): Telemetry {
  const status = (['ready', 'printing', 'paused', 'done', 'error', 'offline'].includes(raw.status as string) ? raw.status : 'unknown') as MachineStatus;
  const celsius = (value: unknown) => typeof value === 'number' && value >= -50 && value <= 600 ? value : null;
  const progress = typeof raw.progress === 'number' && raw.progress >= 0 && raw.progress <= 100 && !['offline', 'unknown'].includes(status) ? raw.progress : null;
  const file = typeof raw.file === 'string' && raw.file.length > 0 && raw.file.length <= 512 ? raw.file : null;
  const issue = typeof raw.issue === 'string' && /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/.test(raw.issue) && raw.issue.length <= 120 ? raw.issue : null;
  const checked = typeof raw.checkedAt === 'string' && !Number.isNaN(Date.parse(raw.checkedAt)) ? new Date(raw.checkedAt) : at;
  return { machineId, at: checked.toISOString(), status, issue, nozzle: celsius(raw.nozzle), bed: celsius(raw.bed), progress, file };
}

export type FleetWatcherOptions = {
  hub: EventHub;
  machines: () => MachineRecord[];
  /** Lecture de télémétrie déjà employée par GET /api/machines (caches et sessions des connecteurs). */
  read: (machine: MachineRecord) => Promise<Record<string, unknown>>;
  intervalMs?: number;
  now?: () => Date;
};

/**
 * Lit le parc à intervalle fixe tant qu'au moins un flux est ouvert et publie `machine.telemetry` quand un
 * relevé change (horodatage exclu). Aucune commande machine ; aucune lecture sans abonné.
 */
export function createFleetWatcher({ hub, machines, read, intervalMs = 2000, now = () => new Date() }: FleetWatcherOptions) {
  const last = new Map<string, string>();
  let running = false;
  async function tick() {
    if (running || hub.size === 0) return;
    running = true;
    try {
      const current = machines();
      for (const id of last.keys()) if (!current.some(machine => machine.id === id)) last.delete(id);
      await Promise.all(current.map(async machine => {
        let telemetry: Telemetry;
        try { telemetry = toTelemetry(machine.id, await read(machine), now()); }
        catch { telemetry = toTelemetry(machine.id, { status: 'offline', issue: 'connection' }, now()); }
        const { at: _at, ...fingerprint } = telemetry;
        const key = JSON.stringify(fingerprint);
        if (last.get(machine.id) === key || !machines().includes(machine)) return;
        last.set(machine.id, key);
        hub.publish('machine.telemetry', telemetry);
      }));
    } finally { running = false; }
  }
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}

/** Magasin observé : après chaque écriture durable, `fleet.changed` pour chaque machine ajoutée, modifiée ou retirée. */
export function observeFleet(store: StateStore, hub: EventHub): StateStore {
  return {
    get state() { return store.state; },
    async save(next: FabCoreState) {
      const before = new Map(store.state.machines.map(machine => [machine.id, JSON.stringify(machine)]));
      await store.save(next);
      const changed = new Set<string>();
      for (const machine of next.machines) if (before.get(machine.id) !== JSON.stringify(machine)) changed.add(machine.id);
      for (const id of before.keys()) if (!next.machines.some(machine => machine.id === id)) changed.add(id);
      if (changed.size > 8) hub.publish('fleet.changed', { machineId: null });
      else for (const machineId of changed) hub.publish('fleet.changed', { machineId });
    },
    ...(store.close ? { close: () => store.close!() } : {}),
  };
}
