import { useState } from 'react';
import type { ControlProps } from './shared.tsx';
import { useControls, useControlLabel } from './shared.tsx';

export function QuickControls(props: ControlProps) {
  const { t, send, can, disabled, confirmation } = useControls(props);
  const label = useControlLabel();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [power, setPower] = useState('1');
  const [duration, setDuration] = useState(100);
  const [operatorPresent, setOperatorPresent] = useState(false);
  const data = props.controls;
  const laser = data?.laser;
  const admin = props.role === 'admin';
  const modes = ['silent', 'balanced', 'sport', 'ludicrous'];
  const draftKey = (id: string) => `${props.machine.id}:${id}`;
  const pulse = { action: 'laser-pulse', value: power.trim() ? Number(power) : NaN, duration, operatorPresent };
  return <div className="controls-stack">{laser ? <>
    <div className="control-actions">{admin && ['laser-off', 'reset', 'unlock'].map(action => <button type="button" key={action} disabled={!can({ action })} onClick={() => send({ action })}>{t(action)}</button>)}</div>
    <p>{t('resetNote')}</p>
    {admin && laser.mode && (laser.max ?? 0) > 0 ? <form className="controls-stack" onSubmit={event => { event.preventDefault(); send(pulse); }}><div className="control-actions"><label>{t('laserPower')}<input type="number" min={1} max={5} step={1} value={power} required disabled={disabled} onChange={event => setPower(event.target.value)} /></label><label>{t('duration')}<select value={duration} disabled={disabled} onChange={event => setDuration(Number(event.target.value))}>{[100, 250, 500].map(value => <option value={value} key={value}>{value} ms</option>)}</select></label></div><label className="control-operator"><input type="checkbox" checked={operatorPresent} disabled={disabled} onChange={event => setOperatorPresent(event.target.checked)} />{t('operatorPresent')}</label><button type="submit" disabled={!can(pulse)}>{t('pulse')}</button><small>{t('pulseNote')}</small></form> : <small>{t(laser.mode && (laser.max ?? 0) > 0 ? 'pulseNote' : 'pulseUnavailable')}</small>}
  </> : <>
    <h3>{t('lighting')}</h3>{data?.lights.map(item => <div className="control-row" key={item.id}><span>{label(item.id)}</span>{admin && item.writable ? <button type="button" aria-label={t('toggleLight', { name: label(item.id) })} aria-pressed={item.value === true} disabled={!can({ action: 'light', id: item.id, value: item.value !== true })} onClick={() => send({ action: 'light', id: item.id, value: item.value !== true })}>{t(item.value === true ? 'on' : item.value === false ? 'off' : 'turnOn')}</button> : <span>{t(item.value === true ? 'on' : item.value === false ? 'off' : 'unknown')}</span>}</div>)}{!data?.lights.length && <p>{t('notReported')}</p>}
    <h3>{t('fans')}</h3>{data?.fans.map(item => {
      const draft = drafts[draftKey(item.id)] ?? '';
      const command = { action: 'fan', id: item.id, value: draft.trim() ? Number(draft) : NaN };
      return <div className="control-row" key={item.id}><span>{label(item.id)} · {item.percent == null ? t('unknown') : `${item.percent} %`}{item.rpm == null ? '' : ` · ${t('rpm', { value: item.rpm })}`}</span>{admin && item.writable && <form className="control-actions" onSubmit={event => { event.preventDefault(); send(command); }}><label>{t('fanTarget', { name: label(item.id) })}<input type="number" min={0} max={100} step={1} required value={draft} placeholder={item.percent == null ? '—' : String(item.percent)} disabled={disabled} onChange={event => setDrafts(previous => ({ ...previous, [draftKey(item.id)]: event.target.value }))} /></label><button type="submit" disabled={!can(command)}>{t('apply')}</button></form>}</div>;
    })}{!data?.fans.length && <p>{t('notReported')}</p>}
    {data?.speed && <div className="controls-stack"><h3>{t('speed')}</h3><span>{t(`modes.${modes[data.speed.mode] ?? 'unknown'}`)}</span>{admin && data.speed.writable && <form className="control-actions" onSubmit={event => { event.preventDefault(); send({ action: 'speed', value: Number(drafts[draftKey('speed')] ?? data.speed?.mode) }); }}><label>{t('speed')}<select value={drafts[draftKey('speed')] ?? String(data.speed.mode)} disabled={disabled} onChange={event => setDrafts(previous => ({ ...previous, [draftKey('speed')]: event.target.value }))}>{modes.map((mode, value) => <option value={value} key={mode}>{t(`modes.${mode}`)}</option>)}</select></label><button type="submit" disabled={!can({ action: 'speed', value: Number(drafts[draftKey('speed')] ?? data.speed.mode) })}>{t('apply')}</button></form>}</div>}
    {props.machine.kind === 'elegoo' && <small>{t('cc2Note')}</small>}
  </>}{!admin && <p>{t('readOnly')}</p>}{confirmation}</div>;
}
