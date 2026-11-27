import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, type createApi, type KlipperConfigFile } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { ProjectDialog } from '../projects/ProjectEditor.tsx';
import './klipper-config.css';
const limit = 1024 * 1024;
export function KlipperConfigPanel({ machine, api, stale }: { machine: MachineData; api: ReturnType<typeof createApi>; stale: boolean }) {
  const { t } = useTranslation('klipperConfig'); const client = useQueryClient();
  const [files, setFiles] = useState<{ path: string; writable: boolean }[]>([]), [loaded, setLoaded] = useState<KlipperConfigFile | null>(null), [content, setContent] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [result, setResult] = useState(''), [backup, setBackup] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'restart' | null>(null), [incoming, setIncoming] = useState<{ path: string; content: string } | null>(null);
  const live = useRef(true), lock = useRef(false), sequence = useRef(0), upload = useRef<HTMLInputElement>(null);
  const dirty = Boolean(loaded && (loaded.revision === null || content !== loaded.content));
  const writable = loaded?.revision === null || files.find(item => item.path === loaded?.path)?.writable === true;
  const allowed = !stale && !['printing', 'paused', 'offline', 'connecting'].includes(machine.status);
  const error = (value: unknown) => value instanceof ApiError ? value.code : 'config-unavailable';
  useEffect(() => { live.current = true; return () => { live.current = false; sequence.current++; }; }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    const navigation = (event: MouseEvent) => { const link = (event.target as HTMLElement).closest?.('a[href]'); if (dirty && link && !link.hasAttribute('download') && !window.confirm(t('discard'))) { event.preventDefault(); event.stopPropagation(); } };
    addEventListener('beforeunload', handler); document.addEventListener('click', navigation, true);
    return () => { removeEventListener('beforeunload', handler); document.removeEventListener('click', navigation, true); };
  }, [dirty, t]);
  async function refresh() { const value = await api.klipperConfigList(machine.id); if (live.current) setFiles(value.files); return value.files; }
  async function load(path: string) {
    if (lock.current || dirty && !window.confirm(t('discard'))) return;
    lock.current = true; setBusy(true); setFailure(''); setResult(''); const request = ++sequence.current;
    try { const file = await api.klipperConfigRead(machine.id, path); if (live.current && request === sequence.current) { setLoaded(file); setContent(file.content); } }
    catch (value) { if (live.current) setFailure(error(value)); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  useEffect(() => { void refresh().then(items => { const first = items.find(item => item.path === 'printer.cfg') ?? items[0]; if (first && live.current) void load(first.path); }).catch(value => { if (live.current) setFailure(error(value)); }); }, [machine.id]);
  async function perform() {
    if (!confirm || lock.current) return; const action = confirm; setConfirm(null); lock.current = true; setBusy(true); setFailure(''); setResult('');
    try {
      if (action === 'save' && loaded) {
        const file = await api.klipperConfigSave(machine.id, { path: loaded.path, content, expectedRevision: loaded.revision, confirm: true });
        if (live.current) { setLoaded(file); setContent(file.content); setBackup(file.backupPath); setResult('saved'); await refresh(); }
      } else if (action === 'restart') {
        const reply = await api.klipperRestart(machine.id); if (live.current) setResult('restart.' + reply.outcome);
        await client.invalidateQueries({ queryKey: ['fleet'] });
      }
    } catch (value) { if (live.current) setFailure(error(value)); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function receive(file: File | undefined) {
    if (!file || busy) return; setFailure('');
    if (!file.name.endsWith('.cfg') || file.size > limit) { setFailure('config-size'); return; }
    try { const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); if (text.includes(String.fromCharCode(0))) throw new Error('encoding'); setIncoming({ path: (loaded?.path.includes('/') ? loaded.path.slice(0, loaded.path.lastIndexOf('/') + 1) : '') + file.name, content: text }); }
    catch { setFailure('config-encoding'); }
  }
  async function importDraft() {
    if (!incoming || lock.current || dirty && !window.confirm(t('discard'))) return;
    lock.current = true; setBusy(true); setFailure(''); setResult('');
    try {
      let original: KlipperConfigFile;
      try { original = await api.klipperConfigRead(machine.id, incoming.path); }
      catch (value) { if (!(value instanceof ApiError) || value.code !== 'config-missing') throw value; original = { path: incoming.path, content: '', revision: null }; }
      if (live.current) { setLoaded(original); setContent(incoming.content); setIncoming(null); setResult('imported'); }
    } catch (value) { if (live.current) setFailure(error(value)); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  return <section className="panel stack klipper-config"><header><h2>{t('heading')}</h2><p className="muted">{t('description')}</p></header>
    <div className="row wrap"><label>{t('file')}<select disabled={busy} value={loaded?.path ?? ''} onChange={event => { void load(event.target.value); }}><option value="" disabled>{t('choose')}</option>{loaded && !files.some(item => item.path === loaded.path) && <option value={loaded.path}>{loaded.path}</option>}{files.map(item => <option key={item.path} value={item.path}>{item.path}{item.writable ? '' : ' · ' + t('readOnly')}</option>)}</select></label><button type="button" disabled={busy} onClick={() => { void refresh().catch(value => setFailure(error(value))); }}>{t('refresh')}</button><button type="button" disabled={busy || !loaded?.revision} onClick={() => { if (loaded) void load(loaded.path); }}>{t('reload')}</button>
      {loaded?.revision && <a className="button" download={loaded.path.split('/').at(-1)} href={api.klipperConfigDownload(machine.id, loaded.path)}>{t('download')}</a>}
      <button type="button" disabled={busy} onClick={() => upload.current?.click()}>{t('upload')}</button><input ref={upload} type="file" accept=".cfg" hidden onChange={event => { void receive(event.target.files?.[0]); event.target.value = ''; }} /></div>
    {loaded && <><div className="row between wrap"><strong>{loaded.path}</strong><span>{dirty ? t('unsaved') : t('upToDate')}</span></div><label className="stack">{t('content')}<textarea className="klipper-config-editor" spellCheck={false} aria-label={t('content')} disabled={busy || !writable} value={content} onChange={event => setContent(event.target.value)} /></label>{!writable && <p className="notice">{t('readOnly')}</p>}</>}
    <div className="row wrap"><button type="button" className="primary" disabled={busy || !allowed || !dirty || !writable || new TextEncoder().encode(content).byteLength > limit} onClick={() => setConfirm('save')}>{t('save')}</button><button type="button" disabled={busy || !allowed || dirty} onClick={() => setConfirm('restart')}>{t('restartButton')}</button></div>
    {!allowed && <p className="notice">{t('blocked')}</p>}<small>{t('limits')}</small>{busy && <p role="status">{t('working')}</p>}{failure && <p role="alert" className="error">{t('errors.' + failure)}</p>}{result && <p role="status" className="notice">{t(result)}{result === 'saved' && backup && <><br />{t('backup')} <code>{backup}</code></>}</p>}
    {confirm && <ProjectDialog title={t(confirm === 'save' ? 'confirmSave' : 'confirmRestart')} busy={busy} close={() => setConfirm(null)}><p>{t(confirm === 'save' ? 'saveDetail' : 'restartDetail', { machine: machine.name, path: loaded?.path ?? '' })}</p><div className="row"><button type="button" onClick={() => setConfirm(null)}>{t('cancel')}</button><button type="button" className="primary" onClick={() => { void perform(); }}>{t(confirm === 'save' ? 'save' : 'restartButton')}</button></div></ProjectDialog>}
    {incoming && <ProjectDialog title={t('upload')} busy={busy} close={() => setIncoming(null)}><p>{t('importHelp')}</p><label className="stack">{t('destination')}<input value={incoming.path} maxLength={255} onChange={event => setIncoming({ ...incoming, path: event.target.value })} /></label><div className="row"><button type="button" disabled={busy} onClick={() => setIncoming(null)}>{t('cancel')}</button><button type="button" className="primary" disabled={busy} onClick={() => { void importDraft(); }}>{t('loadDraft')}</button></div></ProjectDialog>}
  </section>;
}
