// Comptes cloud constructeur (administrateur) : certificats applicatifs Bambu, comptes et connexion (mot de passe
// puis code), inventaire des machines, ajout automatique au parc, suivi cloud, journal du compte.
// Les identifiants saisis ne quittent le formulaire que pour la requête et ne sont jamais conservés.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type CloudAccount, type CloudLogLine, type createApi } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { ProjectDialog } from '../projects/ProjectEditor.tsx';
import './cloud.css';

type Api = ReturnType<typeof createApi>;
type Dialog = { kind: 'add' } | { kind: 'login' | 'verify'; account: CloudAccount } | { kind: 'certificates' } | { kind: 'renewal' } | { kind: 'logs'; account: CloudAccount; lines: CloudLogLine[] } | { kind: 'delete'; account: CloudAccount } | { kind: 'remove'; account: CloudAccount; serial: string; machineId: string; name: string } | null;
const color = (value: unknown) => typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value) ? value : 'transparent';

export function CloudAccountsPage({ api, machines }: { api: Api; machines: MachineData[] }) {
  const { t, i18n } = useTranslation('cloud'); const client = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const overview = useQuery({ queryKey: ['cloud-accounts'], queryFn: ({ signal }) => api.cloudAccounts(signal),
    // Lecture locale seulement (jamais de requête Bambu) : rafraîchie pendant le suivi cloud, hors dialogue.
    refetchInterval: query => !dialog && query.state.data?.accounts.some(account => account.telemetryEnabled) ? 5000 : false });
  const certificates = useQuery({ queryKey: ['cloud-certificates'], queryFn: ({ signal }) => api.cloudCertificates(signal) });
  const message = (code: string) => t('errors.' + code, { defaultValue: t('errors.failed') });
  const date = (value?: string | null) => value ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : t('unknown');
  const reload = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['cloud-accounts'] }), client.invalidateQueries({ queryKey: ['cloud-certificates'] }), client.invalidateQueries({ queryKey: ['fleet'] })]); };
  async function act(run: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError('');
    try { await run(); await reload(); }
    catch (failure) { setError(failure instanceof ApiError ? failure.code : 'failed'); }
    finally { setBusy(false); }
  }
  const fleetFor = (account: CloudAccount, serial: string) => {
    const device = account.devices.find(item => item.serial === serial);
    if (device?.fleetId) return { id: device.fleetId, mode: device.fleetMode === 'lan' ? 'LAN' : 'Cloud' };
    const machine = machines.find(item => ['bambu', 'bambu-cloud'].includes(item.kind ?? '') && item.serial === serial);
    return machine ? { id: machine.id, mode: machine.kind === 'bambu' ? 'LAN' : 'Cloud' } : null;
  };

  const header = <div className="hero"><div><h1 tabIndex={-1}>{t('title')}</h1><p>{t('intro')}</p></div><button type="button" className="primary" disabled={!overview.data || busy} onClick={() => setDialog({ kind: 'add' })}>{t('addAccount')}</button></div>;
  if (!overview.data) return <div className="stack">{header}<section className="panel stack"><p role={overview.isError ? 'alert' : 'status'} className={overview.isError ? 'error' : ''}>{overview.isError ? message(overview.error instanceof ApiError ? overview.error.code : 'failed') : t('loading')}</p>{overview.isError && <div><button type="button" onClick={() => { void overview.refetch(); }}>{t('retry')}</button></div>}</section></div>;
  const providers = new Map(overview.data.providers.map(item => [item.id, item]));
  const cert = certificates.data;
  const expiring = cert && [cert.certificateExpiresAt, cert.crlExpiresAt].some(value => value && Date.parse(value) <= Date.now() + 7 * 86400000);

  return <div className="stack cloud-page">
    {header}
    {error && <p className="error" role="alert">{message(error)}</p>}
    <section className="panel stack">
      <div className="row between wrap"><div><h2>{t('certificates')}</h2><small>{t('certificatesIntro')}</small></div><button type="button" disabled={busy} onClick={() => setDialog({ kind: 'certificates' })}>{t('importPem')}</button></div>
      <strong>{cert?.configured ? t('imported') : t('notImported')}</strong>
      {cert?.fingerprint && <small><code>{cert.fingerprint}</code></small>}
      {cert?.configured && <>
        <small>{t('expiry', { certificate: date(cert.certificateExpiresAt), crl: date(cert.crlExpiresAt) })}</small>
        {expiring && <p className="notice">{t('expiring')}</p>}
        <small>{t(cert.refreshConfigured ? 'autoRenewal' : 'manualRenewal')}</small>
        {cert.renewal?.nextAttemptAt && <small>{t('nextRenewal', { date: date(cert.renewal.nextAttemptAt) })}</small>}
        {cert.renewal?.lastSuccessAt && <small>{t('lastRenewal', { date: date(cert.renewal.lastSuccessAt) })}</small>}
        {cert.renewal?.lastError && <p className="error" role="alert">{message(cert.renewal.lastError)}</p>}
        <div className="row wrap"><button type="button" disabled={busy} onClick={() => setDialog({ kind: 'renewal' })}>{t('renewalUrl')}</button>{cert.refreshConfigured && <button type="button" disabled={busy} onClick={() => { void act(() => api.cloudCertificatesWrite({ action: 'refresh' })); }}>{t('renewNow')}</button>}</div>
      </>}
      <small className="muted">{t('certificatesNote')}</small>
    </section>
    <p className="notice">{t('bambuNote')}</p>

    {overview.data.accounts.length ? overview.data.accounts.map(account => {
      const provider = providers.get(account.provider);
      return <section key={account.id} className="panel stack cloud-account">
        <div className="row between wrap"><div><h2>{account.name}</h2><small>{provider?.name ?? account.provider} · {account.email || t('noEmail')} · {t(account.region === 'china' ? 'china' : 'global')}</small></div><strong className="cloud-status" data-status={account.challenge ? 'challenge' : account.status}>{account.challenge ? t('status.challenge') : t('status.' + account.status, { defaultValue: t('unknown') })}</strong></div>
        {!provider?.available && <p className="notice">{t('providerPlanned')}</p>}
        {account.issue && <p className="error" role="alert">{message(account.issue)}</p>}
        {account.checkedAt && <small>{t('listReceived', { date: date(account.checkedAt) })}</small>}
        <div className="row wrap">
          {provider?.available && <button type="button" className="primary" disabled={busy} onClick={() => setDialog({ kind: account.challenge ? 'verify' : 'login', account })}>{t(account.challenge ? 'enterCode' : 'signIn')}</button>}
          {account.status === 'connected' && <button type="button" disabled={busy} onClick={() => { void act(() => api.cloudAction(account.id, 'devices')); }}>{t('refreshDevices')}</button>}
          {account.status === 'connected' && <button type="button" disabled={busy} onClick={() => { void act(() => api.cloudAction(account.id, account.telemetryEnabled ? 'telemetry-stop' : 'telemetry-start')); }}>{t(account.telemetryEnabled ? 'telemetryStop' : 'telemetryStart')}</button>}
          <button type="button" disabled={busy} onClick={() => { void act(async () => { const data = await api.cloudLogs(account.id); setDialog({ kind: 'logs', account, lines: data.lines }); }); }}>{t('log')}</button>
          {(account.status !== 'disconnected' || account.challenge) && <button type="button" disabled={busy} onClick={() => { void act(() => api.cloudAction(account.id, 'disconnect')); }}>{t('disconnect')}</button>}
          <button type="button" className="danger" disabled={busy} onClick={() => setDialog({ kind: 'delete', account })}>{t('delete')}</button>
        </div>
        {account.status === 'connected' && account.checkedAt && <div className="cloud-scroll"><table><thead><tr><th>{t('device')}</th><th>{t('model')}</th><th>{t('serial')}</th><th>{t('printState')}</th><th>{t('fleet')}</th></tr></thead><tbody>
          {account.devices.length ? account.devices.map(device => { const fleet = fleetFor(account, device.serial); return <tr key={device.serial}><td>{device.name}</td><td>{device.model || '—'}</td><td><code>{device.serial}</code></td>
            <td>{device.status === 'FAIL' ? t('printFail') : device.status || (device.online === true ? t('online') : device.online === false ? t('offline') : '—')}</td>
            <td>{fleet ? <span className="row wrap"><small>{fleet.mode}</small><button type="button" className="danger" disabled={busy} onClick={() => setDialog({ kind: 'remove', account, serial: device.serial, machineId: fleet.id, name: device.name })}>{t('removeFromFabcore')}</button></span>
              : <button type="button" className="primary" disabled={busy} onClick={() => { void act(() => api.cloudAction(account.id, 'import', { serial: device.serial })); }}>{t('addAutomatically')}</button>}</td></tr>; })
            : <tr><td colSpan={5}>{t('noDevices')}</td></tr>}
        </tbody></table></div>}
        {account.telemetryEnabled && <div className="stack"><div className="row between wrap"><strong>{t('monitoring')}</strong><span>{account.telemetry?.status ?? t('connecting')}</span></div>
          {account.telemetry?.issue && <p className="error">{message(account.telemetry.issue)}</p>}
          {(account.telemetry?.devices ?? []).map(device => <article key={device.serial} className="notice stack">
            <div className="row between wrap"><strong>{account.devices.find(item => item.serial === device.serial)?.name ?? device.serial}</strong><small>{device.stale ? t('waitingData') : date(device.checkedAt)}</small></div>
            <div className="row wrap">{device.heaters.map(heater => <span key={heater.id}><strong>{t(heater.id === 'bed' ? 'bed' : 'nozzle')}</strong> {heater.current ?? '—'} °C → {heater.target ?? '—'} °C</span>)}</div>
            {device.filaments.map(unit => <div key={unit.id} className="stack"><strong>AMS {unit.id + 1}{Number.isFinite(unit.humidity) ? ' · 💧 ' + unit.humidity + ' %' : ''}</strong><div className="row wrap">{unit.slots.map(slot => <span key={slot.id} className="cloud-slot"><i style={{ background: color(slot.color) }} />{slot.id + 1} · {slot.occupied === false ? t('empty') : slot.material || t('unknown')}</span>)}</div></div>)}
            <details><summary>{t('modules')}</summary>{device.modules.length ? device.modules.map((module, index) => <p key={index}>{module.model || module.name} · {module.serial} · {module.firmware}</p>) : '—'}</details>
          </article>)}
        </div>}
        {account.truncated && <small>{t('truncated')}</small>}
      </section>;
    }) : <section className="panel"><p>{t('noAccounts')}</p></section>}

    {dialog?.kind === 'add' && <AccountDialog api={api} providers={overview.data.providers} close={() => setDialog(null)} done={async account => { await reload(); setDialog(account.provider === 'bambu' ? { kind: account.challenge ? 'verify' : 'login', account } : null); }} />}
    {(dialog?.kind === 'login' || dialog?.kind === 'verify') && <SignInDialog key={dialog.kind + dialog.account.id} api={api} account={dialog.account} verify={dialog.kind === 'verify'} close={() => setDialog(null)} restart={() => setDialog({ kind: 'login', account: { ...dialog.account, challenge: null } })} done={async account => { await reload(); setDialog(account.challenge ? { kind: 'verify', account } : null); }} />}
    {dialog?.kind === 'certificates' && <CertificatesDialog api={api} close={() => setDialog(null)} done={async () => { await reload(); setDialog(null); }} />}
    {dialog?.kind === 'renewal' && <RenewalDialog api={api} close={() => setDialog(null)} done={async () => { await reload(); setDialog(null); }} />}
    {dialog?.kind === 'logs' && <ProjectDialog title={t('logTitle', { name: dialog.account.name })} busy={false} close={() => setDialog(null)}>
      <small>{t('logNote')}</small>
      <pre className="cloud-log">{dialog.lines.map(line => date(line.at) + ' · ' + logLabel(t, line) + '\n' + JSON.stringify(line, null, 2)).join('\n\n') || t('logEmpty')}</pre>
      <div className="row wrap"><a className="button" href={'/api/cloud-accounts/' + encodeURIComponent(dialog.account.id) + '/logs-download'} download>{t('downloadLog')}</a><button type="button" onClick={() => setDialog(null)}>{t('close')}</button></div>
    </ProjectDialog>}
    {dialog?.kind === 'delete' && <ProjectDialog title={t('deleteTitle')} busy={busy} close={() => setDialog(null)}><p>{t('deleteText', { name: dialog.account.name })}</p><div className="row wrap"><button type="button" onClick={() => setDialog(null)}>{t('cancel')}</button><button type="button" className="danger" disabled={busy} onClick={() => { const id = dialog.account.id; setDialog(null); void act(() => api.cloudAction(id, 'delete')); }}>{t('delete')}</button></div></ProjectDialog>}
    {dialog?.kind === 'remove' && <ProjectDialog title={t('removeTitle')} busy={busy} close={() => setDialog(null)}><p>{t('removeText', { name: dialog.name })}</p><div className="row wrap"><button type="button" onClick={() => setDialog(null)}>{t('cancel')}</button><button type="button" className="danger" disabled={busy} onClick={() => { const id = dialog.machineId; setDialog(null); void act(() => api.machineDelete(id)); }}>{t('removeFromFabcore')}</button></div></ProjectDialog>}
  </div>;
}

export function logLabel(t: TFunction, line: CloudLogLine) {
  return t('events.' + line.event, { defaultValue: line.event }) + (line.path ? ' · ' + (line.method ?? '') + ' ' + line.path : '') + (line.status ? ' · HTTP ' + line.status : '') + (line.count !== undefined ? ' · ' + t('devices', { count: line.count }) : '');
}

function useSubmit() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  async function submit(run: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await run(); } catch (failure) { if (alive.current) setError(failure instanceof ApiError ? failure.code : 'failed'); } finally { if (alive.current) setBusy(false); }
  }
  return { busy, error, submit };
}

function AccountDialog({ api, providers, close, done }: { api: Api; providers: { id: string; name: string; available: boolean }[]; close(): void; done(account: CloudAccount): Promise<void> }) {
  const { t } = useTranslation('cloud'); const { busy, error, submit } = useSubmit();
  const [draft, setDraft] = useState({ name: '', provider: providers[0]?.id ?? 'bambu', region: 'global', email: '' });
  return <ProjectDialog title={t('addAccount')} busy={busy} close={close}><form className="stack" onSubmit={event => { event.preventDefault(); void submit(async () => { await done(await api.cloudAccountAdd(draft)); }); }}>
    <label className="stack">{t('accountName')}<input required maxLength={80} placeholder={t('accountPlaceholder')} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label className="stack">{t('provider')}<select value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })}>{providers.map(item => <option key={item.id} value={item.id}>{item.name}{item.available ? '' : ' · ' + t('planned')}</option>)}</select></label>
    <label className="stack">{t('region')}<select value={draft.region} onChange={event => setDraft({ ...draft, region: event.target.value })}><option value="global">{t('globalLong')}</option><option value="china">{t('china')}</option></select></label>
    <label className="stack">{t('email')}<input type="email" required maxLength={254} autoComplete="off" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label>
    {error && <p className="error" role="alert">{t('errors.' + error, { defaultValue: t('errors.failed') })}</p>}
    <div className="row wrap"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t('save')}</button></div>
  </form></ProjectDialog>;
}

function SignInDialog({ api, account, verify, close, restart, done }: { api: Api; account: CloudAccount; verify: boolean; close(): void; restart(): void; done(account: CloudAccount): Promise<void> }) {
  const { t } = useTranslation('cloud'); const { busy, error, submit } = useSubmit();
  const secret = useRef<HTMLInputElement>(null);
  return <ProjectDialog title={t(verify ? 'verifyTitle' : 'signInTitle')} busy={busy} close={close}><form className="stack" autoComplete="off" onSubmit={event => {
    event.preventDefault();
    // Le secret est lu une fois puis effacé du champ ; il n'est jamais placé dans un état React.
    const value = secret.current?.value ?? ''; if (secret.current) secret.current.value = '';
    void submit(async () => { await done(await api.cloudAction(account.id, verify ? 'verify' : 'login', verify ? { code: value } : { password: value })); });
  }}>
    <p>{account.name} · {account.email}</p>
    {verify ? <><p>{t(account.challenge === 'email' ? 'codeEmail' : 'codeApp')}</p><label className="stack">{t('code')}<input ref={secret} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label></>
      : <><p className="notice">{t('passwordNote')}</p><label className="stack">{t('password')}<input ref={secret} type="password" required maxLength={256} autoComplete="off" /></label><small>{t('passwordSent')}</small></>}
    {busy && <p role="status">{t('connecting')}</p>}
    {error && <p className="error" role="alert">{t('errors.' + error, { defaultValue: t('errors.failed') })}</p>}
    <div className="row wrap"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button>{verify && <button type="button" disabled={busy} onClick={restart}>{t('restartSignIn')}</button>}<button type="submit" className="primary" disabled={busy}>{t(verify ? 'verify' : 'signIn')}</button></div>
  </form></ProjectDialog>;
}

function CertificatesDialog({ api, close, done }: { api: Api; close(): void; done(): Promise<void> }) {
  const { t } = useTranslation('cloud'); const { busy, error, submit } = useSubmit();
  const form = useRef<HTMLFormElement>(null);
  return <ProjectDialog title={t('importTitle')} busy={busy} close={close}><form ref={form} className="stack" autoComplete="off" onSubmit={event => {
    event.preventDefault();
    void submit(async () => {
      const payload: Record<string, string> = {};
      for (const field of ['key', 'chain', 'crl']) {
        const file = (form.current?.elements.namedItem(field) as HTMLInputElement | null)?.files?.[0];
        if (!file || file.size === 0 || file.size > 48 * 1024) throw new ApiError('bambu-cert-invalid', 400);
        payload[field] = await file.text();
      }
      const url = (form.current?.elements.namedItem('refreshUrl') as HTMLInputElement | null)?.value.trim();
      if (url) payload.refreshUrl = url;
      await api.cloudCertificatesWrite(payload); form.current?.reset(); await done();
    });
  }}>
    <p className="notice">{t('importNote')}</p>
    <label className="stack">key.pem — {t('keyFile')}<input name="key" type="file" accept=".pem,.key,text/plain" required /></label>
    <label className="stack">chain.pem — {t('chainFile')}<input name="chain" type="file" accept=".pem,text/plain" required /></label>
    <label className="stack">crl.pem — {t('crlFile')}<input name="crl" type="file" accept=".pem,text/plain" required /></label>
    <label className="stack">{t('refreshUrlOptional')}<input name="refreshUrl" type="url" inputMode="url" placeholder="https://…/applications/…/cert?aes256=…" /></label>
    <small>{t('refreshUrlNote')}</small>
    {busy && <p role="status">{t('validating')}</p>}
    {error && <p className="error" role="alert">{t('errors.' + error, { defaultValue: t('errors.failed') })}</p>}
    <div className="row wrap"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t('import')}</button></div>
  </form></ProjectDialog>;
}

function RenewalDialog({ api, close, done }: { api: Api; close(): void; done(): Promise<void> }) {
  const { t } = useTranslation('cloud'); const { busy, error, submit } = useSubmit(); const input = useRef<HTMLInputElement>(null);
  return <ProjectDialog title={t('renewalTitle')} busy={busy} close={close}><form className="stack" autoComplete="off" onSubmit={event => { event.preventDefault(); const value = input.current?.value.trim() ?? ''; if (input.current) input.current.value = ''; void submit(async () => { await api.cloudCertificatesWrite({ action: 'configure', refreshUrl: value }); await done(); }); }}>
    <label className="stack">trigger-url<input ref={input} type="url" maxLength={4096} placeholder="https://…/applications/…/cert?aes256=…" /></label>
    <p>{t('renewalNote')}</p>
    {error && <p className="error" role="alert">{t('errors.' + error, { defaultValue: t('errors.failed') })}</p>}
    <div className="row wrap"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t('save')}</button></div>
  </form></ProjectDialog>;
}
