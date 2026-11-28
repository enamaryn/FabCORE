// Paramètres d'une machine enregistrée : connexion modifiable, « Détecter à nouveau » (adresse changée),
// suppression confirmée. Les comptes cloud Bambu se règlent depuis l'écran des comptes cloud.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type createApi, type DiscoveredDevice } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { MachineForm, initialDraft, type MachineDraft } from './MachineForm.tsx';
import './machines.css';

type Api = ReturnType<typeof createApi>;
const ipv4 = (address: string) => address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
/** Réseau local qui contient l'adresse actuelle, sinon le premier proposé. */
export function networkFor(host: string, networks: string[]) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return networks[0];
  return networks.find(cidr => { const [base, bits] = cidr.split('/'); const size = 2 ** (32 - Number(bits)); return Math.floor(ipv4(host) / size) === Math.floor(ipv4(base!) / size); }) ?? networks[0];
}
export function hostOf(machine: MachineData) { try { return machine.origin ? new URL(machine.origin).hostname : ''; } catch { return ''; } }

export function MachineSettings({ machine, api }: { machine: MachineData; api: Api }) {
  const { t } = useTranslation('machineAdmin'); const client = useQueryClient();
  const catalog = useQuery({ queryKey: ['connectors'], queryFn: ({ signal }) => api.connectors(signal), staleTime: Infinity });
  const connector = catalog.data?.find(item => item.kind === (machine.kind ?? 'klipper'));
  const [draft, setDraft] = useState<MachineDraft>({}), [found, setFound] = useState<DiscoveredDevice[] | null>(null);
  const [scan, setScan] = useState<{ state: 'idle' | 'busy' | 'done'; text?: string; error?: boolean }>({ state: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false), [deleteError, setDeleteError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (connector) setDraft(initialDraft(connector.kind, connector.form, machine)); }, [connector, machine.id]);
  if (machine.kind === 'bambu-cloud') return <section className="panel stack"><h2>{t('settingsTitle')}</h2><p>{t('cloudSettings')}</p><div><a className="button" href="#cloud">{t('cloudAccounts')}</a></div></section>;
  if (!connector) return <section className="panel"><p role="status">{catalog.isError ? t('errors.network') : t('loading')}</p></section>;

  async function rediscover() {
    controller.current?.abort(); controller.current = new AbortController(); const signal = controller.current.signal;
    setScan({ state: 'busy', text: t('rediscovering') }); setFound(null);
    try {
      const networks = await api.networks(signal), host = hostOf(machine), network = networkFor(host, networks);
      if (!network) { setScan({ state: 'done', text: t('noNetwork'), error: true }); return; }
      const devices = await api.discover(network, signal);
      const same = devices.filter(device => device.kind === (machine.kind ?? 'klipper') && device.detected !== false && (!device.serial || !machine.serial || device.serial.toUpperCase() === machine.serial.toUpperCase()));
      if (same.some(device => device.registered && device.name === machine.name && device.host === host)) { setScan({ state: 'done', text: t('stillThere', { host }) }); return; }
      const candidates = same.filter(device => !device.registered);
      setFound(candidates);
      setScan({ state: 'done', text: candidates.length ? t('chooseAddress') : t('nothingElse', { network }), error: !candidates.length });
    } catch (error) { if (!signal.aborted) setScan({ state: 'done', text: t('errors.' + (error instanceof ApiError ? error.code : 'network'), { defaultValue: t('errors.network') }), error: true }); }
  }
  function use(device: DiscoveredDevice) {
    setDraft(current => {
      const next: MachineDraft = { ...current, host: device.host, ...(connector!.form === 'http' ? { origin: device.origin ?? 'http://' + device.host } : {}) };
      if (device.transport) { next.transport = device.transport; try { const port = new URL(device.origin ?? '').port; if (port) next.port = port; } catch { /* port par défaut */ } }
      if (device.httpPort) next.httpPort = String(device.httpPort);
      if (device.wsPort) next.wsPort = String(device.wsPort);
      return next;
    });
    setFound(null); setScan({ state: 'done', text: t('addressFilled', { host: device.host }) });
  }
  async function remove() {
    setDeleteError('');
    try { await api.machineWrite('delete', { id: machine.id }); await client.invalidateQueries({ queryKey: ['fleet'] }); location.hash = '#machines'; }
    catch (error) { setDeleteError(t('errors.' + (error instanceof ApiError ? error.code : 'network'), { defaultValue: t('errors.network') })); setConfirmDelete(false); }
  }
  const rediscoverBlock = <div className="stack machine-rediscover">
    <div className="row wrap"><button type="button" disabled={scan.state === 'busy'} onClick={() => { void rediscover(); }}>{t('rediscover')}</button><small>{t('rediscoverHelp')}</small></div>
    {scan.text && <p className={scan.error ? 'error' : 'notice'} role="status">{scan.text}</p>}
    {found && found.length > 0 && <ul className="machine-devices">{found.map((device, index) => <li key={index} className="row between wrap"><span>{device.host}{device.transport ? ' · ' + (device.transport === 'tcp' ? 'GRBL TCP' : 'ESP3D') : ''}{device.serial ? ' · ' + device.serial : ''}</span><button type="button" className="primary" onClick={() => use(device)}>{t('useAddress')}</button></li>)}</ul>}
  </div>;
  return <div className="stack machine-admin">
    <section className="panel stack"><h2>{t('settingsTitle')}</h2><p className="muted">{connector.model}</p>
      <MachineForm api={api} connector={connector} existing={machine} draft={draft} setDraft={update => setDraft(update)} extra={rediscoverBlock}
        onSaved={() => { void client.invalidateQueries({ queryKey: ['fleet'] }); location.hash = '#machine/' + machine.id; }} />
    </section>
    <section className="panel stack machine-danger"><h2>{t('deleteTitle')}</h2><p className="muted">{t('deleteHelp')}</p>
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      {confirmDelete ? <div className="row wrap"><span>{t('deleteConfirm', { name: machine.name })}</span><button type="button" onClick={() => setConfirmDelete(false)}>{t('cancel')}</button><button type="button" className="danger" onClick={() => { void remove(); }}>{t('delete')}</button></div>
        : <div><button type="button" className="danger" onClick={() => setConfirmDelete(true)}>{t('delete')}</button></div>}
    </section>
  </div>;
}
