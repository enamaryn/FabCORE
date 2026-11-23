// Notifications (MIG-06.2.3, #121) : ntfy et SMTP enregistrés et testés séparément ; un canal incomplet ne bloque
// jamais l'autre. Champ en cause signalé sous la saisie, avec la même validation que le serveur. Les secrets ne sont
// jamais relus : vide = conservé tant que la connexion ne change pas.
import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NotificationInputError, ntfySettings, smtpSettings } from '../../../../src/application/notifications.ts';
import { ApiError, type createApi, type NotificationView } from '../../api.ts';

type Api = ReturnType<typeof createApi>;
type Draft = Record<string, string | boolean>;
type Status = { kind: 'saved' | 'tested' | 'error'; text: string } | null;

const ntfyDraft = (view: NotificationView): Draft => ({ mode: view.ntfy.mode, url: view.ntfy.url ?? '', topic: view.ntfy.topic ?? '', auth: view.ntfy.auth ?? 'none', username: view.ntfy.username ?? '', secret: '' });
const smtpDraft = (view: NotificationView): Draft => ({ enabled: view.smtp.enabled, host: view.smtp.host ?? '', port: String(view.smtp.port ?? 587), tls: view.smtp.tls ?? 'starttls', from: view.smtp.from ?? '', to: view.smtp.to ?? '', auth: view.smtp.auth ?? false, username: view.smtp.username ?? '', secret: '' });
const same = (a: Draft, b: Draft) => Object.keys(a).every(key => key === 'secret' ? a[key] === '' : a[key] === b[key]);

export function NotificationsPage({ api }: { api: Api }) {
  const { t } = useTranslation('notifications');
  const settings = useQuery({ queryKey: ['notifications'], queryFn: ({ signal }) => api.notifications(signal), staleTime: Infinity });
  if (!settings.data) return <section className="panel stack"><h1 tabIndex={-1}>{t('title')}</h1>{settings.isError ? <><p className="error" role="alert">{t('loadFailed')}</p><button type="button" onClick={() => { void settings.refetch(); }}>{t('retry')}</button></> : <p role="status">{t('loading')}</p>}</section>;
  return <div className="stack react-notifications">
    <div className="hero"><div><h1 tabIndex={-1}>{t('title')}</h1><p>{t('intro')}</p></div></div>
    <ChannelForm channel="ntfy" api={api} view={settings.data} />
    <ChannelForm channel="smtp" api={api} view={settings.data} />
  </div>;
}

function ChannelForm({ channel, api, view }: { channel: 'ntfy' | 'smtp'; api: Api; view: NotificationView }) {
  const { t } = useTranslation('notifications');
  const client = useQueryClient();
  const saved = channel === 'ntfy' ? ntfyDraft(view) : smtpDraft(view);
  const [draft, setDraft] = useState<Draft>(saved);
  const [field, setField] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const id = useId();
  useEffect(() => { const conceal = () => { if (document.hidden) setVisible(false); }; document.addEventListener('visibilitychange', conceal); return () => document.removeEventListener('visibilitychange', conceal); }, []);
  const dirty = !same(draft, saved);
  const set = (key: string, value: string | boolean) => { setDraft(current => ({ ...current, [key]: value })); setStatus(null); if (field === channel + '.' + key) setField(null); };
  const enabled = channel === 'ntfy' ? saved.mode !== 'off' : saved.enabled === true;
  const testBlocked = !enabled ? t('testOff') : dirty ? t('testUnsaved') : busy ? t('busy') : null;

  const body = () => channel === 'ntfy'
    ? { mode: draft.mode, url: draft.url, topic: draft.topic, auth: draft.auth, username: draft.username, secret: draft.secret }
    : { enabled: draft.enabled, host: draft.host, port: Number(draft.port), tls: draft.tls, from: draft.from, to: draft.to, auth: draft.auth, username: draft.username, secret: draft.secret };
  async function save() {
    if (busy) return;
    const data = body();
    // Même validation que le serveur, champ par champ ; le serveur reste l'autorité (secrets, ntfy interne).
    try {
      if (channel === 'ntfy') ntfySettings(data, { ...view.ntfy }, view.internal ? { ...view.internal, username: 'stored', secret: 'stored' } : null, { assumeStoredSecret: true });
      else smtpSettings(data, { ...view.smtp }, { assumeStoredSecret: true });
    } catch (error) {
      if (error instanceof NotificationInputError) { setField(error.field); setStatus({ kind: 'error', text: t('fix') }); return; }
      if ((error as Error).message === 'ntfy-install-required') { setField('ntfy.mode'); setStatus({ kind: 'error', text: t('error.ntfy-install-required') }); return; }
    }
    setBusy(true); setField(null);
    try {
      const next = await api.saveNotifications({ [channel]: data });
      setVisible(false);
      client.setQueryData(['notifications'], next);
      // Saisie alignée sur ce qui a été enregistré (secret vidé), message conservé.
      setDraft(channel === 'ntfy' ? ntfyDraft(next) : smtpDraft(next));
      setStatus({ kind: 'saved', text: t('saved') });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'network';
      setStatus({ kind: 'error', text: t(['notifications-invalid', 'ntfy-install-required', 'storage-unavailable', 'forbidden', 'sign-in', 'rate'].includes(code) ? 'error.' + code : 'error.network') });
    } finally { setBusy(false); }
  }
  async function test() {
    if (testBlocked) return;
    setBusy(true); setStatus(null);
    try { await api.testNotification(channel); setStatus({ kind: 'tested', text: t(channel === 'ntfy' ? 'testedNtfy' : 'testedSmtp') }); }
    catch (error) {
      const code = error instanceof ApiError ? error.code : 'network';
      setStatus({ kind: 'error', text: t(['notifications-failed', 'rate', 'forbidden', 'sign-in'].includes(code) ? 'error.' + code : 'error.network') });
    } finally { setBusy(false); }
  }

  const input = (key: string, label: string, type = 'text', extra: Record<string, unknown> = {}) => {
    const name = channel + '.' + key, wrong = field === name;
    return <label key={key} className="stack">{label}
      <input type={type} value={String(draft[key] ?? '')} aria-invalid={wrong || undefined} aria-describedby={wrong ? id + name : undefined} onChange={event => set(key, event.target.value)} {...extra} />
      {wrong && <small className="error" id={id + name}>{t('field.' + key + (channel === 'ntfy' && key === 'username' ? 'Ntfy' : ''))}</small>}
    </label>;
  };
  const secret = (label: string) => {
    const name = channel + '.secret', wrong = field === name;
    return <><label htmlFor={id + 'secret'}>{label}</label><div className="secret-field"><input id={id + 'secret'} type={visible ? 'text' : 'password'} autoComplete="off" maxLength={512} placeholder={t('secretKept')} value={String(draft.secret)} aria-invalid={wrong || undefined} onChange={event => set('secret', event.target.value)} /><button type="button" aria-label={t(visible ? 'hide' : 'show')} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{t(visible ? 'hide' : 'show')}</button></div>{wrong && <small className="error">{t('field.secret')}</small>}</>;
  };

  return <form className="panel stack" aria-labelledby={id + 'title'} onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
    <h2 id={id + 'title'}>{t(channel === 'ntfy' ? 'ntfy' : 'smtp')}</h2>
    {channel === 'ntfy' ? <>
      <label className="stack">{t('mode')}<select value={String(draft.mode)} aria-invalid={field === 'ntfy.mode' || undefined} onChange={event => set('mode', event.target.value)}>
        <option value="off">{t('modeOff')}</option><option value="internal" disabled={!view.internal}>{t(view.internal ? 'modeInternal' : 'modeInternalMissing')}</option><option value="external">{t('modeExternal')}</option>
      </select></label>
      {view.internal && draft.mode === 'internal' && <small>{t('internalInfo', { url: view.internal.url, topic: view.internal.topic })}</small>}
      {draft.mode === 'external' && <fieldset className="fields stack">
        {input('url', t('url'), 'url', { placeholder: 'https://ntfy.example.fr', maxLength: 256 })}
        {input('topic', t('topic'), 'text', { maxLength: 64 })}
        <label className="stack">{t('auth')}<select value={String(draft.auth)} onChange={event => set('auth', event.target.value)}><option value="none">{t('authNone')}</option><option value="basic">{t('authBasic')}</option><option value="bearer">{t('authBearer')}</option></select></label>
        {draft.auth === 'basic' && input('username', t('username'), 'text', { maxLength: 128 })}
        {draft.auth !== 'none' && secret(t(draft.auth === 'bearer' ? 'token' : 'password'))}
      </fieldset>}
    </> : <>
      <label className="check"><input type="checkbox" checked={draft.enabled === true} onChange={event => set('enabled', event.target.checked)} /> {t('smtpEnabled')}</label>
      {draft.enabled === true && <fieldset className="fields stack">
        {input('host', t('host'), 'text', { maxLength: 253, autoComplete: 'off', placeholder: 'smtp.example.fr' })}
        {input('port', t('port'), 'number', { min: 1, max: 65535 })}
        <label className="stack">{t('tls')}<select value={String(draft.tls)} onChange={event => set('tls', event.target.value)}><option value="starttls">STARTTLS</option><option value="tls">TLS</option></select><small>{t('tlsHelp')}</small></label>
        {input('from', t('from'), 'email', { maxLength: 254, placeholder: 'fabcore@example.fr' })}
        {input('to', t('to'), 'email', { maxLength: 254, placeholder: 'atelier@example.fr' })}
        <label className="check"><input type="checkbox" checked={draft.auth === true} onChange={event => set('auth', event.target.checked)} /> {t('smtpAuth')}</label>
        {draft.auth === true && <>{input('username', t('username'), 'text', { maxLength: 128, autoComplete: 'off' })}{secret(t('password'))}</>}
      </fieldset>}
    </>}
    <div className="row wrap">
      <button type="submit" className="primary" disabled={busy || !dirty}>{t('save')}</button>
      <button type="button" disabled={Boolean(testBlocked)} aria-disabled={Boolean(testBlocked)} title={testBlocked ?? undefined} onClick={() => { void test(); }}>{t(channel === 'ntfy' ? 'testNtfy' : 'testSmtp')}</button>
      {testBlocked && <small>{testBlocked}</small>}
    </div>
    {status && <p className={status.kind === 'error' ? 'error' : ''} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
  </form>;
}
