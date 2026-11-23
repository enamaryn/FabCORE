import { useState } from 'react';
import type { ControlProps } from './shared.tsx';
import { useControls, printing } from './shared.tsx';

export function MotionControls(props: ControlProps) {
  const { t, send, can, disabled, confirmation } = useControls(props);
  const [step, setStep] = useState(1);
  const motion = props.controls?.motion;
  const laser = props.controls?.laser;
  const axes = laser ? ['X', 'Y'] : ['X', 'Y', 'Z'];
  return <div className="controls-stack">{motion?.position && <p>{t('position')} {axes.map((axis, index) => `${axis}: ${motion.position?.[index] ?? '—'}`).join(' · ')} mm</p>}
    {props.role === 'admin' && motion && <><div className="control-jog">{axes.map(axis => <div key={axis}><span>{axis}</span>{[-1, 1].map(sign => { const command = { action: 'move', axis, distance: step * sign }; return <button type="button" key={sign} aria-label={t('moveAxis', { axis, distance: step * sign })} disabled={!can(command)} onClick={() => send(command)}>{axis} {sign < 0 ? '−' : '+'}</button>; })}</div>)}</div>
    <div className="control-actions"><label>{t('step')}<select value={step} disabled={disabled || printing(props)} onChange={event => setStep(Number(event.target.value))}>{[0.1, 1, 10].map(value => <option value={value} key={value}>{value} mm</option>)}</select></label>{motion.home !== false && <button type="button" disabled={!can({ action: 'home' })} onClick={() => send({ action: 'home' })}>{t('home')}</button>}
    {laser && <><button type="button" disabled={!can({ action: 'zero' })} onClick={() => send({ action: 'zero' })}>{t('zero')}</button><button type="button" disabled={!can({ action: 'jog-cancel' })} onClick={() => send({ action: 'jog-cancel' })}>{t('cancelJog')}</button></>}</div></>}
    {motion && <small>{laser ? t('laserMotionNote') : motion.fabcoreHoming ? t(motion.axes?.length ? 'fabcoreHomed' : 'needHome') : motion.homed === null ? t('firmwareLimits') : t('homedAxes', { axes: motion.homed || t('unknown') })} {t('motionBlocked')}</small>}{props.role === 'observer' && <p>{t('readOnly')}</p>}{confirmation}
  </div>;
}
