import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductionWork } from '../../../../src/domain/projects.ts';
import type { MachineData } from '../../types.ts';
import { instantFromLocal, localDateTime } from '../../production.ts';
import { executionMetrics, executionPhase, latestExecution, type ExecutionAction, type ReplanPreview } from '../../production-actuals.ts';
import { ProjectDialog } from '../projects/ProjectEditor.tsx';

export function ProductionDetails({ work, machine, role, busy, error, clearError, execute, close, edit }: {
  work: ProductionWork; machine: MachineData | undefined; role: 'admin' | 'observer'; busy: boolean; error: string;
  clearError(): void; execute(action: ExecutionAction): Promise<unknown>; close(): void; edit(): void;
}) {
  const { t, i18n } = useTranslation('production');
  const [now, setNow] = useState(Date.now), [action, setAction] = useState<'start' | 'finish' | null>(null);
  const [snapshot, setSnapshot] = useState<ProductionWork | null>(null), [preview, setPreview] = useState<ReplanPreview | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const execution = latestExecution(work), metrics = executionMetrics(work, now), admin = role === 'admin';
  const format = (value: string | null | undefined) => value ? new Date(value).toLocaleString(i18n.resolvedLanguage) : '—';
  const minutes = (value: number | null) => value === null ? '—' : t('minutes', { value: Math.round(value * 10) / 10 });
  const choose = (kind: 'start' | 'finish') => { clearError(); setSnapshot(structuredClone(work)); setAction(kind); setPreview(null); };
  const errorText = error ? t('errors.' + error, { defaultValue: t('executionError') }) : '';
  return <ProjectDialog title={work.title} busy={busy} close={close}>
    {action && snapshot ? <ExecutionForm key={action + ':' + snapshot.revision} kind={action} work={snapshot} machine={machine} busy={busy} error={errorText} cancel={() => { setAction(null); setSnapshot(null); clearError(); }} execute={execute} completed={() => { setAction(null); setSnapshot(null); }} /> : <div className="stack production-actual-details">
      <div className="row between wrap"><strong className="production-phase" data-phase={executionPhase(work)}>{t('phases.' + executionPhase(work))}</strong><button type="button" onClick={close}>{t('close')}</button></div>
      <p>{machine?.name ?? work.machineNameSnapshot ?? t('unassignedMachine')} · {work.fileReference || t('noFileReference')}</p>{work.client && <p>{work.client}</p>}
      <dl className="production-metrics"><dt>{t('plannedStart')}</dt><dd>{format(execution ? execution.plannedStart : work.scheduledStart)}</dd><dt>{t('plannedDuration')}</dt><dd>{minutes(execution ? execution.plannedMinutes : work.estimatedMinutes)}</dd><dt>{t('actualStart')}</dt><dd>{format(execution?.startedAt)}</dd><dt>{t('actualEnd')}</dt><dd>{format(execution?.endedAt)}</dd><dt>{t('actualDuration')}</dt><dd>{minutes(metrics.actualMinutes)}</dd><dt>{t('elapsedDeclared')}</dt><dd>{minutes(metrics.elapsedMinutes)}</dd><dt>{t('durationDelta')}</dt><dd>{metrics.deltaMinutes === null ? '—' : (metrics.deltaMinutes > 0 ? '+' : '') + minutes(metrics.deltaMinutes)}</dd></dl>
      {execution && <section className="stack"><h3>{t('latestExecution')}</h3><p>{t('executionFile')} : <code>{execution.file}</code></p><small>{t('executionMode.' + execution.mode)} · {t('linkedAt', { at: format(execution.linkedAt), actor: execution.linkedBy })}</small><p>{t('observations.' + execution.observation)}</p><small>{t('observedAt', { at: format(execution.observedAt) })}</small>{execution.outcome === 'active' && <p className="notice">{t('noAutomaticFinish')}</p>}</section>}
      {metrics.overrun ? <p className="notice">{t('overrun')}</p> : metrics.scheduleOverrun && <p className="notice">{t('slotOverrun')}</p>}{work.notes && <p className="project-prose">{work.notes}</p>}
      {errorText && <p role="alert" className="error">{errorText}</p>}
      {admin && <div className="row wrap"><button type="button" disabled={busy} onClick={edit}>{t('editMetadata')}</button>{work.state === 'todo' && execution?.outcome !== 'active' && <button type="button" className="primary" disabled={busy || !work.machineId} onClick={() => choose('start')}>{t('linkExecution')}</button>}{execution?.outcome === 'active' && <button type="button" className="primary" disabled={busy} onClick={() => choose('finish')}>{t('confirmFinish')}</button>}{execution?.endedAt && execution.plannedStart && execution.plannedMinutes && Date.parse(execution.endedAt) > Date.parse(execution.plannedStart) + execution.plannedMinutes * 60000 && <button type="button" disabled={busy} onClick={() => { clearError(); setPreview(null); void execute({ kind: 'preview', workId: work.id, data: { expectedRevision: work.revision } }).then(value => setPreview(value as ReplanPreview)).catch(() => {}); }}>{t('previewReplan')}</button>}</div>}
      {preview && <section className="stack production-replan-preview"><h3>{t('replanPreview')}</h3><p>{t('replanMachine', { machine: machine?.name ?? work.machineNameSnapshot ?? preview.machineId, end: format(preview.basedOnEnd) })}</p><small>{t('previewExpires', { at: format(preview.expiresAt) })}</small>{preview.changes.length ? <><div className="project-table-scroll"><table><thead><tr><th>{t('job')}</th><th>{t('oldStart')}</th><th>{t('newStart')}</th></tr></thead><tbody>{preview.changes.map(change => <tr key={change.id}><td>{change.title}</td><td>{format(change.oldStart)}</td><td>{format(change.newStart)}</td></tr>)}</tbody></table></div><p className="notice">{t('replanConfirmHelp')}</p><button type="button" className="primary" disabled={busy || Date.parse(preview.expiresAt) <= now} onClick={() => { void execute({ kind: 'apply', data: { token: preview.token, confirm: true } }).then(() => setPreview(null)).catch(() => {}); }}>{t('applyReplan')}</button></> : <p>{t('noReplanChanges')}</p>}<button type="button" disabled={busy} onClick={() => setPreview(null)}>{t('dismissPreview')}</button></section>}
      {!!work.executions?.length && <details><summary>{t('executionHistory')}</summary><ol>{[...work.executions].reverse().map(item => <li key={item.id}>{t('executionOutcomes.' + item.outcome)} · {format(item.startedAt)} → {format(item.endedAt)} · {item.file}</li>)}</ol></details>}
    </div>}
  </ProjectDialog>;
}
export function ExecutionForm({ kind, work, machine, busy, error, cancel, execute, completed }: { kind: 'start' | 'finish'; work: ProductionWork; machine: MachineData | undefined; busy: boolean; error: string; cancel(): void; execute(action: ExecutionAction): Promise<unknown>; completed(): void }) {
  const { t } = useTranslation('production');
  const execution = latestExecution(work);
  const observed = machine && ['printing', 'paused'].includes(machine.status) && Boolean(machine.file);
  const [mode, setMode] = useState<'observed' | 'manual'>(() => observed ? 'observed' : 'manual');
  const [file, setFile] = useState(() => kind === 'finish' ? execution?.file ?? '' : observed ? machine.file ?? '' : work.fileReference);
  const [started, setStarted] = useState(() => kind === 'finish' ? localDateTime(execution?.startedAt) : '');
  const [endInstant] = useState(() => new Date().toISOString());
  const [ended, setEnded] = useState(() => localDateTime(endInstant));
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<'done' | 'failed' | 'cancelled'>('done'), [invalidTime, setInvalidTime] = useState(false);
  return <form className="stack production-execution-form" onSubmit={event => {
    event.preventDefault(); if (busy || !confirmed) return;
    const startedAt = started ? instantFromLocal(started, kind === 'finish' ? execution?.startedAt : null) : null;
    const endedAt = kind === 'finish' ? instantFromLocal(ended, endInstant) : null;
    if (started && !startedAt || kind === 'finish' && !endedAt) { setInvalidTime(true); return; }
    const action: ExecutionAction = kind === 'start' ? { kind: 'start', workId: work.id, data: { expectedRevision: work.revision, confirm: true, mode, file, startedAt } }
      : { kind: 'finish', workId: work.id, executionId: execution!.id, data: { expectedRevision: work.revision, confirm: true, outcome, startedAt, endedAt } };
    void execute(action).then(completed).catch(() => {});
  }}>
    <h3>{t(kind === 'start' ? 'linkExecution' : 'confirmFinish')}</h3><p className="notice">{t('metadataOnly')}</p>
    <p><strong>{work.title}</strong> · {machine?.name ?? work.machineNameSnapshot ?? work.machineId}</p>
    <fieldset disabled={busy} className="stack">{kind === 'start' ? <><label className="stack">{t('linkMode')}<select value={mode} onChange={event => { setMode(event.target.value as 'observed' | 'manual'); setConfirmed(false); }}><option value="observed" disabled={!observed}>{t('executionMode.observed')}</option><option value="manual">{t('executionMode.manual')}</option></select></label><label className="stack">{t('executionFile')}<input required={mode === 'observed'} maxLength={512} value={file} onChange={event => { setFile(event.target.value); setConfirmed(false); }} /></label><small>{t(mode === 'observed' ? 'observedMatch' : 'manualDeclaration')}</small></> : <><p>{t('executionFile')} : <code>{file}</code></p><label className="stack">{t('finalOutcome')}<select value={outcome} onChange={event => { setOutcome(event.target.value as typeof outcome); setConfirmed(false); }}>{['done', 'failed', 'cancelled'].map(value => <option key={value} value={value}>{t('executionOutcomes.' + value)}</option>)}</select></label></>}
      <label className="stack">{t('declaredStart')}<input type="datetime-local" value={started} onChange={event => { setStarted(event.target.value); setConfirmed(false); setInvalidTime(false); }} /><small>{t('unknownStart')}</small></label>{kind === 'finish' && <label className="stack">{t('declaredEnd')}<input type="datetime-local" required value={ended} onChange={event => { setEnded(event.target.value); setConfirmed(false); setInvalidTime(false); }} /></label>}
      <label className="row"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t(kind === 'start' ? 'confirmLinkTarget' : 'confirmFinishTarget', { title: work.title, machine: machine?.name ?? work.machineNameSnapshot ?? work.machineId, file })}</label>
    </fieldset>{invalidTime && <p role="alert" className="error">{t('invalidLocalTime')}</p>}{error && <p role="alert" className="error">{error}</p>}<div className="row"><button type="button" disabled={busy} onClick={cancel}>{t('back')}</button><button type="submit" className="primary" disabled={busy}>{t(kind === 'start' ? 'confirmLink' : 'confirmFinish')}</button></div>
  </form>;
}
