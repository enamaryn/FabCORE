import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Brand, FleetPage, HistoryPage, Shell } from './components/index.js';
import { UpdatePrompt } from './components/UpdatePrompt.tsx';
import { shouldPrompt } from './update.ts';
import type { ActivityEntry, MachineData } from './types.js';
import { ApiError, createApi } from './api.ts';
import { subscribeFleet } from './events.ts';
import { MachineDetail } from './components/machine/MachineDetail.tsx';
import { ViewerPage } from './components/viewer/ViewerPage.tsx';
import { NotificationsPage } from './components/admin/NotificationsPage.tsx';
import { DiagnosticsPage } from './components/admin/DiagnosticsPage.tsx';
import { AccessPage } from './components/admin/AccessPage.tsx';
import { parseRoute } from './route.ts';
import type { Route } from './route.ts';
import { recordTemperatures } from './temperature.ts';
import type { TemperatureHistory } from './temperature.ts';
import { applyTheme, readPreference, savePreference } from './preferences.ts';
import type { Theme } from './preferences.ts';

function usePage() {
  const [page, setPage] = useState<Route>(() => parseRoute(location.hash) ?? { kind: 'home' });
  useEffect(() => { const change = () => { const next = parseRoute(location.hash); if (!next) return; setPage(next); requestAnimationFrame(() => document.querySelector<HTMLElement>('h1')?.focus()); }; addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  return page;
}
export function App() {
  const { t, i18n } = useTranslation('auth');
  const client = useQueryClient();
  const page = usePage();
  const [theme, setTheme] = useState<Theme>(() => { const value = readPreference('fabcore-theme', 'dark'); return value === 'light' || value === 'dark' ? value : 'system'; });
  const api = useMemo(() => createApi(fetch, () => {
    client.setQueryData(['session'], { installed: true, authenticated: false, username: null });
    for (const key of ['fleet', 'controls', 'files']) void client.cancelQueries({ queryKey: [key] }).then(() => client.removeQueries({ queryKey: [key] }));
  }), [client]);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => { document.documentElement.lang = i18n.resolvedLanguage ?? 'fr'; }, [i18n.resolvedLanguage]);
  const session = useQuery({ queryKey: ['session'], queryFn: ({ signal }) => api.session(signal), refetchInterval: 30000 });
  // Version : relue à chaque changement de page (le serveur met en cache la vérification auprès de GitHub, 10 min).
  const signedIn = session.data?.authenticated === true;
  const version = useQuery({ queryKey: ['version'], queryFn: ({ signal }) => api.version(signal), enabled: signedIn, staleTime: 0, retry: false });
  const pageKey = JSON.stringify(page);
  useEffect(() => { if (signedIn) void client.invalidateQueries({ queryKey: ['version'] }); }, [client, pageKey, signedIn]);
  // Annonce de mise à jour : administrateur seulement, selon « plus tard » / « ne pas me rappeler ».
  const [prompt, setPrompt] = useState(false);
  useEffect(() => { if (session.data?.role === 'admin' && shouldPrompt(version.data, Date.now())) setPrompt(true); }, [version.data, session.data?.role, pageKey]);
  const logout = useMutation({ mutationFn: () => api.logout(), retry: false, onSuccess: async () => { await client.cancelQueries(); client.clear(); client.setQueryData(['session'], { installed: true, authenticated: false, username: null }); } });
  const toggleLanguage = () => { const language = i18n.resolvedLanguage?.startsWith('fr') ? 'en' : 'fr'; savePreference('fabcore-lang', language); void i18n.changeLanguage(language); };
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'; savePreference('fabcore-theme', next); setTheme(next); };
  if (!session.data) return <main className="setup area"><Brand /><h1 tabIndex={-1}>{session.isError ? t('failed') : t('loading')}</h1>{session.isError && <button type="button" onClick={() => { void session.refetch(); }}>{t('retry')}</button>}</main>;
  if (!session.data.authenticated || !session.data.role || !session.data.username) return <main className="setup area"><Brand /><div className="row preference-actions"><button type="button" onClick={toggleLanguage}>{i18n.resolvedLanguage?.startsWith('fr') ? 'EN' : 'FR'}</button><button type="button" onClick={toggleTheme}>{i18n.t('themeLabel', { ns: 'common', theme: i18n.t('theme.' + theme, { ns: 'common' }) })}</button></div>{!session.data.installed ? <Setup api={api} /> : <Login api={api} oidc={session.data.oidcEnabled === true} />}</main>;
  return <Shell username={session.data.username} role={session.data.role} page={page.kind === 'machine' || page.kind === 'viewer' ? 'machines' : ['notifications', 'diagnostics', 'access'].includes(page.kind) ? 'home' : page.kind as 'home' | 'machines' | 'history'} language={i18n.resolvedLanguage ?? 'fr'} theme={theme} onLanguage={toggleLanguage} onTheme={toggleTheme} onLogout={() => { if (!logout.isPending) logout.mutate(); }} version={version.data} onUpdate={() => setPrompt(true)}>
    {session.data.role === 'admin' && version.data?.updateAvailable && <UpdatePrompt version={version.data} open={prompt} onClose={() => setPrompt(false)} />}
    {logout.isError && <p className="notice" role="alert">{t('error.internal')}</p>}
    {logout.isPending ? <p role="status">{t('loggingOut')}</p> : <Workshop key={session.data.username + ':' + session.data.role} api={api} username={session.data.username} role={session.data.role} page={page} />}
  </Shell>;
}
// Première installation (MIG-06.2.3) : jeton affiché dans le terminal de FabCore, administrateur local.
function Setup({ api }: { api: ReturnType<typeof createApi> }) {
  const { t } = useTranslation('admin'); const client = useQueryClient();
  const [token, setToken] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const setup = useMutation({ mutationFn: () => api.setup(token.trim(), username.trim(), password), retry: false,
    onSuccess: async () => { setToken(''); setPassword(''); setConfirm(''); await client.invalidateQueries({ queryKey: ['session'] }); },
    onError: failure => { const code = failure instanceof ApiError ? failure.code : 'network'; setError(['token', 'expired', 'installed', 'credentials', 'rate', 'storage-unavailable'].includes(code) ? code : 'network'); } });
  return <form className="panel stack" onSubmit={event => {
    event.preventDefault(); if (setup.isPending) return;
    if (username.trim().length < 3 || password.length < 12) return setError('credentials');
    if (password !== confirm) return setError('mismatch');
    setError(''); setup.mutate();
  }}>
    <h1 tabIndex={-1}>{t('setup.title')}</h1><p>{t('setup.help')}</p>
    <label className="stack">{t('setup.token')}<input type="password" autoComplete="off" required maxLength={128} value={token} onChange={event => setToken(event.target.value)} /></label>
    <label className="stack">{t('access.username')}<input autoComplete="username" required minLength={3} maxLength={40} value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label className="stack">{t('access.password')}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} aria-describedby="setup-password-help" onChange={event => setPassword(event.target.value)} /></label><small id="setup-password-help">{t('access.passwordHelp')}</small>
    <label className="stack">{t('access.confirm')}<input type="password" autoComplete="new-password" required maxLength={128} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
    {error && <p className="error" role="alert">{t('setup.error.' + error)}</p>}
    <button type="submit" className="primary" disabled={setup.isPending}>{t('setup.submit')}</button>
  </form>;
}
function Login({ api, oidc }: { api: ReturnType<typeof createApi>; oidc: boolean }) {
  const { t } = useTranslation('auth'); const client = useQueryClient();
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [visible, setVisible] = useState(false);
  // Données de l'ancienne session retirées, session relue sans détacher son observateur (sinon l'écran restait sur le formulaire).
  const login = useMutation({ mutationFn: () => api.login(username, password), retry: false, onSuccess: async () => { setPassword(''); setVisible(false); await client.cancelQueries(); client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); await client.invalidateQueries({ queryKey: ['session'] }); } });
  useEffect(() => { const conceal = () => { if (document.hidden) setVisible(false); }; document.addEventListener('visibilitychange', conceal); return () => document.removeEventListener('visibilitychange', conceal); }, []);
  const error = login.error instanceof ApiError && ['credentials', 'rate', 'response'].includes(login.error.code) ? login.error.code : 'network';
  return <form className="panel stack" onSubmit={event => { event.preventDefault(); if (!login.isPending) { setVisible(false); login.mutate(); } }}>
    <h1 tabIndex={-1}>{t('login')}</h1><label>{t('username')}<input autoComplete="username" required maxLength={40} value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label htmlFor="login-password">{t('password')}</label><div className="secret-field"><input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={t(visible ? 'hide' : 'show')} aria-pressed={visible} onClick={() => setVisible(value => !value)}><svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg></button></div>
    {login.isError && <p className="error" role="alert">{t('error.' + error)}</p>}<button type="submit" className="primary" disabled={login.isPending}>{login.isPending ? t('loading') : t('submit')}</button>{oidc && <a href="/api/oidc/start">{t('oidc')}</a>}
  </form>;
}
function Workshop({ api, username, role, page }: { api: ReturnType<typeof createApi>; username: string; role: 'admin' | 'observer'; page: Route }) {
  const { t } = useTranslation('auth'); const client = useQueryClient();
  const key = useMemo(() => ['fleet', username, role], [username, role]);
  const fleet = useQuery({ queryKey: key, queryFn: ({ signal }) => api.fleet(signal), refetchInterval: false, staleTime: 1000 });
  const [temperatures, setTemperatures] = useState<TemperatureHistory>(() => new Map());
  const previous = useRef<MachineData[]>([]); const [events, setEvents] = useState<ActivityEntry[]>([]);
  useEffect(() => subscribeFleet({ invalidate: () => { void client.invalidateQueries({ queryKey: key }); } }), [client, key]);
  useEffect(() => {
    if (!fleet.data) return;
    const machines = fleet.data;
    setTemperatures(history => recordTemperatures(history, machines));
    const before = new Map(previous.current.map(m => [m.id, m])); const changes: ActivityEntry[] = [];
    for (const m of fleet.data) if (m.checkedAt && Number.isFinite(Date.parse(m.checkedAt)) && before.get(m.id)?.status !== m.status) changes.push({ id: m.id + ':' + m.checkedAt, machineId: m.id, machineName: m.name, status: m.status, at: m.checkedAt });
    previous.current = fleet.data;
    if (changes.length) setEvents(items => [...changes, ...items].slice(0, 30));
  }, [fleet.data]);
  if (!fleet.data) return <section className="panel stack"><h1 tabIndex={-1}>{fleet.isError ? t('failed') : t('loading')}</h1>{fleet.isError && <button type="button" onClick={() => { void fleet.refetch(); }}>{t('retry')}</button>}</section>;
  // Administration : réservée à l'administrateur (le serveur refuse aussi l'observateur).
  if (page.kind === 'notifications' || page.kind === 'diagnostics' || page.kind === 'access') {
    if (role !== 'admin') return <FleetPage machines={fleet.data} overview role={role} events={events} />;
    return page.kind === 'notifications' ? <NotificationsPage api={api} /> : page.kind === 'diagnostics' ? <DiagnosticsPage api={api} /> : <AccessPage api={api} />;
  }
  if (page.kind === 'viewer') {
    const machine = fleet.data.find(item => item.id === page.id);
    // Clé : changer de fichier ou de session démonte le visualiseur et libère lecture, animation et écouteurs.
    return <>{fleet.isError && <p className="notice" role="status">{t('refreshFailed')}</p>}{machine ? <ViewerPage key={page.id + ':' + role + ':' + JSON.stringify(page.source)} machine={machine} source={page.source} role={role} stale={fleet.isError} api={api} /> : <MachineDetail id={page.id} machines={fleet.data} api={api} actor={username + ':' + role} role={role} samples={[]} stale={fleet.isError} />}</>;
  }
  return <>{fleet.isError && <p className="notice" role="status">{t('refreshFailed')}</p>}{page.kind === 'machine' ? <MachineDetail key={page.id + ':' + role} id={page.id} tab={page.tab} machines={fleet.data} api={api} actor={username + ':' + role} role={role} samples={temperatures.get(page.id) ?? []} stale={fleet.isError} /> : page.kind === 'history' ? <HistoryPage events={events} /> : <FleetPage machines={fleet.data} overview={page.kind === 'home'} role={role} events={events} />}</>;
}
