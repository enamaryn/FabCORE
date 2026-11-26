import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { projectStages, type Project, type ProjectFields, type ProductionWork, type WorkFields } from '../../../../src/domain/projects.ts';
import { localDateTime, instantFromLocal } from '../../production.ts';
import type { MachineData } from '../../types.ts';

export function ProjectDialog({ title, busy, close, children }: { title: string; busy: boolean; close(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="project-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }}><h2>{title}</h2>{children}</dialog>;
}
export function ProjectEditor({ project, busy, error, close, save }: { project: Project | null; busy: boolean; error: string; close(): void; save(data: ProjectFields): void }) {
  const { t } = useTranslation('projects');
  const [draft, setDraft] = useState<ProjectFields>(() => project ? structuredClone(project) : { title: '', description: '', notes: '', stage: 'idea', format: '3d', origin: 'personal', client: '', owner: '', priority: 'normal', dueDate: null, tags: [], blockedReason: '', archived: false, links: [], checklist: [] });
  const [tags, setTags] = useState(draft.tags.join(', '));
  const field = <Key extends keyof ProjectFields>(key: Key, value: ProjectFields[Key]) => setDraft(previous => ({ ...previous, [key]: value }));
  const heading = t(project ? 'editProject' : 'newProject');
  return <ProjectDialog title={heading} busy={busy} close={close}><form className="stack project-form" onSubmit={event => { event.preventDefault(); if (!busy) save({ ...draft, tags: [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))] }); }}>
    <fieldset disabled={busy}><div className="project-fields">
      <label className="project-full">{t('title')}<input autoFocus required maxLength={120} value={draft.title} onChange={event => field('title', event.target.value)} /></label>
      <label>{t('origin')}<select value={draft.origin} onChange={event => field('origin', event.target.value as ProjectFields['origin'])}>{['personal', 'client'].map(value => <option key={value} value={value}>{t('origins.' + value)}</option>)}</select></label>
      <label>{t('format')}<select value={draft.format} onChange={event => field('format', event.target.value as ProjectFields['format'])}>{['2d', '3d', 'mixed'].map(value => <option key={value} value={value}>{t('formats.' + value)}</option>)}</select></label>
      <label>{t('stage')}<select value={draft.stage} onChange={event => field('stage', event.target.value as ProjectFields['stage'])}>{projectStages.map(value => <option key={value} value={value}>{t('stages.' + value)}</option>)}</select></label>
      <label>{t('priority')}<select value={draft.priority} onChange={event => field('priority', event.target.value as ProjectFields['priority'])}>{['low', 'normal', 'high'].map(value => <option key={value} value={value}>{t('priorities.' + value)}</option>)}</select></label>
      <label>{t('client')}<input maxLength={120} value={draft.client} onChange={event => field('client', event.target.value)} /></label>
      <label>{t('owner')}<input maxLength={80} value={draft.owner} onChange={event => field('owner', event.target.value)} /></label>
      <label>{t('dueDate')}<input type="date" value={draft.dueDate ?? ''} onChange={event => field('dueDate', event.target.value || null)} /></label>
      <label>{t('tags')}<input maxLength={310} value={tags} placeholder={t('tagsHelp')} onChange={event => setTags(event.target.value)} /></label>
      <label className="project-full">{t('brief')}<textarea rows={3} maxLength={4000} value={draft.description} onChange={event => field('description', event.target.value)} /></label>
      <label className="project-full">{t('notes')}<textarea rows={4} maxLength={8000} value={draft.notes} onChange={event => field('notes', event.target.value)} /></label>
      <label className="project-full">{t('blockedReason')}<input maxLength={500} value={draft.blockedReason} placeholder={t('blockedHelp')} onChange={event => field('blockedReason', event.target.value)} /></label>
    </div>
    <section className="stack"><h3>{t('links')}</h3><small>{t('linksHelp')}</small>{draft.links.map((link, index) => <div key={index} className="project-link-fields">
      <input required aria-label={t('linkLabel')} placeholder={t('linkLabel')} maxLength={100} value={link.label} onChange={event => field('links', draft.links.map((item, at) => at === index ? { ...item, label: event.target.value } : item))} />
      <select aria-label={t('linkKind')} value={link.kind} onChange={event => field('links', draft.links.map((item, at) => at === index ? { ...item, kind: event.target.value as typeof link.kind } : item))}>{['reference', 'design', 'final'].map(kind => <option key={kind} value={kind}>{t('linkKinds.' + kind)}</option>)}</select>
      <input type="url" required aria-label={t('linkUrl')} placeholder="https://" maxLength={2048} value={link.url} onChange={event => field('links', draft.links.map((item, at) => at === index ? { ...item, url: event.target.value } : item))} />
      <button type="button" aria-label={t('removeLink', { name: link.label })} onClick={() => field('links', draft.links.filter((_, at) => at !== index))}>×</button>
    </div>)}<button type="button" disabled={draft.links.length >= 12} onClick={() => field('links', [...draft.links, { label: '', url: '', kind: 'reference' }])}>{t('addLink')}</button></section>
    <section className="stack"><h3>{t('checklist')}</h3>{draft.checklist.map((item, index) => <div className="row project-check-edit" key={index}>
      <input type="checkbox" aria-label={t('checkDone', { text: item.text })} checked={item.done} onChange={event => field('checklist', draft.checklist.map((value, at) => at === index ? { ...value, done: event.target.checked } : value))} />
      <input required aria-label={t('checkText')} maxLength={200} value={item.text} onChange={event => field('checklist', draft.checklist.map((value, at) => at === index ? { ...value, text: event.target.value } : value))} />
      <button type="button" aria-label={t('removeCheck')} onClick={() => field('checklist', draft.checklist.filter((_, at) => at !== index))}>×</button>
    </div>)}<button type="button" disabled={draft.checklist.length >= 40} onClick={() => field('checklist', [...draft.checklist, { text: '', done: false }])}>{t('addCheck')}</button></section>
    </fieldset>{error && <p role="alert" className="error">{t('errors.' + error)}</p>}
    <div className="row"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></div>
  </form></ProjectDialog>;
}

export function WorkEditor({ work, project, machines, busy, error, close, save }: { work: ProductionWork | null; project: Project | null; machines: MachineData[]; busy: boolean; error: string; close(): void; save(data: WorkFields): void }) {
  const { t } = useTranslation('projects');
  const [draft, setDraft] = useState<WorkFields>(() => work ? structuredClone(work) : { title: project?.title ?? '', format: project?.format ?? '3d', kind: 'production', material: '', fileReference: '', quantity: 1, machineId: null, estimatedMinutes: null, dueDate: project?.dueDate ?? null, notes: '', state: 'todo', client: project?.client ?? '', scheduledStart: null });
  const [start, setStart] = useState(() => localDateTime(work?.scheduledStart));
  const [invalidTime, setInvalidTime] = useState(false);
  const field = <Key extends keyof WorkFields>(key: Key, value: WorkFields[Key]) => setDraft(previous => ({ ...previous, [key]: value }));
  return <ProjectDialog title={t(work ? 'editWork' : 'newWork')} busy={busy} close={close}><p>{t(project ? 'project' : 'standaloneWork')} {project && <>: <strong>{project.title}</strong></>}</p><p className="notice">{t('workHelp')}</p>
    <form className="stack project-form" onSubmit={event => { event.preventDefault(); if (!busy) { const scheduledStart = start ? instantFromLocal(start, work?.scheduledStart) : null; if (start && !scheduledStart) { setInvalidTime(true); return; } save({ ...draft, scheduledStart }); } }}><fieldset disabled={busy}><div className="project-fields">
      <label className="project-full">{t('title')}<input autoFocus required maxLength={120} value={draft.title} onChange={event => field('title', event.target.value)} /></label>
      <label>{t('workKind')}<select value={draft.kind} onChange={event => field('kind', event.target.value as WorkFields['kind'])}>{['prototype', 'production'].map(value => <option key={value} value={value}>{t('workKinds.' + value)}</option>)}</select></label>
      <label>{t('format')}<select value={draft.format} onChange={event => field('format', event.target.value as WorkFields['format'])}>{['2d', '3d', 'mixed'].map(value => <option key={value} value={value}>{t('formats.' + value)}</option>)}</select></label>
      <label>{t('quantity')}<input type="number" min={1} max={1000000} required step={1} value={draft.quantity} onChange={event => field('quantity', Number(event.target.value))} /></label>
      <label>{t('machine')}<select required={Boolean(start)} value={draft.machineId ?? ''} onChange={event => field('machineId', event.target.value || null)}><option value="">{t('unassigned')}</option>{work?.machineId && !machines.some(item => item.id === work.machineId) && <option value={work.machineId}>{work.machineNameSnapshot ?? t('removedMachine')}</option>}{machines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>{t('material')}<input maxLength={120} value={draft.material} onChange={event => field('material', event.target.value)} /></label>
      <label>{t('estimatedMinutes')}<input required={Boolean(start)} type="number" min={1} max={525600} step={1} value={draft.estimatedMinutes ?? ''} onChange={event => field('estimatedMinutes', event.target.value ? Number(event.target.value) : null)} /></label>
      <label>{t('dueDate')}<input type="date" value={draft.dueDate ?? ''} onChange={event => field('dueDate', event.target.value || null)} /></label>
      <label>{t('workState')}<select value={draft.state} onChange={event => field('state', event.target.value as WorkFields['state'])}>{['todo', 'done', 'cancelled'].map(value => <option key={value} value={value}>{t('workStates.' + value)}</option>)}</select></label>
      <label>{t('client')}<input maxLength={120} value={draft.client ?? ''} onChange={event => field('client', event.target.value)} /></label>
      <label>{t('scheduledStart')}<input type="datetime-local" value={start} onChange={event => { setStart(event.target.value); setInvalidTime(false); }} /><small>{t('localTime')}</small></label>
      <div className="project-full"><button type="button" disabled={!start} onClick={() => { setStart(''); setInvalidTime(false); }}>{t('unschedule')}</button></div>
      <label className="project-full">{t('fileReference')}<input maxLength={2048} placeholder={t('fileHelp')} value={draft.fileReference} onChange={event => field('fileReference', event.target.value)} /></label>
      <label className="project-full">{t('notes')}<textarea rows={3} maxLength={4000} value={draft.notes} onChange={event => field('notes', event.target.value)} /></label>
    </div></fieldset>{invalidTime && <p role="alert" className="error">{t('invalidTime')}</p>}{error && <p role="alert" className="error">{t('errors.' + error)}</p>}<div className="row"><button type="button" disabled={busy} onClick={close}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></div></form>
  </ProjectDialog>;
}
