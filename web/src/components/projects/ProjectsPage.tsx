import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { projectStages, type Project, type ProjectBoard, type ProductionWork } from '../../../../src/domain/projects.ts';
import { ApiError, type createApi } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { subscribeFleet } from '../../events.ts';
import { ProjectEditor, WorkEditor } from './ProjectEditor.tsx';
import './projects.css';

type Action = { kind: 'create' | 'update' | 'work'; id?: string; workId?: string; data: Record<string, unknown> };
type Editor = { kind: 'project'; project: Project | null } | { kind: 'work'; project: Project; work: ProductionWork | null };
export function ProjectsPage({ api, actor, role }: { api: ReturnType<typeof createApi>; actor: string; role: 'admin' | 'observer' }) {
  const { t } = useTranslation('projects'); const client = useQueryClient();
  const key = useMemo(() => ['project-board', actor, role], [actor, role]);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => api.projects(signal), staleTime: 1000 });
  const fleet = useQuery({ queryKey: ['fleet', actor, role], queryFn: ({ signal }) => api.fleet(signal), retry: false, staleTime: 30000 });
  useEffect(() => subscribeFleet({ events: ['projects.changed'], invalidate: () => { void client.invalidateQueries({ queryKey: key }); } }), [client, key]);
  const mutation = useMutation({ retry: false, mutationFn: async (action: Action): Promise<Project | ProductionWork> => action.kind === 'create' ? api.createProject(action.data) : action.kind === 'update' ? api.updateProject(action.id!, action.data) : api.saveProjectWork(action.id!, action.workId, action.data),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); },
    onError: failure => { if (failure instanceof ApiError && failure.status === 409) void client.invalidateQueries({ queryKey: key }); } });
  if (!query.data) return <section className="panel stack"><h1 tabIndex={-1}>{t('heading')}</h1><p role="status">{t(query.isError ? 'loadFailed' : 'loading')}</p>{query.isError && <button type="button" onClick={() => { void query.refetch(); }}>{t('refresh')}</button>}</section>;
  return <>{query.isError && <p className="notice" role="alert">{t('refreshFailed')}</p>}{fleet.isError && <p className="notice">{t('fleetUnavailable')}</p>}
    <ProjectBoardView board={query.data} machines={fleet.data ?? []} role={role} busy={mutation.isPending} error={mutation.error instanceof ApiError ? mutation.error.code : mutation.isError ? 'internal' : ''}
      clearError={() => mutation.reset()} write={action => mutation.mutateAsync(action)} refresh={() => { void query.refetch(); }} />
  </>;
}

export function ProjectBoardView({ board, machines, role, busy, error, clearError, write, refresh }: { board: ProjectBoard; machines: MachineData[]; role: 'admin' | 'observer'; busy: boolean; error: string; clearError(): void; write(action: Action): Promise<unknown>; refresh(): void }) {
  const { t, i18n } = useTranslation('projects'); const admin = role === 'admin';
  const [tab, setTab] = useState<'board' | 'work'>('board'), [search, setSearch] = useState(''), [origin, setOrigin] = useState('all'), [format, setFormat] = useState('all'), [priority, setPriority] = useState('all'), [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [editor, setEditor] = useState<Editor | null>(null), [machineFilter, setMachineFilter] = useState('all'), [workState, setWorkState] = useState('todo');
  const project = board.projects.find(item => item.id === selected);
  const date = (value: string | null) => value ? new Date(value + 'T12:00:00').toLocaleDateString(i18n.resolvedLanguage) : t('notSet');
  const filtered = board.projects.filter(item => (archived || !item.archived) && (origin === 'all' || item.origin === origin) && (format === 'all' || item.format === format) && (priority === 'all' || item.priority === priority) &&
    [item.title, item.client, item.owner, item.description, ...item.tags].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const rank = { high: 0, normal: 1, low: 2 };
  filtered.sort((a, b) => rank[a.priority] - rank[b.priority] || b.updatedAt.localeCompare(a.updatedAt));
  const edit = (value: Editor) => { clearError(); setEditor(structuredClone(value)); };
  const change = (value: Project, fields: Record<string, unknown>) => { if (admin && !busy) { clearError(); void write({ kind: 'update', id: value.id, data: { ...fields, expectedRevision: value.revision } }).catch(() => {}); } };
  const work = board.work.filter(item => (workState === 'all' || item.state === workState) && (machineFilter === 'all' || (machineFilter === 'none' ? !item.machineId : item.machineId === machineFilter)) &&
    [item.title, board.projects.find(value => value.id === item.projectId)?.title ?? '', item.material, item.fileReference].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const machineName = (item: ProductionWork) => item.machineId ? machines.find(value => value.id === item.machineId)?.name ?? item.machineNameSnapshot ?? t('removedMachine') : t('unassigned');
  const workList = (items: ProductionWork[]) => <div className="project-table-scroll"><table className="project-work-table"><thead><tr>{['project', 'title', 'workKind', 'quantity', 'machine', 'estimatedMinutes', 'dueDate', 'workState'].map(key => <th key={key}>{t(key)}</th>)}{admin && <th>{t('actions')}</th>}</tr></thead><tbody>{items.map(item => {
    const parent = board.projects.find(value => value.id === item.projectId);
    return <tr key={item.id}><td><button type="button" className="ghost" onClick={() => { setSelected(item.projectId); setTab('board'); }}>{parent?.title ?? t('missingProject')}</button></td><td>{item.title}<small>{t('formats.' + item.format)}{item.material ? ' · ' + item.material : ''}</small>{item.fileReference && <small className="project-file-reference">{item.fileReference}</small>}</td><td>{t('workKinds.' + item.kind)}</td><td>{item.quantity}</td><td>{machineName(item)}</td><td>{item.estimatedMinutes ?? t('notSet')}</td><td>{date(item.dueDate)}</td><td>{t('workStates.' + item.state)}</td>{admin && <td><button type="button" disabled={busy || !parent} onClick={() => { if (parent) edit({ kind: 'work', project: parent, work: item }); }}>{t('edit')}</button></td>}</tr>;
  })}</tbody></table>{!items.length && <p>{t('emptyWork')}</p>}</div>;
  return <div className="projects-page stack"><header className="row between wrap"><div><h1 tabIndex={-1}>{t('heading')}</h1><p className="muted">{t('subtitle')}</p></div><div className="row">{admin && <button type="button" className="primary" disabled={busy} onClick={() => edit({ kind: 'project', project: null })}>{t('newProject')}</button>}<button type="button" onClick={refresh}>{t('refresh')}</button></div></header>
    <div className="row project-tabs" role="group" aria-label={t('views')}><button type="button" aria-pressed={tab === 'board'} onClick={() => setTab('board')}>{t('kanban')}</button><button type="button" aria-pressed={tab === 'work'} onClick={() => setTab('work')}>{t('workQueue')} · {board.work.filter(item => item.state === 'todo').length}</button></div>
    <div className="project-filters"><label>{t('search')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>{tab === 'board' ? <>
      <label>{t('origin')}<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="all">{t('all')}</option>{['personal', 'client'].map(value => <option key={value} value={value}>{t('origins.' + value)}</option>)}</select></label>
      <label>{t('format')}<select value={format} onChange={event => setFormat(event.target.value)}><option value="all">{t('all')}</option>{['2d', '3d', 'mixed'].map(value => <option key={value} value={value}>{t('formats.' + value)}</option>)}</select></label>
      <label>{t('priority')}<select value={priority} onChange={event => setPriority(event.target.value)}><option value="all">{t('all')}</option>{['low', 'normal', 'high'].map(value => <option key={value} value={value}>{t('priorities.' + value)}</option>)}</select></label>
      <label className="row project-checkbox"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />{t('showArchived')}</label>
    </> : <><label>{t('machine')}<select value={machineFilter} onChange={event => setMachineFilter(event.target.value)}><option value="all">{t('all')}</option><option value="none">{t('unassigned')}</option>{machines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('workState')}<select value={workState} onChange={event => setWorkState(event.target.value)}><option value="all">{t('all')}</option>{['todo', 'done', 'cancelled'].map(value => <option key={value} value={value}>{t('workStates.' + value)}</option>)}</select></label></>}
    </div>
    {error && !editor && <p className="error" role="alert">{t('errors.' + error)}</p>}{!admin && <p className="notice">{t('readOnly')}</p>}
    {tab === 'board' ? <><div className="project-board" aria-label={t('kanban')}>{projectStages.map(stage => {
      const items = filtered.filter(item => item.stage === stage);
      return <section key={stage} className="project-column" aria-labelledby={'stage-' + stage} onDragOver={event => { if (admin && !busy && event.dataTransfer.types.includes('application/x-fabcore-project')) event.preventDefault(); }} onDrop={event => {
        if (!admin || busy) return; event.preventDefault();
        try { const payload = JSON.parse(event.dataTransfer.getData('application/x-fabcore-project')) as { id: string; revision: number }; const value = board.projects.find(item => item.id === payload.id);
          if (value && !value.archived && value.stage !== stage) { clearError(); void write({ kind: 'update', id: value.id, data: { stage, expectedRevision: payload.revision } }).catch(() => {}); }
        } catch { /* External drag data never becomes a project. */ }
      }}><header className="row between"><h2 id={'stage-' + stage}>{t('stages.' + stage)}</h2><span className="project-count">{items.length}</span></header><div className="project-column-cards">{items.map(item => <article key={item.id} className="project-card" data-selected={selected === item.id} tabIndex={0} aria-label={item.title} onClick={event => { if (!(event.target as HTMLElement).closest('button, a, input, select, label')) setSelected(item.id); }} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setSelected(item.id); } }} data-priority={item.priority} data-blocked={Boolean(item.blockedReason)} draggable={admin && !busy && !item.archived} onDragStart={event => event.dataTransfer.setData('application/x-fabcore-project', JSON.stringify({ id: item.id, revision: item.revision }))}>
        <div className="row between wrap"><span className="project-format">{t('formats.' + item.format)}</span><div className="row project-card-tools"><small>{t('priorities.' + item.priority)}</small>{admin && <button type="button" className="project-card-edit" disabled={busy} aria-label={t('editProjectNamed', { title: item.title })} title={t('editProject')} onClick={event => { event.stopPropagation(); setSelected(item.id); edit({ kind: 'project', project: item }); }}><span aria-hidden="true">⚙</span></button>}</div></div><button type="button" className="project-card-title" onClick={() => setSelected(item.id)}>{item.title}</button>
        <small>{item.origin === 'client' ? item.client || t('origins.client') : t('origins.personal')}{item.owner ? ' · ' + item.owner : ''}</small>
        {item.description && <p>{item.description.slice(0, 150)}{item.description.length > 150 ? '…' : ''}</p>}
        {item.blockedReason && <p className="project-blocked">{t('blocked')} · {item.blockedReason}</p>}{item.archived && <span className="badge">{t('archived')}</span>}
        <div className="row wrap project-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <div className="row between wrap"><small>{item.dueDate ? t('dueOn', { date: date(item.dueDate) }) : t('noDueDate')}</small><small>{item.checklist.filter(check => check.done).length}/{item.checklist.length} · {board.work.filter(value => value.projectId === item.id && value.state === 'todo').length} {t('workShort')}</small></div>
        {admin && <label className="project-move">{t('move')}<select aria-label={t('moveProject', { title: item.title })} value={item.stage} disabled={busy || item.archived} onChange={event => change(item, { stage: event.target.value })}>{projectStages.map(value => <option key={value} value={value}>{t('stages.' + value)}</option>)}</select></label>}
      </article>)}{!items.length && <p className="muted project-empty">{t('emptyColumn')}</p>}</div></section>;
    })}</div>{!board.projects.length && <section className="panel"><p>{t('firstIdea')}</p></section>}
    {project && <section className="panel stack project-detail" aria-label={t('project')}><header className="row between wrap"><div><small>{t('stages.' + project.stage)} · {t('formats.' + project.format)}</small><h2>{project.title}</h2></div><div className="row wrap">{admin && <><button type="button" disabled={busy} onClick={() => edit({ kind: 'project', project })}>{t('edit')}</button><button type="button" disabled={busy} onClick={() => change(project, { archived: !project.archived })}>{t(project.archived ? 'restore' : 'archive')}</button></>}<button type="button" onClick={() => setSelected(null)}>{t('close')}</button></div></header>
      {project.blockedReason && <p className="notice">{t('blocked')} : {project.blockedReason}</p>}<p className="project-prose">{project.description || t('noBrief')}</p>{project.notes && <><h3>{t('notes')}</h3><p className="project-prose">{project.notes}</p></>}
      {!!project.links.length && <section><h3>{t('links')}</h3><ul>{project.links.map((link, index) => <li key={index}>{t('linkKinds.' + link.kind)} · <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul></section>}
      {!!project.checklist.length && <section className="stack"><h3>{t('checklist')}</h3>{project.checklist.map((item, index) => <label key={index} className="row project-checkbox"><input type="checkbox" checked={item.done} disabled={!admin || busy || project.archived} onChange={event => change(project, { checklist: project.checklist.map((value, at) => at === index ? { ...value, done: event.target.checked } : value) })} />{item.text}</label>)}</section>}
      <section className="stack"><div className="row between wrap"><h3>{t('workQueue')}</h3>{admin && !project.archived && <button type="button" disabled={busy} onClick={() => edit({ kind: 'work', project, work: null })}>{t('newWork')}</button>}</div><small>{t('workHelp')}</small>{workList(board.work.filter(item => item.projectId === project.id))}</section>
      <details><summary>{t('history')}</summary><ol className="project-history">{[...project.history].reverse().map((item, index) => <li key={index}><time dateTime={item.at}>{new Date(item.at).toLocaleString(i18n.resolvedLanguage)}</time> · {item.actor} · {t('historyActions.' + item.action)}{item.from && item.to ? ' · ' + t('stages.' + item.from) + ' → ' + t('stages.' + item.to) : ''}</li>)}</ol></details>
    </section>}</> : <section className="panel stack"><h2>{t('workQueue')}</h2><p className="notice">{t('ganttNext')}</p>{workList(work)}</section>}
    {editor?.kind === 'project' && <ProjectEditor project={editor.project} busy={busy} error={error} close={() => setEditor(null)} save={data => { void write({ kind: editor.project ? 'update' : 'create', ...(editor.project ? { id: editor.project.id } : {}), data: { ...data, ...(editor.project ? { expectedRevision: editor.project.revision } : {}) } }).then(() => setEditor(null)).catch(() => {}); }} />}
    {editor?.kind === 'work' && <WorkEditor project={editor.project} work={editor.work} machines={machines} busy={busy} error={error} close={() => setEditor(null)} save={data => { void write({ kind: 'work', id: editor.project.id, ...(editor.work ? { workId: editor.work.id } : {}), data: { ...data, ...(editor.work ? { expectedRevision: editor.work.revision } : {}) } }).then(() => setEditor(null)).catch(() => {}); }} />}
  </div>;
}
