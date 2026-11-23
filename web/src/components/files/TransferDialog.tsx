import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { createApi } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { uploadProblem } from '../../files.ts';
import { authorizationLost, canCopy, canLaunch, connectionSignature, fileFamily, runFileBatch, safetySignature, transferCandidates } from '../../file-batch.ts';
import type { BatchPhase } from '../../file-batch.ts';
import './transfers.css';

export interface TransferDialogProps {
  source: MachineData; path: string; machines: MachineData[]; role: 'admin' | 'observer';
  api: ReturnType<typeof createApi>; close(): void; changed(id: string): void;
}
type Row = { id: string; name: string; phase: BatchPhase; signature?: string; path?: string; error?: string };
const errorCode = (error: unknown) => error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
export function TransferDialog(props: TransferDialogProps) {
  const { t } = useTranslation('transfers');
  const latest = useRef(props); latest.current = props;
  const origin = useRef({ id: props.source.id, path: props.path, signature: connectionSignature(props.source) });
  const dialog = useRef<HTMLDialogElement>(null), title = useId(), lock = useRef(false), mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [stage, setStage] = useState<'copy' | 'launch' | 'done'>('copy');
  const [selected, setSelected] = useState<string[]>([]), [printSelected, setPrintSelected] = useState<string[]>([]);
  const [name, setName] = useState(props.path.split('/').pop() ?? ''), [confirmation, setConfirmation] = useState('');
  const [rows, setRows] = useState<Row[]>([]), [launchRows, setLaunchRows] = useState<Row[]>([]), [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current; element?.showModal();
    return () => { mounted.current = false; controller.current?.abort(); element?.close(); };
  }, []);
  useEffect(() => { if (props.source.id !== origin.current.id || props.path !== origin.current.path || connectionSignature(props.source) !== origin.current.signature) controller.current?.abort(); }, [props.source, props.path]);
  const currentSource = props.machines.find(machine => machine.id === origin.current.id);
  const candidates = currentSource ? transferCandidates(currentSource, origin.current.path, props.machines) : [];
  const eligible = rows.filter(row => row.phase === 'success' && currentSource && transferCandidates(currentSource, origin.current.path, props.machines).some(machine => machine.id === row.id && safetySignature(machine) === row.signature) && canLaunch(props.machines.find(machine => machine.id === row.id), props.role));
  const laser = eligible.some(row => fileFamily(props.machines.find(machine => machine.id === row.id)!) === 'laser');
  const confirmationKey = JSON.stringify(eligible.map(row => [row.id, row.path, safetySignature(props.machines.find(machine => machine.id === row.id)!)]));
  const confirmed = confirmation === confirmationKey;
  const external = eligible.some(row => props.machines.find(machine => machine.id === row.id)?.capabilities?.externalFilament);
  const patch = (setter: typeof setRows, id: string, update: Partial<Row>) => setter(previous => previous.map(row => row.id === id ? { ...row, ...update } : row));
  const finish = (abort: AbortController) => {
    lock.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (abort.signal.aborted) {
      const cancelled = (previous: Row[]): Row[] => previous.map(row => row.phase === 'running' ? { ...row, phase: 'error', error: 'unknown' } : row.phase === 'queued' ? { ...row, phase: 'error', error: 'unavailable' } : row);
      setRows(cancelled); setLaunchRows(cancelled); setStage('done');
    }
  };
  const copy = async () => {
    if (lock.current || stage !== 'copy') return;
    const current = latest.current;
    if (current.role !== 'admin' || current.source.id !== origin.current.id || current.path !== origin.current.path || connectionSignature(current.source) !== origin.current.signature) return;
    const source = current.machines.find(machine => machine.id === origin.current.id);
    const targets = source ? transferCandidates(source, origin.current.path, current.machines).filter(machine => selected.includes(machine.id)) : [];
    if (!targets.length) { setError('select'); return; }
    if (targets.some(target => uploadProblem(target, { name, size: 1 })) || /\.3mf$/i.test(name) !== /\.3mf$/i.test(origin.current.path)) { setError('invalidName'); return; }
    const approved = new Map(targets.map(machine => [machine.id, safetySignature(machine)]));
    lock.current = true; setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    setRows(targets.map(machine => ({ id: machine.id, name: machine.name, phase: 'queued', signature: safetySignature(machine) })));
    try {
      const results = await runFileBatch(targets, async target => {
        const live = latest.current, source = live.machines.find(machine => machine.id === origin.current.id), destination = live.machines.find(machine => machine.id === target.id);
        if (live.source.id !== origin.current.id || live.path !== origin.current.path || !source || connectionSignature(source) !== origin.current.signature || !destination || safetySignature(destination) !== approved.get(target.id) || !canCopy(source, destination, origin.current.path, live.role)) throw { code: 'unavailable' };
        return live.api.transfer(origin.current.id, origin.current.path, target.id, name, abort.signal);
      }, { signal: abort.signal, stopOnError: authorizationLost, skipped: item => patch(setRows, item.id, { phase: 'error', error: 'not-attempted' }), started: item => patch(setRows, item.id, { phase: 'running' }), changed: result => {
        if (result.ok) { patch(setRows, result.item.id, { phase: 'success', path: result.value.path }); latest.current.changed(result.item.id); }
        else patch(setRows, result.item.id, { phase: 'error', error: errorCode(result.error) });
      } });
      if (!abort.signal.aborted) setStage(results.some(result => !result.ok && authorizationLost(result.error)) ? 'done' : 'launch');
    } finally { finish(abort); }
  };
  const launch = async (all: boolean) => {
    if (lock.current || stage !== 'launch' || !confirmed) return;
    const live = latest.current;
    const targets = rows.filter(row => row.phase === 'success' && row.path && (all || printSelected.includes(row.id)) && live.machines.some(machine => machine.id === row.id && safetySignature(machine) === row.signature) && canLaunch(live.machines.find(machine => machine.id === row.id), live.role));
    if (!targets.length) { setError('select'); return; }
    const approved = new Map(targets.map(row => [row.id, safetySignature(live.machines.find(machine => machine.id === row.id)!)]));
    lock.current = true; setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    setLaunchRows(targets.map(row => ({ ...row, phase: 'queued' })));
    try {
      await runFileBatch(targets, async row => {
        const current = latest.current, machine = current.machines.find(machine => machine.id === row.id), source = current.machines.find(machine => machine.id === origin.current.id);
        if (current.source.id !== origin.current.id || current.path !== origin.current.path || !source || connectionSignature(source) !== origin.current.signature || !machine || !canLaunch(machine, current.role) || safetySignature(machine) !== approved.get(row.id) || !transferCandidates(source, origin.current.path, [machine]).length) throw { code: 'unavailable' };
        return current.api.print(row.id, row.path!, { ...(fileFamily(machine) === 'laser' ? { operatorPresent: true } : {}), ...(machine.capabilities?.externalFilament ? { filamentMode: 'external' as const } : {}) }, abort.signal);
      }, { signal: abort.signal, stopOnError: authorizationLost, skipped: item => patch(setLaunchRows, item.id, { phase: 'error', error: 'not-attempted' }), started: item => patch(setLaunchRows, item.id, { phase: 'running' }), changed: result => {
        patch(setLaunchRows, result.item.id, result.ok ? { phase: 'success' } : { phase: 'error', error: errorCode(result.error) });
        latest.current.changed(result.item.id);
      } });
      if (!abort.signal.aborted) setStage('done');
    } finally { finish(abort); }
  };
  const close = () => { if (!lock.current) latest.current.close(); };
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  const renderRows = (items: Row[], printing: boolean) => <ul className="transfer-list" aria-live="polite">{items.map(row => <li className="transfer-line" key={row.id} data-phase={row.phase}><span>{row.name}{row.path && <small>{row.path}</small>}</span><span>{['success', 'error'].includes(row.phase) && <span aria-hidden="true">{row.phase === 'success' ? '✓' : '✕'} </span>}{row.phase === 'running' && <span className="transfer-spinner" aria-hidden="true" />}{row.phase === 'error' ? t(`errors.${row.error}`, { defaultValue: t('errors.unknown') }) : t(printing ? `launchStatus.${row.phase}` : `copyStatus.${row.phase}`)}</span></li>)}</ul>;
  return <dialog ref={dialog} className="transfer-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { if (lock.current) dialog.current?.showModal(); else latest.current.close(); }}><form className="stack" onSubmit={event => { event.preventDefault(); if (stage === 'copy') void copy(); }}>
    <h2 id={title}>{t(stage === 'copy' ? 'title' : 'finished')}</h2><p>{props.source.name} · <strong>{origin.current.path}</strong></p>
    {stage === 'copy' && <>{candidates.length ? <><fieldset className="stack" disabled={busy || props.role !== 'admin'}><legend>{t('destinations')}</legend>{candidates.map(machine => <label className="check" key={machine.id}><input type="checkbox" checked={selected.includes(machine.id)} disabled={!canCopy(currentSource, machine, origin.current.path, props.role)} onChange={() => setSelected(ids => toggle(ids, machine.id))} />{machine.name}</label>)}</fieldset><label className="stack">{t('name')}<input value={name} maxLength={200} required disabled={busy || props.role !== 'admin'} onChange={event => setName(event.target.value)} /></label><p className="notice">{t('compatibility')}</p></> : <p>{t('noDestinations')}</p>}</>}
    {rows.length > 0 && renderRows(rows, false)}
    {stage === 'launch' && <>{eligible.length ? <><p>{t('chooseLaunch')}</p><fieldset className="stack" disabled={busy || props.role !== 'admin'}><legend>{t('launchDestinations')}</legend><label className="check"><input type="checkbox" checked={eligible.length > 0 && eligible.every(row => printSelected.includes(row.id))} onChange={event => setPrintSelected(event.target.checked ? eligible.map(row => row.id) : [])} />{t('allAvailable')}</label>{eligible.map(row => <label className="check" key={row.id}><input type="checkbox" checked={printSelected.includes(row.id)} onChange={() => setPrintSelected(ids => toggle(ids, row.id))} />{row.name} · {row.path}</label>)}</fieldset><label className="check"><input type="checkbox" checked={confirmed} disabled={busy || props.role !== 'admin'} onChange={event => setConfirmation(event.target.checked ? confirmationKey : '')} />{t('confirm')}{laser && <> {t('laserConfirm')}</>}{external && <> {t('externalConfirm')}</>}</label></> : <p>{t('noLaunch')}</p>}<small>{t('availability')}</small></>}
    {launchRows.length > 0 && renderRows(launchRows, true)}
    {error && <p role="alert">{t(error)}</p>}{busy && <p role="status">{t('busy')}</p>}{stage === 'done' && <p role="status">{t('noRetry')}</p>}
    <div className="row wrap"><button type="button" disabled={busy} onClick={close}>{t(stage === 'launch' ? 'noStart' : stage === 'done' ? 'close' : 'cancel')}</button>{stage === 'copy' && candidates.length > 0 && <button type="submit" className="primary" disabled={busy || props.role !== 'admin'}>{t('copy')}</button>}{stage === 'launch' && eligible.length > 0 && <><button type="button" disabled={busy || !confirmed || !eligible.some(row => printSelected.includes(row.id))} onClick={() => { void launch(false); }}>{t('startSelection')}</button><button type="button" className="primary" disabled={busy || !confirmed} onClick={() => { void launch(true); }}>{t('startAll')}</button></>}</div>
  </form></dialog>;
}
