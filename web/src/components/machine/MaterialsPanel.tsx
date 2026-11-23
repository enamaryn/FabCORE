import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.js';
import { manualSpool, supportsManualSpool } from '../../../../src/domain/spool.ts';
import { Unavailable } from './Unavailable.tsx';

export function MaterialsPanel({ machine, role, busy, save }: { machine: MachineData; role: 'admin' | 'observer'; busy: boolean; save(spool: Record<string, unknown> | null): Promise<boolean> }) {
  const { t } = useTranslation('machine'); const [editing, setEditing] = useState(false);
  const units = Array.isArray(machine.filaments) ? machine.filaments.filter(unit => unit && Array.isArray(unit.slots)) : [];
  const fdm = supportsManualSpool(machine.kind);
  const color = (value: unknown) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value : 'var(--raised)';
  return <section className="panel stack machine-filaments" data-machine-block="materials"><div className="row between wrap"><h2>{t(fdm ? 'filaments' : 'materials')}</h2>{fdm && !units.length && role === 'admin' && <button type="button" disabled={busy} onClick={() => setEditing(true)}>{t(machine.manualSpool ? 'editSpool' : 'setSpool')}</button>}</div>
    {!fdm ? <Unavailable message={t('notApplicable')} /> : units.length ? <div className="react-filament-modules">{units.map(unit => {
      const slots = unit.slots.filter(slot => slot && Number.isFinite(slot.id));
      const humidity = typeof unit.humidity === 'number' && Number.isFinite(unit.humidity) && unit.humidity >= 0 && unit.humidity <= 100 ? unit.humidity : null;
      return <div className="react-filament-module" key={unit.id}>
        <div className="row between wrap filament-module-head"><strong>{machine.capabilities?.filaments ?? t('module')} {unit.variant === 'ht' ? 'HT ' + (unit.id - 3) : unit.id + 1}</strong>
          {humidity !== null && <span className="filament-humidity" data-level={humidity >= 60 ? 'high' : humidity >= 40 ? 'medium' : 'low'} title={t('humidity')} aria-label={t('humidityValue', { value: humidity })}><svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" /></svg>{humidity} %</span>}</div>
        <div className="react-filament-slots" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(slots.length, 1), 4)}, minmax(0, 1fr))` }}>{slots.map(slot => {
          const empty = slot.occupied === false, active = slot.active === true && !empty;
          const known = !empty && typeof slot.color === 'string' && /^#[a-f0-9]{6}$/i.test(slot.color);
          return <div className="react-filament-slot" key={slot.id} data-active={active} data-empty={empty}>
            <SpoolGraphic color={empty ? null : known ? slot.color! : null} empty={empty} label={empty ? t('empty') : known ? slot.color! : t('unknownColor')} />
            <span className="filament-slot-number">{slot.id + 1}</span>
            <strong className="filament-material">{empty ? t('empty') : slot.material || t('notReported')}</strong>
            {active && <span className="filament-active">{t('active')}</span>}
          </div>;
        })}</div>
      </div>;
    })}</div> : machine.manualSpool ? <div className="react-filament-module filament-manual">
      <div className="react-filament-slot" data-active={false} data-empty={false}><SpoolGraphic color={color(machine.manualSpool.color) === 'var(--raised)' ? null : machine.manualSpool.color!} empty={false} label={machine.manualSpool.color ?? t('unknownColor')} /></div>
      <div className="stack"><strong className="filament-material">{machine.manualSpool.material}</strong>{machine.manualSpool.name && <span>{machine.manualSpool.name}</span>}<small>{t('manualSpool')}</small></div>
    </div> : <Unavailable message={t(machine.status === 'offline' ? 'offline' : 'spoolNotReported')} />}
    {editing && role === 'admin' && !units.length && <SpoolDialog machine={machine} busy={busy} save={save} close={() => setEditing(false)} />}
  </section>;
}
function SpoolDialog({ machine, busy, save, close }: { machine: MachineData; busy: boolean; save(spool: Record<string, unknown> | null): Promise<boolean>; close(): void }) {
  const { t } = useTranslation('machine'); const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const [material, setMaterial] = useState(machine.manualSpool?.material ?? ''), [name, setName] = useState(machine.manualSpool?.name ?? '');
  const [known, setKnown] = useState(Boolean(machine.manualSpool?.color)), [color, setColor] = useState(machine.manualSpool?.color ?? '#808080');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { const current = dialog.current; current?.showModal(); return () => current?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby={title} onCancel={e => { if (busy) e.preventDefault(); }} onClose={close}><form className="stack" onSubmit={e => { e.preventDefault(); const data = manualSpool({ material, name, color: known ? color : null }); if (!data) { setInvalid(true); return; } void save(data).then(ok => { if (ok) close(); }); }}>
    <h2 id={title}>{t('singleSpool')}</h2><p>{t('manualSpool')}</p><label>{t('material')}<input value={material} maxLength={40} required onChange={e => setMaterial(e.target.value)} disabled={busy} /></label><label>{t('spoolName')}<input value={name} maxLength={80} onChange={e => setName(e.target.value)} disabled={busy} /></label><label className="check"><input type="checkbox" checked={known} onChange={e => setKnown(e.target.checked)} disabled={busy} />{t('knownColor')}</label><input type="color" value={color} aria-label={t('spoolColor')} onChange={e => setColor(e.target.value)} disabled={busy || !known} />
    {invalid && <p role="alert">{t('spoolInvalid')}</p>}<div className="row wrap"><button type="button" onClick={close} disabled={busy}>{t('cancel')}</button><button type="submit" className="primary" disabled={busy}>{t('save')}</button>{machine.manualSpool && <button type="button" className="danger" disabled={busy} onClick={() => { void save(null).then(ok => { if (ok) close(); }); }}>{t('removeSpool')}</button>}</div>
  </form></dialog>;
}
/** Bobine vue de face : flasque à la couleur du filament, moyeu, ou contour pointillé si l'emplacement est vide. */
function SpoolGraphic({ color, empty, label }: { color: string | null; empty: boolean; label: string }) {
  return <svg className="spool-graphic" viewBox="0 0 64 64" role="img" aria-label={label}>
    {empty ? <circle cx="32" cy="32" r="28" fill="none" stroke="var(--line)" strokeWidth="3" strokeDasharray="6 5" /> : <>
      <circle cx="32" cy="32" r="29" fill={color ?? 'var(--raised)'} stroke="var(--line)" strokeWidth="2" />
      {!color && <text x="32" y="38" textAnchor="middle" fontSize="18" fill="var(--dim)">?</text>}
      <circle cx="32" cy="32" r="29" fill="none" stroke="#0003" strokeWidth="6" />
      <circle cx="32" cy="32" r="11" fill="var(--card)" stroke="#0004" strokeWidth="2" />
      <circle cx="32" cy="32" r="4" fill="var(--line)" />
      <path d="M14 20a22 22 0 0 1 12-9" fill="none" stroke="#fff6" strokeWidth="3" strokeLinecap="round" />
    </>}
  </svg>;
}
