import { KlipperConfigPanel } from '../config/KlipperConfigPanel.tsx';
import { TrammingPanel, flatnessLevel } from '../tramming/TrammingPanel.tsx';
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.js';
import type { TemperatureSample } from '../../temperature.ts';
import { ApiError } from '../../api.ts';
import type { createApi } from '../../api.ts';
import { validateControl } from '../../../../src/domain/control.ts';
import { HeaterControls, QuickControls, MotionControls } from '../controls/index.ts';
import { CameraPanel } from './CameraPanel.tsx';
import { MaterialsPanel } from './MaterialsPanel.tsx';
import { TemperatureChart } from './TemperatureChart.tsx';
import { Unavailable } from './Unavailable.tsx';
import { MachineHeader } from './MachineHeader.tsx';
import { connectionSignature } from '../../file-batch.ts';
import { FilesPanel } from '../files/FilesPanel.tsx';
import { LogsPanel } from './LogsPanel.tsx';
import { codeLabel } from '../admin/codes.ts';
import './machine.css';

type Props = { id: string; machines: MachineData[]; api: ReturnType<typeof createApi>; actor: string; role: 'admin' | 'observer'; samples: TemperatureSample[]; stale: boolean; tab?: 'files' | 'logs' | 'config' | 'tramming' | undefined };
export function MachineDetail(props: Props) {
  const { t } = useTranslation('machine');
  const machine = props.machines.find(item => item.id === props.id);
  if (!machine) return <section className="panel stack"><h1 tabIndex={-1}>{t('missing')}</h1><a href="#machines">{t('back')}</a></section>;
  return <div className="react-detail"><MachineHeader machine={machine} role={props.role} tab={props.tab ?? 'overview'} />{props.tab === 'tramming' && props.role === 'admin' && machine.kind === 'klipper' ? <TrammingPanel key={machine.id + ':' + connectionSignature(machine)} machine={machine} api={props.api} stale={props.stale} /> : props.tab === 'config' && props.role === 'admin' && machine.kind === 'klipper' && machine.capabilities?.configuration ? <KlipperConfigPanel key={machine.id + ':' + connectionSignature(machine)} machine={machine} api={props.api} stale={props.stale} /> : props.tab === 'logs' && props.role === 'admin' ? <LogsPanel machine={machine} api={props.api} /> : props.tab === 'files' ? <FilesPanel key={machine.id + ':' + connectionSignature(machine)} machine={machine} machines={props.machines} actor={props.actor} role={props.role} stale={props.stale} api={props.api} /> : <Cockpit key={machine.id + ':' + connectionSignature(machine)} {...props} machine={machine} />}</div>;
}
function Cockpit({ machine, api, actor, role, samples, stale }: Props & { machine: MachineData }) {
  const { t, i18n } = useTranslation('machine'); const client = useQueryClient();
  const capabilities = machine.capabilities ?? {};
  const emergencySupported = capabilities.commands === true && capabilities.commandActions?.includes('emergencyStop') === true;
  const controlsQuery = useQuery({ queryKey: ['controls', actor, machine.id, machine.kind, machine.origin], queryFn: ({ signal }) => api.controls(machine.id, signal), enabled: capabilities.controls === true && !['offline', 'connecting'].includes(machine.status), retry: false, refetchInterval: 5000, staleTime: 2000 });
  const controls = capabilities.controls !== true || ['offline', 'connecting'].includes(machine.status) || controlsQuery.isError || stale ? null : controlsQuery.data ?? null;
  const [cameraSize, setCameraSize] = useState<'normal' | 'wide' | 'page'>('normal');
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const emergencyLocked = useRef(false), emergencyVersion = useRef(0);
  const [busy, setBusy] = useState(false), [result, setResult] = useState(''), [failure, setFailure] = useState(''), [confirm, setConfirm] = useState<string | null>(null);
  const controller = useRef(new AbortController()), locked = useRef(false), alive = useRef(true);
  const latest = useRef({ machine, controls, role, stale }); latest.current = { machine, controls, role, stale };
  useEffect(() => () => { alive.current = false; controller.current.abort(); }, []);
  const refresh = async () => { if (alive.current) await Promise.all([client.invalidateQueries({ queryKey: ['fleet'] }), client.invalidateQueries({ queryKey: ['controls', actor, machine.id] })]); };
  async function perform(run: () => Promise<string>): Promise<boolean> {
    if (locked.current || emergencyLocked.current || !alive.current || latest.current.role !== 'admin') return false;
    const version = emergencyVersion.current;
    locked.current = true; setBusy(true); setResult(''); setFailure('');
    try { const outcome = await run(); if (alive.current && version === emergencyVersion.current) setResult(outcome); return true; }
    catch (error) { if (alive.current && version === emergencyVersion.current) setFailure(error instanceof ApiError ? error.code : 'command-unconfirmed'); return false; }
    finally { locked.current = false; if (alive.current) { setBusy(false); await refresh(); } }
  }
  const onControl = async (command: Record<string, unknown>) => {
    await perform(async () => {
      const current = latest.current, special = current.machine.kind === 'longer-ray5' && ['reset', 'unlock', 'jog-cancel'].includes(String(command.action));
      const printing = [current.machine.status, current.controls?.status].some(s => ['printing', 'paused'].includes(s ?? ''));
      if (!current.controls || current.stale || !current.machine.capabilities?.controls || (!special && !['ready', 'done', 'printing', 'paused'].includes(current.machine.status)) || !validateControl(command, current.controls) ||
          (['move', 'home', 'zero', 'laser-pulse'].includes(String(command.action)) && !['ready', 'done'].includes(current.machine.status)) ||
          (printing && ['heat', 'fan', 'speed'].includes(String(command.action)) && command.duringPrint !== true)) throw new ApiError('control-invalid', 400);
      return (await api.control(current.machine.id, command, controller.current.signal)).outcome;
    });
  };
  const commandAllowed = (action: string, m = latest.current.machine) => Boolean(m.capabilities?.commands && m.capabilities.commandActions?.includes(action) && (action === 'pause' ? m.status === 'printing' : action === 'resume' ? m.status === 'paused' : action === 'stop' ? ['printing', 'paused'].includes(m.status) : ['ready', 'done'].includes(m.status)));
  const runCommand = async (action: string) => {
    setConfirm(null);
    await perform(async () => {
      if (latest.current.stale || !commandAllowed(action)) throw new ApiError('command-state', 409);
      const value = await api.command(latest.current.machine.id, action, ['start', 'stop'].includes(action), controller.current.signal);
      return value.status === 'error' && latest.current.machine.kind === 'longer-ray5' ? 'reset-alarm' : 'state:' + value.status;
    });
  };
  // Klipper arrêté (M112 / arrêt d'urgence ou erreur) : seul FIRMWARE_RESTART remet les microcontrôleurs en service.
  const klipperStopped = machine.kind === 'klipper' && ['moonraker-shutdown', 'klippy'].includes(machine.issue ?? '') && machine.status === 'error';
  const runFirmwareRestart = async () => {
    setConfirm(null);
    await perform(async () => 'firmware:' + (await api.klipperFirmwareRestart(latest.current.machine.id)).outcome);
  };
  const runEmergency = async () => {
    setConfirm(null);
    if (emergencyLocked.current || !alive.current || latest.current.role !== 'admin') return;
    emergencyLocked.current = true; emergencyVersion.current++; setEmergencyBusy(true); setResult(''); setFailure('');
    try {
      const current = latest.current;
      if (current.stale || !current.machine.capabilities?.commands || !current.machine.capabilities.commandActions?.includes('emergencyStop')) throw new ApiError('command-state', 409);
      const value = await api.emergencyStop(current.machine.id, controller.current.signal);
      if (alive.current) setResult('emergency:' + value.outcome + (value.nativeCode === undefined ? '' : ':' + value.nativeCode));
    } catch (error) { if (alive.current) setFailure(error instanceof ApiError ? error.code : 'command-unconfirmed'); }
    finally { emergencyLocked.current = false; if (alive.current) { setEmergencyBusy(false); await refresh(); } }
  };
  const saveSpool = (spool: Record<string, unknown> | null) => perform(async () => { await api.spool(machine.id, spool, controller.current.signal); return 'saved'; });
  const errorKey = ['config-state', 'command-busy', 'config-unavailable', 'command-rejected', 'command-unconfirmed', 'heater-unconfirmed', 'bambu-authorization', 'control-invalid', 'command-state', 'rate', 'forbidden', 'spool-invalid', 'storage-unavailable'].includes(failure) ? failure : 'command-unconfirmed';
  const date = typeof machine.checkedAt === 'string' && Number.isFinite(Date.parse(machine.checkedAt)) ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(machine.checkedAt)) : t('notReported');
  const progress = machine.progressKnown !== false && typeof machine.progress === 'number' && Number.isFinite(machine.progress) && machine.progress >= 0 && machine.progress <= 100 ? machine.progress : null;
  const props = { machine, controls, role, busy: busy || emergencyBusy || stale, onControl };
  const temperature = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'unit', unit: 'celsius', maximumFractionDigits: 1 }).format(value) : t('notReported');
  return <>
    <div aria-live="polite" className="machine-feedback">{failure && <p className="error" role="alert">{t('errors.' + errorKey)}</p>}{result && <p className="notice">{result.startsWith('firmware:') ? t('firmwareOutcomes.' + result.slice(9)) : result.startsWith('emergency:') ? <>{t('emergencyOutcomes.' + result.split(':')[1])}{result.split(':')[2] && <code> · HTTP {result.split(':')[2]}</code>}</> : result.startsWith('state:') ? t('stateRead', { state: i18n.t('status.' + result.slice(6), { ns: 'fleet' }) }) : t('outcomes.' + result)}</p>}{(busy || emergencyBusy) && <p role="status">{t('sending')}</p>}</div>
    {/* Trois rangées en paires, hauteurs alignées : fabrication | déplacements, caméra | températures, filaments | actions rapides. */}
    <div className="react-cockpit">
      <div className="cockpit-row"><section className="panel stack cockpit-job" data-machine-block="fabrication">
      <div className="cockpit-job-main"><h2>{t('fabrication')}</h2><p className="react-job-file">{machine.file || t('noFile')}</p>
        {capabilities.printJob !== false && (progress === null ? <small>{t('progressUnknown')}</small> : <div className="cockpit-progress"><progress value={progress} max={100} aria-label={t('progress')} /><strong>{new Intl.NumberFormat(i18n.resolvedLanguage).format(progress)} %</strong></div>)}</div>
      {klipperStopped && <div className="notice stack klipper-stopped" role="status"><strong>{t('klipperStoppedTitle')}</strong><span>{t('klipperStoppedText')}</span>{role === 'admin' && <div><button type="button" className="primary" disabled={busy || emergencyBusy || stale} onClick={() => setConfirm('firmwareRestart')}>{t('actions.firmwareRestart')}</button></div>}</div>}
      <div className="cockpit-job-actions">{role === 'admin' && ['pause', 'resume', 'stop', 'start'].filter(action => commandAllowed(action, machine)).map(action => <button type="button" key={action} className={action === 'stop' ? 'danger' : 'primary'} disabled={busy || emergencyBusy || stale} onClick={() => { if (['start', 'stop'].includes(action)) setConfirm(action); else void runCommand(action); }}>{t('actions.' + action)}</button>)}{role === 'admin' && capabilities.files && ['ready', 'done'].includes(machine.status) && <a className="button" href={'#machine/' + machine.id + '/files'}>{t('chooseFile')}</a>}</div>
      {role === 'admin' && <div className="stack"><button type="button" className="danger" disabled={emergencyBusy || stale || !emergencySupported} onClick={() => setConfirm('emergencyStop')}>{t('emergencyTitle')}</button><small>{t(emergencySupported ? 'emergencyLimitation' : 'emergencyUnavailable')}</small></div>}
      <div className="cockpit-job-notes">{machine.kind === 'bambu-cloud' && <p className="notice">{t('cloudReadOnly')}</p>}{machine.kind === 'xtool-m2' && <p>{t('preparedProject')}</p>}{machine.kind === 'longer-ray5' && <small>GRBL · {machine.nativeState || t('notReported')}{machine.firmware ? ' · ' + machine.firmware : ''}</small>}
        {typeof machine.nativeStatus === 'number' && <small>{t('nativeState')} <code>{machine.nativeStatus} / {machine.nativeSubStatus ?? '—'}</code>{machine.exceptionCodes?.length ? <> · {t('nativeExceptions')} <code>{machine.exceptionCodes.join(', ')}</code></> : null}</small>}
        {machine.nativeMessage && <p className="notice">{t('nativeMessage')} <code>{machine.nativeMessage}</code></p>}{machine.issue && <p className="notice">{t('machineIssue')} {codeLabel(t, machine.issue, ['issue']) === machine.issue ? <code>{machine.issue}</code> : codeLabel(t, machine.issue, ['issue'])}</p>}<small>{t('checkedAt')} : <time dateTime={machine.checkedAt ?? undefined}>{date}</time></small></div>
    </section>
      <section className="panel stack" data-machine-block="motion"><h2>{t('motion')}</h2>{machine.kind === 'klipper' && <p className="machine-flatness" data-level={machine.bedLevel ? flatnessLevel(machine.bedLevel.range) : undefined}>{machine.bedLevel ? <>{t('flatness')} : <strong>{new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(machine.bedLevel.range)} mm</strong> · {i18n.t('levels.' + flatnessLevel(machine.bedLevel.range), { ns: 'tramming' })} · <time dateTime={machine.bedLevel.at}>{new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(machine.bedLevel.at))}</time></> : <span className="muted">{t('flatnessNone')}</span>}{role === 'admin' && <a className="button" href={'#machine/' + machine.id + '/tramming'}>{t('flatnessOpen')}</a>}</p>}<div hidden={!controls?.motion && !controls?.laser}><MotionControls {...props} /></div>{!controls?.motion && !controls?.laser && <Unavailable message={t(capabilities.controls ? controlsQuery.isError ? 'controlsUnavailable' : ['offline', 'connecting'].includes(machine.status) ? 'offline' : 'motionNotReported' : 'controlsUnsupported')} />}</section></div>
      <div className="cockpit-row" data-camera={cameraSize}><CameraPanel key={machine.kind === 'bambu-cloud' ? JSON.stringify(machine.camera) : machine.id} role={role} machine={machine} api={api} size={cameraSize} onSize={setCameraSize} />
      <section className="panel stack machine-temperature" data-machine-block="temperature"><h2>{t('temperatures')}</h2>{capabilities.temperatures === false ? <Unavailable message={t('notApplicable')} /> : <>{!controls && <div className="row wrap"><span>{t('nozzle')} <strong>{temperature(machine.nozzle)}</strong></span><span>{t('bed')} <strong>{temperature(machine.bed)}</strong></span></div>}<div hidden={!controls}><HeaterControls {...props} /></div>{!controls && <Unavailable message={t(capabilities.controls ? controlsQuery.isError ? 'controlsUnavailable' : ['offline', 'connecting'].includes(machine.status) ? 'offline' : 'readingControls' : 'heatUnsupported')} />}<TemperatureChart samples={samples} /></>}</section></div>
      <div className="cockpit-row"><MaterialsPanel machine={machine} role={role} busy={busy || emergencyBusy} save={saveSpool} />
      <section className="panel stack" data-machine-block="quick"><div className="row between wrap"><h2>{t('quick')}</h2>{capabilities.controls && <button type="button" className="ghost" disabled={busy || controlsQuery.isFetching} onClick={() => { void controlsQuery.refetch(); }}>{t('refresh')}</button>}</div><div hidden={!controls}><QuickControls {...props} /></div>{!controls && <Unavailable message={t(capabilities.controls ? controlsQuery.isError ? 'controlsUnavailable' : ['offline', 'connecting'].includes(machine.status) ? 'offline' : 'readingControls' : 'controlsUnsupported')} />}</section></div>
    </div>
    {confirm && <PrintConfirmation action={confirm} machineName={machine.name + ' · ' + (machine.serial || machine.origin || machine.id)} close={() => setConfirm(null)} submit={() => { if (confirm === 'emergencyStop') void runEmergency(); else if (confirm === 'firmwareRestart') void runFirmwareRestart(); else void runCommand(confirm); }} />}
  </>;
}
function PrintConfirmation({ action, machineName, close, submit }: { action: string; machineName: string; close(): void; submit(): void }) {
  const { t } = useTranslation('machine'); const ref = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby={title} onClose={close}><div className="stack"><h2 id={title}>{t(action === 'firmwareRestart' ? 'confirmFirmwareTitle' : action === 'emergencyStop' ? 'emergencyTitle' : action === 'stop' ? 'confirmStopTitle' : 'confirmStartTitle')}</h2><p>{action === 'firmwareRestart' ? t('confirmFirmware', { name: machineName }) : action === 'emergencyStop' ? t('confirmEmergency', { name: machineName }) : t(action === 'stop' ? 'confirmStop' : 'confirmStart')}</p><div className="row wrap"><button type="button" autoFocus onClick={close}>{t('cancel')}</button><button type="button" className={['stop', 'emergencyStop'].includes(action) ? 'danger' : 'primary'} onClick={submit}>{t('actions.' + action)}</button></div></div></dialog>;
}
