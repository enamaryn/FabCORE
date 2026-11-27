import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ProjectBoard, ProductionWork } from '../../../../src/domain/projects.ts';
import type { MachineData } from '../../types.ts';
import { ApiError, type createApi } from '../../api.ts';
import { subscribeFleet } from '../../events.ts';
import { dropInstant, localDateTime, productionWarnings, visibleDays, workInterval } from '../../production.ts';
import { WorkEditor } from '../projects/ProjectEditor.tsx';
import '../projects/projects.css';
import './production.css';
import { ProductionDetails } from './ProductionDetails.tsx';
import { executionMetrics, executionPhase, latestExecution, type ExecutionAction } from '../../production-actuals.ts';

type Write = { workId?: string; data: Record<string, unknown> };
const dragType = 'application/x-fabcore-production';
export function ProductionPage({ api, actor, role }: { api: ReturnType<typeof createApi>; actor: string; role: 'admin' | 'observer' }) {
  const { t } = useTranslation('production'), client = useQueryClient();
  const key = useMemo(() => ['project-board', actor, role], [actor, role]);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => api.production(signal), staleTime: 1000, refetchInterval: 30000 });
  const fleet = useQuery({ queryKey: ['fleet', actor, role], queryFn: ({ signal }) => api.fleet(signal), retry: false, staleTime: 30000, refetchInterval: 30000 });
  useEffect(() => subscribeFleet({ events: ['projects.changed'], invalidate: () => { void client.invalidateQueries({ queryKey: key }); } }), [client, key]);
  const mutation = useMutation({ retry: false, mutationFn: (action: Write) => api.saveProductionWork(action.workId, action.data),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); },
    onError: error => { if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: key }); } });
  const executionMutation = useMutation({ retry: false, mutationFn: async (action: ExecutionAction): Promise<unknown> => {
    if (action.kind === 'start') return api.linkProductionExecution(action.workId, action.data);
    if (action.kind === 'finish') return api.finishProductionExecution(action.workId, action.executionId, action.data);
    if (action.kind === 'preview') return api.previewProductionReplan(action.workId, action.data);
    return api.applyProductionReplan(action.data);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); }, onError: error => { if (error instanceof ApiError && error.status === 409) void client.invalidateQueries({ queryKey: key }); } });
  const failure = executionMutation.error ?? mutation.error;
  if (!query.data) return <section className="panel stack"><h1 tabIndex={-1}>{t('heading')}</h1><p role="status">{t(query.isError ? 'loadFailed' : 'loading')}</p>{query.isError && <button type="button" onClick={() => { void query.refetch(); }}>{t('refresh')}</button>}</section>;
  return <>{query.isError && <p role="alert" className="notice">{t('refreshFailed')}</p>}{fleet.isError && <p className="notice">{t('fleetUnavailable')}</p>}
    <ProductionBoard board={query.data} machines={fleet.data ?? []} role={role} busy={mutation.isPending || executionMutation.isPending} error={failure instanceof ApiError ? failure.code : failure ? 'internal' : ''} clearError={() => { mutation.reset(); executionMutation.reset(); }} write={action => mutation.mutateAsync(action)} execute={action => executionMutation.mutateAsync(action)} refresh={() => { void fleet.refetch().then(() => query.refetch()); }} />
  </>;
}
export function ProductionBoard({ board, machines, role, busy, error, clearError, write, execute, refresh }: { board: ProjectBoard; machines: MachineData[]; role: 'admin' | 'observer'; busy: boolean; error: string; clearError(): void; write(action: Write): Promise<unknown>; execute?(action: ExecutionAction): Promise<unknown>; refresh(): void }) {
  const { t, i18n } = useTranslation('production'), { t: projectText } = useTranslation('projects');
  const admin = role === 'admin';
  const [anchor, setAnchor] = useState(() => localDateTime(new Date().toISOString()).slice(0, 10));
  const [hourWidth, setHourWidth] = useState(60);
  const [span, setSpan] = useState(1), [search, setSearch] = useState(''), [includeDone, setIncludeDone] = useState(false);
  const [editor, setEditor] = useState<{ work: ProductionWork | null } | null>(null);
  const [dropError, setDropError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null), [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const detail = board.work.find(item => item.id === detailId);
  const days = visibleDays(anchor, span), start = days[0]!.getTime(), end = days[span]!.getTime();
  const warnings = productionWarnings(board.work, now);
  const work = board.work.filter(item => (includeDone || item.state === 'todo') && [item.title, item.client ?? '', item.material, item.fileReference, board.projects.find(project => project.id === item.projectId)?.title ?? ''].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const reserve = work.filter(item => !workInterval(item));
  const missing = [...new Set(work.flatMap(item => item.machineId && !machines.some(machine => machine.id === item.machineId) ? [item.machineId] : []))];
  const lanes = [...machines.map(machine => ({ id: machine.id, name: machine.name, removed: false })), ...missing.map(id => ({ id, name: work.find(item => item.machineId === id)?.machineNameSnapshot ?? t('removedMachine'), removed: true }))];
  const editMetadata = (item: ProductionWork | null) => { clearError(); setDropError(''); setDetailId(null); setEditor({ work: item ? structuredClone(item) : null }); };
  const edit = (item: ProductionWork | null) => { clearError(); setDropError(''); if (item) setDetailId(item.id); else editMetadata(null); };
  const dateTime = (instant: string) => new Date(instant).toLocaleString(i18n.resolvedLanguage, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const status = (item: ProductionWork) => <>{warnings.conflicts.has(item.id) && <span className="production-warning">{t('overlap')}</span>}{warnings.late.has(item.id) && <span className="production-warning">{t('late')}</span>}<span className="production-phase" data-phase={executionPhase(item)}>{t('phases.' + executionPhase(item))}</span>{executionMetrics(item, now).overrun && <span className="production-warning">{t('overrunShort')}</span>}</>;
  const drag = (event: DragEvent, item: ProductionWork) => { event.dataTransfer.setData(dragType, JSON.stringify({ id: item.id, revision: item.revision })); event.dataTransfer.effectAllowed = 'move'; };
  const drop = (event: DragEvent<HTMLDivElement>, machineId: string, index?: number) => {
    if (!admin || busy) return; event.preventDefault(); event.stopPropagation(); clearError(); setDropError('');
    try {
      const payload = JSON.parse(event.dataTransfer.getData(dragType)) as { id: string; revision: number };
      const item = board.work.find(value => value.id === payload.id);
      if (!item || item.state !== 'todo' || latestExecution(item)?.outcome === 'active') return;
      if (!item.estimatedMinutes) { setDropError('durationRequired'); editMetadata(item); setDropError('durationRequired'); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      void write({ workId: item.id, data: { expectedRevision: payload.revision, machineId, scheduledStart: dropInstant(index === undefined ? days[0]! : days[index]!, index === undefined ? days[span]! : days[index + 1]!, (event.clientX - rect.left) / rect.width) } }).catch(() => {});
    } catch { /* External drag data cannot create a production order. */ }
  };
  const moveRange = (direction: number) => { const date = new Date(days[0]!); date.setDate(date.getDate() + direction * span); if (date.getFullYear() >= 1900 && date.getFullYear() <= 9998) setAnchor(localDateTime(date.toISOString()).slice(0, 10)); };
  return <div className="production-page"><header className="row between wrap"><div><h1 tabIndex={-1}>{t('heading')}</h1><p className="muted">{t('subtitle')}</p></div><div className="row wrap">{admin && <button type="button" className="primary" disabled={busy} onClick={() => edit(null)}>{t('newWork')}</button>}<button type="button" onClick={refresh}>{t('refresh')}</button></div></header>
    <div className="production-toolbar"><label>{t('search')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><label>{t('from')}<input type="date" required min="1900-01-01" max="9998-12-31" value={anchor} onChange={event => { if (event.target.value && event.target.validity.valid) setAnchor(event.target.value); }} /></label><label>{t('view')}<select value={span} onChange={event => setSpan(Number(event.target.value))}><option value={1}>{t('day')}</option><option value={7}>{t('week')}</option></select></label>{span === 1 && <label>{t('hourScale')}<select value={hourWidth} onChange={event => setHourWidth(Number(event.target.value))}>{[30, 60, 120].map(value => <option key={value} value={value}>{t('hourScaleValue', { value })}</option>)}</select></label>}<div className="row"><button type="button" aria-label={t('previous')} onClick={() => moveRange(-1)}>←</button><button type="button" onClick={() => setAnchor(localDateTime(new Date().toISOString()).slice(0, 10))}>{t('today')}</button><button type="button" aria-label={t('next')} onClick={() => moveRange(1)}>→</button></div><label className="row"><input type="checkbox" checked={includeDone} onChange={event => setIncludeDone(event.target.checked)} />{t('includeDone')}</label></div>
    <p className="production-help">{t(admin ? 'dragHelp' : 'readOnly')} {t('localTime')}</p>{error && !editor && <p role="alert" className="error">{projectText('errors.' + error)}</p>}{dropError && <p role="alert" className="error">{t(dropError)}</p>}
    <div className="production-layout"><section className="production-reserve" aria-labelledby="production-reserve"><header><h2 id="production-reserve">{t('unplanned')} <span>{reserve.length}</span></h2><small>{t('reserveHelp')}</small></header><div className="production-reserve-list">{reserve.map(item => <article key={item.id} className="production-reserve-card" draggable={admin && !busy && item.state === 'todo' && latestExecution(item)?.outcome !== 'active'} onDragStart={event => drag(event, item)}><button type="button" onClick={() => edit(item)}>{item.title}</button><small>{item.client || t('standalone')}</small><small>{item.quantity} × {item.material || projectText('notSet')} · {item.estimatedMinutes ? item.estimatedMinutes + ' min' : t('missingDuration')}</small>{item.projectId && <small>{board.projects.find(value => value.id === item.projectId)?.title ?? t('missingProject')}</small>}<div className="row wrap">{status(item)}</div></article>)}{!reserve.length && <p className="muted">{t('emptyReserve')}</p>}</div></section>
      <section className="production-gantt" aria-labelledby="production-gantt"><h2 id="production-gantt" className="sr-only">{t('gantt')}</h2><div className="production-timeline" style={{ minWidth: span === 7 ? 840 : 145 + (end - start) / 3600000 * hourWidth }}><div className="production-timeline-head"><strong>{t('machine')}</strong><div className="production-time-head">{days.slice(0, -1).map((day, index) => <div key={index} style={{ left: (day.getTime() - start) / (end - start) * 100 + '%', width: (days[index + 1]!.getTime() - day.getTime()) / (end - start) * 100 + '%' }}><strong>{day.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'short', day: 'numeric', month: 'short' })}</strong><small>{span === 1 ? t('dayHours') : '00:00'}</small></div>)}{span === 1 && <div className="production-hour-ticks">{Array.from({ length: Math.round((end - start) / 3600000) }, (_, hour) => new Date(start + hour * 3600000)).map(tick => { return <span key={tick.getTime()} style={{ left: (tick.getTime() - start) / (end - start) * 100 + '%' }}>{String(tick.getHours()).padStart(2, '0')}:00</span>; })}</div>}</div></div>
      {lanes.map(lane => {
        const laneWork = work.flatMap(item => { const interval = workInterval(item); return item.machineId === lane.id && interval && interval.end > start && interval.start < end ? [{ item, ...interval }] : []; }).sort((a, b) => a.start - b.start);
        // Stack overlapping bars so every order remains visible and clickable.
        const occupied: number[] = []; const placed = laneWork.map(value => { let track = occupied.findIndex(until => until <= value.start); if (track < 0) track = occupied.length; occupied[track] = value.end; return { ...value, track }; });
        return <div key={lane.id} className="production-lane"><div className="production-machine"><strong>{lane.name}</strong>{lane.removed && <small>{t('removedMachine')}</small>}</div><div className="production-track" onDragOver={event => { if (admin && !busy && !lane.removed && event.dataTransfer.types.includes(dragType)) event.preventDefault(); }} onDrop={event => { if (!lane.removed) drop(event, lane.id); }} style={{ height: Math.max(1, occupied.length) * 62 + 10 }}>
          {days.slice(0, -1).map((day, index) => <div key={index} className="production-day-target" aria-label={t('dropTarget', { machine: lane.name, day: day.toLocaleDateString(i18n.resolvedLanguage) })} style={{ left: (day.getTime() - start) / (end - start) * 100 + '%', width: (days[index + 1]!.getTime() - day.getTime()) / (end - start) * 100 + '%', ...(span === 1 ? { backgroundImage: 'linear-gradient(to right,var(--line) 1px,transparent 1px),linear-gradient(to right,color-mix(in srgb,var(--line) 35%,transparent) 1px,transparent 1px)', backgroundSize: `${3600000 / (end - start) * 100}% 100%,${900000 / (end - start) * 100}% 100%` } : {}) }} onDragOver={event => { if (admin && !busy && !lane.removed && event.dataTransfer.types.includes(dragType)) event.preventDefault(); }} onDrop={event => { if (!lane.removed) drop(event, lane.id, index); }} />)}
          {placed.map(({ item, start: itemStart, end: itemEnd, track }) => <button key={item.id} type="button" className="production-bar" data-conflict={warnings.conflicts.has(item.id)} data-late={warnings.late.has(item.id)} data-state={item.state} style={{ left: (Math.max(itemStart, start) - start) / (end - start) * 100 + '%', width: Math.max(.6, (Math.min(itemEnd, end) - Math.max(itemStart, start)) / (end - start) * 100) + '%', top: track * 62 + 5 }} draggable={admin && !busy && item.state === 'todo' && latestExecution(item)?.outcome !== 'active'} onDragStart={event => drag(event, item)} onClick={() => edit(item)} title={`${item.title}\n${dateTime(item.scheduledStart!)} → ${dateTime(new Date(itemEnd).toISOString())}\n${item.estimatedMinutes} min · ${item.client ?? ''}\n${warnings.conflicts.has(item.id) ? t('overlap') : ''} ${warnings.late.has(item.id) ? t('late') : ''}`}><strong>{item.title}</strong><small>{dateTime(item.scheduledStart!)} · {item.estimatedMinutes} min · {item.quantity} ×</small><span className="production-bar-flags">{status(item)}</span></button>)}
        </div></div>;
      })}{!lanes.length && <p className="notice">{t('noMachines')}</p>}</div></section></div>
    {detail && <ProductionDetails work={detail} machine={machines.find(item => item.id === detail.machineId)} role={role} busy={busy} error={error} clearError={clearError} execute={execute ?? (() => Promise.reject(new Error('execution-unavailable')))} close={() => setDetailId(null)} edit={() => editMetadata(detail)} />}
    {editor && admin && <WorkEditor work={editor.work} project={board.projects.find(item => item.id === editor.work?.projectId) ?? null} machines={machines} busy={busy} error={error} close={() => setEditor(null)} save={data => { void write({ ...(editor.work ? { workId: editor.work.id } : {}), data: { ...data, ...(editor.work ? { expectedRevision: editor.work.revision } : {}) } }).then(() => setEditor(null)).catch(() => {}); }} />}
  </div>;
}
