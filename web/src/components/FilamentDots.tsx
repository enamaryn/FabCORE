import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilamentSlot, MachineData } from '../types.js';
const filamentKinds = new Set(['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud']);
export function filamentInk(color: string): string {
  const rgb = [1, 3, 5].map(at => {
    const value = parseInt(color.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722 > 0.179 ? '#111111' : '#FFFFFF';
}
export function FilamentDots({ machine }: { machine: MachineData }) {
  const { t } = useTranslation('fleet');
  if (!filamentKinds.has(machine.kind)) return null;
  const system = machine.kind === 'elegoo' ? 'CANVAS' : machine.kind.startsWith('bambu') ? 'AMS' : null;
  const units = Array.isArray(machine.filaments) ? machine.filaments.filter(unit => unit && Array.isArray(unit.slots)).map(unit => ({ ...unit, slots: unit.slots.filter(slot => slot && Number.isFinite(slot.id)) })) : null;
  const shown = units?.find(unit => unit.slots.some(slot => slot.active && slot.occupied !== false)) ?? units?.[0];
  const moduleLabel = shown ? (shown.variant === 'ht' ? 'AMS HT ' + (shown.id - 3) : system + ' ' + (shown.id + 1)) : '';
  const dot = (slot: Partial<FilamentSlot>, position: number | null, source: string, key: number) => {
    const shade = slot.occupied !== false && typeof slot.color === 'string' && /^#[a-f0-9]{6}$/i.test(slot.color) ? slot.color : null;
    const active = slot.active === true && slot.occupied !== false;
    const label = [source, position === null ? t('singleSpool') : t('slot', { position }), slot.occupied === false ? t('emptySlot') : [slot.material, slot.name, shade ?? t('unknownColor')].filter(Boolean).join(' · '), active ? t('active') : '', machine.status === 'offline' ? t('staleFilament') : ''].filter(Boolean).join(' · ');
    return <span key={key} className="fleet-filament-dot" role="img" aria-label={label} title={label} data-empty={slot.occupied === false} data-active={active} data-unknown={!shade && slot.occupied !== false} style={{ '--spool': shade ?? 'var(--raised)', '--ink': shade ? filamentInk(shade) : 'var(--text)' } as CSSProperties}>{position}</span>;
  };
  return <div className="fleet-filaments" aria-label={t('filaments')}><span className="fleet-filament-unit" role="group" aria-label={moduleLabel || t('singleSpool')}>{system && shown ? <>{units && units.length > 1 && <small>{t('moduleCount', { count: units.length, system })}</small>}<span className="fleet-filament-dots">{shown.slots.map(slot => dot(slot, slot.id + 1, moduleLabel, slot.id))}</span></> : dot(machine.manualSpool ? { ...machine.manualSpool, occupied: true } : { occupied: null }, null, machine.manualSpool ? t('manualSpool') : system && units == null ? t('equipmentUnknown') : '', 0)}</span></div>;
}
