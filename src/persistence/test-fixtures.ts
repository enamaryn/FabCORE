// État d'installation fictif (aucune donnée réelle) partagé par les tests de persistance.
import type { FabCoreState } from '../application/state-store.ts';

export const sampleState = (): FabCoreState => ({
  version: 1,
  admin: { username: 'atelier', salt: 'aa', hash: 'bb' },
  observers: [{ username: 'lecteur', salt: 'cc', hash: 'dd' }],
  machines: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Voron', origin: 'http://192.168.1.20' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'CC2', kind: 'elegoo', origin: 'mqtt://192.168.1.30:1883', serial: 'CC2SERIAL', accessCode: 'code', manualSpool: { name: 'PLA', color: '#00AA99' } },
    { id: '33333333-3333-4333-8333-333333333333', name: 'P2S cloud', kind: 'bambu-cloud', origin: 'mqtts://us.mqtt.bambulab.com:8883', serial: 'P2S01', cloudAccountId: '44444444-4444-4444-8444-444444444444', mode: 'cloud', model: 'Bambu Lab · P2S', manualSpool: null },
    { id: '55555555-5555-4555-8555-555555555555', name: 'Cloud bis', kind: 'bambu-cloud', origin: 'mqtts://us.mqtt.bambulab.com:8883', serial: 'P2S02', cloudAccountId: '44444444-4444-4444-8444-444444444444' },
  ],
  cloudAccounts: [{ id: '44444444-4444-4444-8444-444444444444', provider: 'bambu', name: 'Compte', email: 'a@example.test', region: 'global', status: 'connected', devices: [{ serial: 'P2S01' }], telemetryEnabled: true }],
  notifications: { ntfy: { enabled: false } },
});
