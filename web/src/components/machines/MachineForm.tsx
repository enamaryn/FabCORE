// Formulaire de machine (ajout ou modification), même contrat que l'ancienne interface : champs selon le type
// (catalogue serveur), test de connexion sans enregistrement, appairage M2, enregistrement vérifié par le serveur.
// Les secrets (code LAN, clé API) ne sont jamais relus : vide = conservé tant que l'adresse ne change pas.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type ConnectorKind, type createApi, type DiscoveredDevice, type MachineWrite } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { codeLabel } from '../admin/codes.ts';

type Api = ReturnType<typeof createApi>;
export type MachineDraft = Record<string, string>;

/** Valeurs initiales depuis la machine enregistrée ou l'appareil détecté. */
export function initialDraft(kind: string, form: string, existing?: MachineData | null, detected?: DiscoveredDevice | null): MachineDraft {
  const origin = existing?.origin ?? detected?.origin ?? '';
  let host = detected?.host ?? '', port = '';
  try { if (origin && form !== 'http') { const url = new URL(origin); host = url.hostname; port = url.port; } } catch { /* adresse non lisible : saisie manuelle */ }
  const transport = String(existing?.transport ?? detected?.transport ?? 'tcp');
  return {
    kind, name: existing?.name ?? '', host, origin: form === 'http' ? origin : '', apiKey: '', accessCode: '',
    serial: String(existing?.serial ?? detected?.serial ?? ''), transport,
    port: port || (transport === 'tcp' ? '8080' : '8848'),
    wsPort: String((existing as { wsPort?: number } | undefined)?.wsPort ?? detected?.wsPort ?? 8849),
    httpPort: String((existing as { httpPort?: number } | undefined)?.httpPort ?? detected?.httpPort ?? (transport === 'tcp' ? 80 : 8848)),
  };
}
/** Corps envoyé au serveur : uniquement les champs du type, l'identifiant en modification. */
export function payload(input: MachineDraft, form: string, id?: string): Record<string, unknown> {
  const draft = { kind: '', name: '', origin: '', apiKey: '', host: '', serial: '', accessCode: '', transport: 'tcp', port: '', wsPort: '', httpPort: '', ...input };
  const base: Record<string, unknown> = { kind: draft.kind, name: draft.name.trim(), ...(id ? { id } : {}) };
  if (form === 'http') return { ...base, origin: draft.origin.trim(), apiKey: draft.apiKey };
  base.host = draft.host.trim();
  if (form === 'bambu') return { ...base, serial: draft.serial.trim(), accessCode: draft.accessCode };
  if (form === 'elegoo') return { ...base, accessCode: draft.accessCode };
  if (form === 'elegoo-cc1') return { ...base, ...(draft.serial.trim() ? { serial: draft.serial.trim() } : {}) };
  if (form === 'longer-ray5') return { ...base, transport: draft.transport, port: draft.port, wsPort: draft.wsPort, httpPort: draft.httpPort };
  return base;
}

export function MachineForm({ api, connector, existing, detected, draft, setDraft, onSaved, extra }: {
  api: Api; connector: ConnectorKind; existing?: MachineData | null; detected?: DiscoveredDevice | null;
  draft: MachineDraft; setDraft(update: (current: MachineDraft) => MachineDraft): void; onSaved(id: string): void; extra?: React.ReactNode;
}) {
  const { t } = useTranslation('machineAdmin');
  const [busy, setBusy] = useState<MachineWrite | null>(null), [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const controller = useRef<AbortController | null>(null), alive = useRef(true);
  useEffect(() => () => { alive.current = false; controller.current?.abort(); }, []);
  const form = connector.form, edit = Boolean(existing);
  const set = (key: string, value: string) => { setStatus(null); setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'transport') { next.port = value === 'tcp' ? '8080' : '8848'; next.httpPort = value === 'tcp' ? '80' : '8848'; }
    // Adresse modifiée : le numéro de série relu ne correspond plus forcément (CC2).
    if ((key === 'host' || key === 'origin') && form === 'elegoo') next.serial = '';
    return next;
  }); };
  const message = (code: string) => t('errors.' + code, { defaultValue: '' }) || codeLabel(t, code, ['issue']);
  async function run(action: 'test' | 'add' | 'edit' | 'pair') {
    if (busy) return;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(action); setStatus(action === 'pair' ? { kind: 'info', text: t('pairing') } : action === 'test' ? { kind: 'info', text: t('testing') } : null);
    try {
      const result = await api.machineWrite(action, payload(draft, form, existing?.id), controller.current.signal);
      if (!alive.current) return;
      if (action === 'test') {
        if (result.serial) setDraft(current => ({ ...current, serial: result.serial! }));
        setStatus(result.ok ? { kind: 'ok', text: result.issue ? message(result.issue) : t('testOk') } : { kind: 'error', text: message(result.issue ?? 'connection') });
        return;
      }
      if (result.id) onSaved(result.id);
    } catch (error) {
      if (alive.current && !controller.current?.signal.aborted) setStatus({ kind: 'error', text: message(error instanceof ApiError ? error.code : 'network') });
    } finally { if (alive.current) setBusy(null); }
  }
  const field = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
    <label className="stack">{label}<input value={draft[key] ?? ''} disabled={Boolean(busy) || props.readOnly} onChange={event => set(key, event.target.value)} {...props} /></label>;
  const secretKept = edit ? t('secretKept') : undefined;
  return <form className="stack machine-form" onSubmit={event => { event.preventDefault(); void run(edit ? 'edit' : 'add'); }}>
    <div className="fields machine-form-grid">
      {field('name', t('name'), { required: true, maxLength: 80, autoComplete: 'off' })}
      {form === 'http' ? <>
        {field('origin', t('origin', { model: connector.model }), { type: 'url', required: true, maxLength: 200, placeholder: 'http://192.168.1.50' + (connector.port && connector.port !== 80 ? ':' + connector.port : '') })}
        {field('apiKey', t(connector.required ? 'apiKey' : 'apiKeyOptional'), { type: 'password', required: connector.required && !edit, maxLength: 256, autoComplete: 'new-password', placeholder: secretKept })}
      </> : <>
        {field('host', t('host'), { required: true, maxLength: 15, placeholder: '192.168.1.50', inputMode: 'decimal', autoComplete: 'off' })}
        {form === 'longer-ray5' && <>
          <label className="stack">{t('transport')}<select value={draft.transport} disabled={Boolean(busy)} onChange={event => set('transport', event.target.value)}><option value="tcp">GRBL TCP · 8080</option><option value="esp3d">ESP3D · HTTP 8848 / WebSocket 8849</option></select></label>
          {field('port', t('port'), { type: 'number', min: 1, max: 65535, required: true })}
          {draft.transport === 'esp3d' && field('wsPort', t('wsPort'), { type: 'number', min: 1, max: 65535, required: true })}
          {field('httpPort', t('httpPort'), { type: 'number', min: 1, max: 65535, required: true })}
        </>}
        {form === 'bambu' && field('serial', t('serial'), { required: true, maxLength: 32, autoComplete: 'off' })}
        {['bambu', 'elegoo'].includes(form) && field('accessCode', t('accessCode'), { type: 'password', required: !edit, minLength: form === 'bambu' ? 8 : 1, maxLength: form === 'bambu' ? 8 : 64, autoComplete: 'new-password', placeholder: secretKept })}
        {form === 'elegoo' && field('serial', t('serial'), { readOnly: true, placeholder: t('serialFromTest') })}
        {form === 'elegoo-cc1' && field('serial', t('mainboard'), { readOnly: edit || Boolean(detected?.serial), maxLength: 64, autoComplete: 'off' })}
        {['xtool-m2', 'longer-ray5'].includes(form) && (existing?.serial || detected?.serial) ? field('serial', t('serial'), { readOnly: true }) : null}
      </>}
    </div>
    {form === 'longer-ray5' && <small>{t('ray5Note')}</small>}
    {form === 'xtool-m2' && <small>{t('m2Note')}</small>}
    {extra}
    {status && <p className={status.kind === 'error' ? 'error' : 'notice'} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    <div className="row wrap">
      <button type="button" disabled={Boolean(busy)} onClick={() => { void run('test'); }}>{busy === 'test' ? t('testing') : t('test')}</button>
      {form === 'xtool-m2' && <button type="button" disabled={Boolean(busy)} onClick={() => { void run('pair'); }}>{t('pair')}</button>}
      <button type="submit" className="primary" disabled={Boolean(busy)}>{t(edit ? 'save' : 'add')}</button>
    </div>
  </form>;
}
