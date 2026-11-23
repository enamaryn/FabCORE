// Métadonnées du parc gérées par FabCore (MIG-04) : aucune commande machine.
import { manualSpool, supportsManualSpool, type ManualSpool } from '../domain/index.ts';
import { ServiceError } from './errors.ts';
import type { FabCoreState, StateStore } from './state-store.ts';

export function createMachineMetadata({ store, persist }: { store: StateStore; persist: (next: FabCoreState) => Promise<void> }) {
  return {
    /** Renseigne ou retire (`spool: null`) la bobine manuelle ; modifiable hors ligne. */
    async setManualSpool(id: string, data: Record<string, unknown>): Promise<{ manualSpool: ManualSpool | null }> {
      const machine = store.state.machines.find(item => item.id === id);
      if (!machine) throw new ServiceError(404, 'missing');
      if (!supportsManualSpool(machine.kind ?? 'klipper')) throw new ServiceError(400, 'spool-unsupported');
      const spool = data.spool === null ? null : manualSpool(data.spool);
      if (data.spool !== null && !spool) throw new ServiceError(400, 'spool-invalid');
      // Les modules signalés par la machine gardent la priorité d'affichage.
      await persist({ ...store.state, machines: store.state.machines.map(item => item === machine ? { ...item, manualSpool: spool } : item) });
      return { manualSpool: spool };
    },
  };
}
