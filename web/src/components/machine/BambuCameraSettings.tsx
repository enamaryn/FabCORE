import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.ts';
import type { createApi } from '../../api.ts';
import { bambuCameraConfig } from '../../../../src/domain/camera.ts';
export function BambuCameraSettings({ machine, api }: { machine: MachineData; api: ReturnType<typeof createApi> }) {
  const { t } = useTranslation('camera'); const client = useQueryClient();
  const [open, setOpen] = useState(false), [mode, setMode] = useState(machine.camera?.mode === 'disabled' ? 'disabled' : 'auto'), [host, setHost] = useState(machine.camera?.host ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(false); const lock = useRef(false), alive = useRef(true), abort = useRef(new AbortController());
  useEffect(() => () => { alive.current = false; abort.current.abort(); }, []);
  return <><button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>{t('settings')}</button>{open && <form className="stack" onSubmit={event => {
    event.preventDefault(); if (lock.current) return;
    const config = bambuCameraConfig({ mode, host }); if (!config) { setError(true); return; }
    lock.current = true; setBusy(true); setError(false);
    void api.cameraSettings(machine.id, config, abort.current.signal).then(() => { if (alive.current) { setOpen(false); void client.invalidateQueries({ queryKey: ['fleet'] }); } }).catch(() => { if (alive.current) setError(true); }).finally(() => { lock.current = false; if (alive.current) setBusy(false); });
  }}><label>{t('mode')}<select value={mode} disabled={busy} onChange={event => setMode(event.target.value as typeof mode)}>{['auto', 'disabled'].map(key => <option key={key} value={key}>{t('modes.' + key)}</option>)}</select></label><label>{t('host')}<input value={host} disabled={busy} placeholder="192.168.x.x" maxLength={15} onChange={event => setHost(event.target.value)} /></label><small>{t('scope')}</small>{error && <p role="alert" className="error">{t('invalid')}</p>}<button type="submit" disabled={busy}>{t(busy ? 'saving' : 'save')}</button></form>}</>;
}
