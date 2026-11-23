import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.ts';
import type { createApi } from '../../api.ts';
import type { FileSort } from '../../files.ts';
import { canLaunch, connectionSignature } from '../../file-batch.ts';
import { filePage, uploadProblem, fileError, viewerHref, downloadHref, localViewerHref } from '../../files.ts';
import { TransferDialog } from './TransferDialog.tsx';
import { PrintFileDialog } from './PrintFileDialog.tsx';
import './files.css';
type Props = { machine: MachineData; machines: MachineData[]; actor: string; role: 'admin' | 'observer'; stale: boolean; api: ReturnType<typeof createApi> };
export function FilesPanel({ machine, machines, actor, role, stale, api }: Props) {
  const { t, i18n } = useTranslation('files'); const client = useQueryClient();
  const [query, setQuery] = useState(''), [sort, setSort] = useState<FileSort>('newest'), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(5);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null), [uploaded, setUploaded] = useState<string | null>(null), [error, setError] = useState('');
  const [transfer, setTransfer] = useState<string | null>(null), [print, setPrint] = useState<string | null>(null);
  const alive = useRef(true), lock = useRef(false), lifetime = useRef(new AbortController());
  const latest = useRef({ machine, role, stale }); latest.current = { machine, role, stale };
  useEffect(() => () => { alive.current = false; lifetime.current.abort(); }, []);
  const supported = machine.capabilities?.files === true;
  const readable = supported && !stale && !['offline', 'connecting'].includes(machine.status) && (machine.kind !== 'longer-ray5' || ['ready', 'done'].includes(machine.status));
  const ready = !stale && canLaunch(machine, role);
  const key = ['files', actor, machine.id, connectionSignature(machine)];
  const inventory = useQuery({ queryKey: key, queryFn: ({ signal }) => api.files(machine.id, signal), enabled: readable, retry: false, staleTime: 5000, refetchOnWindowFocus: false });
  const view = filePage(inventory.data?.files ?? [], query, sort, page, pageSize, i18n.resolvedLanguage ?? 'fr');
  const changed = (id: string) => { void client.invalidateQueries({ queryKey: ['files', actor, id] }); void client.invalidateQueries({ queryKey: ['fleet'] }); };
  async function send(file: File) {
    const current = latest.current;
    if (lock.current || current.role !== 'admin' || current.stale || !current.machine.capabilities?.files || ['offline', 'connecting'].includes(current.machine.status) || (current.machine.kind === 'longer-ray5' && !['ready', 'done'].includes(current.machine.status))) return;
    const invalid = uploadProblem(current.machine, file); if (invalid) { setError(invalid); return; }
    lock.current = true; setError(''); setUploaded(null); setUpload({ name: file.name, percent: 0 });
    try {
      const stored = await api.upload(current.machine.id, file, percent => { if (alive.current) setUpload({ name: file.name, percent }); }, lifetime.current.signal);
      if (alive.current) setUploaded(stored.path);
    } catch (failure) { if (alive.current) setError(fileError(failure)); }
    finally { lock.current = false; if (alive.current) { setUpload(null); changed(current.machine.id); } }
  }
  const busy = upload !== null;
  const bytes = (size: number | null) => size === null ? t('unknown') : new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: size >= 1048576 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(size / (size >= 1048576 ? 1048576 : 1024));
  const date = (at: number | null) => at === null || !Number.isFinite(new Date(at).getTime()) ? t('unknown') : new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' }).format(at);
  const live = ['printing', 'paused'].includes(machine.status) && typeof machine.filePath === 'string' && typeof machine.filePosition === 'number' && Number.isFinite(machine.filePosition) ? machine.filePath : null;
  return <section className="panel stack react-files" aria-busy={inventory.isFetching || busy}><div className="row between wrap"><h2>{t(machine.capabilities?.retainedOnly ? 'retainedTitle' : 'title')}</h2>{supported && <button type="button" disabled={busy || !readable || inventory.isFetching} onClick={() => { void inventory.refetch(); }}>{t('refresh')}</button>}</div>
    <div className="row wrap"><a className="button ghost" href={localViewerHref(machine.id)}>{t('localViewer')}</a><small>{t('viewerKept')}</small></div>
    {!supported ? <p className="notice">{t('unsupported')}</p> : <>
      {machine.capabilities?.retainedOnly && <p className="notice">{t('retainedNotice')}</p>}{machine.kind === 'elegoo' && <p className="notice">{t('cc2Notice')}</p>}{machine.kind === 'longer-ray5' && <p className="notice">{t('ray5Notice')}</p>}
      {!readable && <p className="notice" role="status">{t(machine.kind === 'longer-ray5' && !['offline', 'connecting'].includes(machine.status) && !stale ? 'ray5Idle' : 'unavailable')}</p>}
      {live && <a className="button ghost" href={viewerHref(machine.id, live, true)}>{t('follow')} · {live}</a>}
      {role === 'admin' && <label className="stack">{t('upload')}<input type="file" accept={'.gcode,.gco,.g' + (machine.kind === 'longer-ray5' ? ',.gc,.nc' : machine.capabilities?.projects ? ',.3mf' : '')} disabled={busy || !readable} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void send(file); }} /></label>}
      {upload && <div role="status"><p>{t(upload.percent === 100 ? 'uploadWaiting' : 'uploading', { name: upload.name, percent: upload.percent })}</p><progress value={upload.percent} max={100} aria-label={t('uploadProgress')} /></div>}
      {uploaded && <div className="notice row wrap" role="status"><span>{t('uploaded', { path: uploaded })}</span>{ready && <button type="button" disabled={busy} onClick={() => setPrint(uploaded)}>{t('start')}</button>}</div>}
      <div className="file-filters"><label>{t('search')}<input type="search" maxLength={200} placeholder={t('searchPlaceholder')} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label><label>{t('sort')}<select value={sort} onChange={event => { setSort(event.target.value as FileSort); setPage(0); }}><option value="newest">{t('newest')}</option><option value="oldest">{t('oldest')}</option><option value="name">{t('az')}</option></select></label><label>{t('perPage')}<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={5}>5</option><option value={20}>20</option></select></label></div>
      {error && <p className="error" role="alert">{t('errors.' + error)}</p>}{inventory.isError && <p className="error" role="alert">{t('errors.files-unavailable')}</p>}{inventory.data?.truncated && <p className="notice">{t('truncated')}</p>}
      {inventory.isPending && readable ? <p role="status">{t('loading')}</p> : inventory.data && view.count ? <><div className="table"><table><thead><tr>{['file', 'size', 'modified', 'actions'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{view.rows.map(file => <tr key={file.path}><td>{file.path}</td><td>{bytes(file.size)}</td><td>{date(file.modified)}</td><td><div className="row wrap">{readable && !busy ? <><a className="button ghost" href={viewerHref(machine.id, file.path)}>{t('view')}</a><a className="button ghost" href={downloadHref(machine.id, file.path)} download>{t('download')}</a></> : <span>{t('unavailable')}</span>}{role === 'admin' && <button type="button" disabled={!readable || busy} onClick={() => setTransfer(file.path)}>{t('transfer')}</button>}{ready && <button type="button" disabled={busy} onClick={() => setPrint(file.path)}>{t('start')}</button>}</div></td></tr>)}</tbody></table></div><div className="row between wrap" aria-label={t('pagination')}><small role="status">{t('count', { start: view.start + 1, end: view.start + view.rows.length, count: view.count })}</small><div className="row wrap"><button type="button" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>{t('previous')}</button><span>{t('page', { page: view.page + 1, pages: view.pages })}</span><button type="button" disabled={view.page + 1 === view.pages} onClick={() => setPage(view.page + 1)}>{t('next')}</button></div></div></> : inventory.data && !inventory.isError ? <p role="status">{t(query.trim() ? 'noMatches' : machine.capabilities?.retainedOnly ? 'noRetained' : 'empty')}</p> : null}
    </>}
    {transfer && role === 'admin' && <TransferDialog source={machine} path={transfer} machines={stale ? [] : machines} role={role} api={api} close={() => setTransfer(null)} changed={changed} />}
    {print && role === 'admin' && <PrintFileDialog machine={machine} path={print} role={role} stale={stale} api={api} close={() => setPrint(null)} changed={() => changed(machine.id)} />}
  </section>;
}
