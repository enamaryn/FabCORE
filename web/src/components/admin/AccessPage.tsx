// Accès (MIG-06.2.3) : création d'un compte observateur (lecture seule). Le mot de passe n'est jamais réaffiché.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type createApi } from '../../api.ts';

export function AccessPage({ api }: { api: ReturnType<typeof createApi> }) {
  const { t } = useTranslation('admin');
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit() {
    if (busy) return;
    if (username.trim().length < 3 || password.length < 12) { setResult({ ok: false, text: t('access.error.credentials') }); return; }
    if (password !== confirm) { setResult({ ok: false, text: t('access.mismatch') }); return; }
    setBusy(true); setResult(null);
    try {
      const created = await api.addObserver(username.trim(), password);
      setUsername(''); setPassword(''); setConfirm('');
      setResult({ ok: true, text: t('access.created', { username: created.username }) });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'network';
      setResult({ ok: false, text: t(['credentials', 'observer-duplicate', 'observer-limit', 'storage-unavailable', 'forbidden', 'sign-in'].includes(code) ? 'access.error.' + code : 'access.error.network') });
    } finally { setBusy(false); setPassword(''); setConfirm(''); }
  }
  return <form className="panel stack" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h1 tabIndex={-1}>{t('access.title')}</h1>
    <p>{t('access.help')}</p>
    <label className="stack">{t('access.username')}<input value={username} minLength={3} maxLength={40} autoComplete="off" required onChange={event => setUsername(event.target.value)} /></label>
    <label className="stack">{t('access.password')}<input type="password" value={password} minLength={12} maxLength={128} autoComplete="new-password" required aria-describedby="access-password-help" onChange={event => setPassword(event.target.value)} /></label><small id="access-password-help">{t('access.passwordHelp')}</small>
    <label className="stack">{t('access.confirm')}<input type="password" value={confirm} maxLength={128} autoComplete="new-password" required onChange={event => setConfirm(event.target.value)} /></label>
    <div className="row wrap"><button type="submit" className="primary" disabled={busy}>{t('access.create')}</button></div>
    {result && <p className={result.ok ? '' : 'error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
  </form>;
}
