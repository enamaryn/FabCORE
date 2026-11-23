import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateControl } from '../../../../src/domain/control.ts';
import type { ControlCommand, ControlState } from '../../../../src/domain/control.ts';
import type { MachineData } from '../../types.ts';
import './controls.css';

export interface ControlProps {
  machine: MachineData;
  controls: ControlState | null;
  role: 'admin' | 'observer';
  busy: boolean;
  onControl(command: Record<string, unknown>): Promise<void>;
}
export const online = (props: ControlProps) => props.role === 'admin' && !props.busy && !!props.controls && ['ready', 'done', 'printing', 'paused'].includes(props.machine.status) && ['ready', 'done', 'printing', 'paused'].includes(props.controls.status ?? '');
export const printing = (props: ControlProps) => [props.machine.status, props.controls?.status].some(status => status === 'printing' || status === 'paused');
export function allowed(props: ControlProps, command: ControlCommand) {
  const special = props.machine.kind === 'longer-ray5' && ['reset', 'unlock', 'jog-cancel'].includes(String(command.action));
  const statusAllowed = special ? props.role === 'admin' && !props.busy && !!props.controls && ['ready', 'done', 'printing', 'paused', 'error'].includes(props.machine.status) && ['ready', 'done', 'printing', 'paused', 'error'].includes(props.controls.status ?? '') : online(props);
  if (!statusAllowed || !props.controls || !validateControl({ ...command, confirm: true }, props.controls)) return false;
  if (['home', 'move', 'zero', 'laser-pulse'].includes(String(command.action)) && printing(props)) return false;
  const laser = props.controls.laser;
  if (laser) {
    if (['home', 'move', 'zero', 'laser-pulse'].includes(String(command.action)) && laser.nativeState !== 'Idle') return false;
    if (command.action === 'unlock' && laser.nativeState !== 'Alarm') return false;
    if (command.action === 'jog-cancel' && laser.nativeState !== 'Jog') return false;
  }
  return true;
}
export function useControls(props: ControlProps) {
  const { t } = useTranslation('controls');
  const [pending, setPending] = useState<ControlCommand | null>(null);
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const targetMachine = useRef(props.machine.id);
  const latest = useRef(props); latest.current = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (pending && !dialog.current?.open) dialog.current?.showModal();
    if (!pending && dialog.current?.open) dialog.current.close();
  }, [pending]);
  useEffect(() => { setPending(null); }, [props.machine.id]);
  useEffect(() => { if (!props.controls) setPending(null); }, [props.controls]);
  const execute = async (command: ControlCommand) => {
    const current = latest.current;
    if (lock.current || current.machine.id !== targetMachine.current || !allowed(current, command)) { setPending(null); return; }
    lock.current = true; setSending(true); setPending(null);
    try { await current.onControl({ ...command, confirm: true, duringPrint: printing(current) }); }
    catch { /* The cockpit owns command outcomes and unknown-result messages. Never retry. */ }
    finally { lock.current = false; setSending(false); }
  };
  const send = (command: ControlCommand) => {
    if (lock.current || pending || !allowed(latest.current, command)) return;
    targetMachine.current = latest.current.machine.id;
    if (['home', 'zero', 'unlock', 'reset', 'laser-pulse'].includes(String(command.action)) || (printing(latest.current) && ['heat', 'fan', 'speed'].includes(String(command.action)))) setPending(command);
    else void execute(command);
  };
  const confirmationKey = pending?.action === 'home' ? 'confirmHome' : pending?.action === 'laser-pulse' ? 'confirmPulse' : ['zero', 'unlock', 'reset'].includes(String(pending?.action)) ? 'confirmLaser' : 'confirmPrinting';
  const confirmation = props.role === 'admin' && props.controls ? <dialog ref={dialog} className="control-dialog" aria-labelledby={title} onCancel={() => setPending(null)} onClose={() => setPending(null)}>
    <h3 id={title}>{t('confirmation')}</h3><p>{t(confirmationKey)}</p>
    <div className="control-actions"><button type="button" autoFocus onClick={() => setPending(null)}>{t('cancel')}</button><button type="button" disabled={!pending || props.machine.id !== targetMachine.current || !allowed(props, pending) || sending} onClick={() => { if (pending) void execute(pending); }}>{t('confirm')}</button></div>
  </dialog> : null;
  return { t, send, confirmation, disabled: !online(props) || sending, can: (command: ControlCommand) => !sending && allowed(props, command) };
}
export function useControlLabel() {
  const { t } = useTranslation('controls');
  const known = ['nozzle', 'bed', 'chamber_light', 'main', 'fan', 'part', 'aux', 'chamber', 'aux_fan', 'box_fan', 'heater_fan', 'controller_fan'];
  return (id: string) => known.includes(id) ? t(`labels.${id}`) : id;
}
