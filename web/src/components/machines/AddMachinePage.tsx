// Ajout d'une machine : scan d'un réseau local (appareils reconnus, déjà ajoutés signalés), puis formulaire
// prérempli ; ou saisie manuelle en choisissant le type. Après enregistrement : ouverture de la fiche.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type createApi, type DiscoveredDevice } from '../../api.ts';
import { MachineForm, initialDraft, type MachineDraft } from './MachineForm.tsx';
import './machines.css';

type Api = ReturnType<typeof createApi>;
export function AddMachinePage({ api }: { api: Api }) {
  const { t } = useTranslation('machineAdmin'); const client = useQueryClient();
  const catalog = useQuery({ queryKey: ['connectors'], queryFn: ({ signal }) => api.connectors(signal), staleTime: Infinity });
  const networks = useQuery({ queryKey: ['networks'], queryFn: ({ signal }) => api.networks(signal), staleTime: 60000 });
  const [network, setNetwork] = useState(''), [devices, setDevices] = useState<DiscoveredDevice[] | null>(null), [scanning, setScanning] = useState(false), [scanError, setScanError] = useState('');
  const [chosen, setChosen] = useState<{ kind: string; detected: DiscoveredDevice | null } | null>(null), [draft, setDraft] = useState<MachineDraft>({});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!network && networks.data?.[0]) setNetwork(networks.data[0]); }, [networks.data, network]);
  const connectors = catalog.data ?? [];
  const connector = chosen ? connectors.find(item => item.kind === chosen.kind) : undefined;
  function choose(kind: string, detected: DiscoveredDevice | null) {
    const entry = connectors.find(item => item.kind === kind); if (!entry) return;
    setChosen({ kind, detected }); setDraft(initialDraft(kind, entry.form, null, detected));
  }
  async function scan() {
    if (scanning || !network) return;
    controller.current?.abort(); controller.current = new AbortController();
    setScanning(true); setScanError(''); setDevices(null);
    try { setDevices(await api.discover(network, controller.current.signal)); }
    catch (error) { if (!controller.current.signal.aborted) setScanError(error instanceof ApiError ? error.code : 'network'); }
    finally { setScanning(false); }
  }
  const saved = async (id: string) => { await client.invalidateQueries({ queryKey: ['fleet'] }); location.hash = '#machine/' + id; };

  if (catalog.isError) return <section className="panel stack"><h1 tabIndex={-1}>{t('addTitle')}</h1><p className="error" role="alert">{t('errors.network')}</p></section>;
  return <div className="stack machine-admin">
    <div className="hero"><div className="row wrap"><a className="button ghost" href="#machines" aria-label={t('back')}>←</a><div><h1 tabIndex={-1}>{t('addTitle')}</h1><p>{t('addIntro')}</p></div></div></div>
    {!chosen ? <>
      <section className="panel stack">
        <h2>{t('scanTitle')}</h2>
        <div className="row wrap machine-scan">
          <label className="stack">{t('network')}<select value={network} disabled={scanning || !networks.data?.length} onChange={event => setNetwork(event.target.value)}>{(networks.data ?? []).map(item => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className="primary" disabled={scanning || !network} onClick={() => { void scan(); }}>{scanning ? t('scanning') : t('scan')}</button>
        </div>
        {networks.data && !networks.data.length && <p className="notice">{t('noNetwork')}</p>}
        {scanning && <p role="status">{t('scanningHelp')}</p>}
        {scanError && <p className="error" role="alert">{t('errors.' + scanError, { defaultValue: t('errors.network') })}</p>}
        {devices && (devices.length ? <ul className="machine-devices">{devices.map((device, index) => {
          const model = connectors.find(item => item.kind === device.kind)?.model ?? device.kind;
          return <li key={index} className="row between wrap"><span><strong>{device.name ?? model}</strong><small>{device.name ? ' · ' + model : ''} · {device.kind === 'klipper' && device.origin ? new URL(device.origin).host : device.host}{device.transport ? ' · ' + device.transport.toUpperCase() : ''}</small></span>
            {device.registered ? <small>{t('alreadyAdded')}{device.detected === false ? ' · ' + t('noAnswer') : ''}</small>
              : <button type="button" onClick={() => choose(device.kind, device)}>{t(device.candidate ? 'verify' : 'configure')}</button>}</li>;
        })}</ul> : <p className="notice">{t('nothingFound')}</p>)}
      </section>
      <section className="panel stack">
        <h2>{t('manualTitle')}</h2><p className="muted">{t('manualHelp')}</p>
        <div className="machine-kinds">{connectors.map(item => <button type="button" key={item.kind} onClick={() => choose(item.kind, null)}>{item.model}</button>)}</div>
      </section>
    </> : connector && <section className="panel stack">
      <div className="row between wrap"><h2>{connector.model}</h2><button type="button" className="ghost" onClick={() => setChosen(null)}>{t('changeType')}</button></div>
      {chosen.detected && <p className="notice">{t('detectedAt', { host: chosen.detected.host })}</p>}
      <MachineForm api={api} connector={connector} detected={chosen.detected} draft={draft} setDraft={update => setDraft(update)} onSaved={id => { void saved(id); }} />
    </section>}
  </div>;
}
