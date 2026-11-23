import { useState } from 'react';
import type { ControlProps } from './shared.tsx';
import { useControls, useControlLabel } from './shared.tsx';

export function HeaterControls(props: ControlProps) {
  const { t, send, can, disabled, confirmation } = useControls(props);
  const label = useControlLabel();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const heaters = props.controls?.heaters ?? [{ id: 'nozzle', current: props.machine.nozzle, target: null, max: 0, writable: false }, { id: 'bed', current: props.machine.bed, target: null, max: 0, writable: false }];
  return <div className="controls-stack">{heaters.map(item => {
    const draft = drafts[`${props.machine.id}:${item.id}`] ?? '';
    const command = { action: 'heat', id: item.id, value: draft.trim() ? Number(draft) : NaN };
    return <div className="control-heater" key={item.id}><p><strong>{label(item.id)}</strong> <span>{item.current == null ? t('unknown') : `${item.current} °C`}</span> <small>{t('reportedTarget', { value: item.target == null ? t('unknown') : `${item.target} °C` })}</small></p>
      {props.role === 'admin' && item.writable && <form className="control-actions" onSubmit={event => { event.preventDefault(); send(command); }}><label>{t('target')}<input type="number" aria-label={t('heaterTarget', { name: label(item.id) })} min={0} max={item.max} step={1} required value={draft} placeholder={item.target == null ? '—' : String(item.target)} disabled={disabled} onChange={event => setDrafts(previous => ({ ...previous, [`${props.machine.id}:${item.id}`]: event.target.value }))} /></label><button type="submit" disabled={!can(command)}>{t('apply')}</button><button type="button" disabled={!can({ action: 'heat', id: item.id, value: 0 })} onClick={() => send({ action: 'heat', id: item.id, value: 0 })}>{t('off')}</button><small>{t('maximum', { value: item.max })}</small></form>}
    </div>;
  })}{confirmation}</div>;
}
