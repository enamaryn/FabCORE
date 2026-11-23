import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.ts';
import type { createApi } from '../../api.ts';
import { canLaunch, connectionSignature, safetySignature } from '../../file-batch.ts';
import { fileError } from '../../files.ts';
export function PrintFileDialog({ machine, path, role, stale, api, close, changed }: { machine: MachineData; path: string; role: 'admin' | 'observer'; stale: boolean; api: ReturnType<typeof createApi>; close(): void; changed(): void }) {
  const { t } = useTranslation('files'); const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const current = useRef({ machine, role, stale }); current.current = { machine, role, stale };
  const lock = useRef(false), pending = useRef(false), alive = useRef(true), controller = useRef(new AbortController());
  const origin = useRef(connectionSignature(machine));
  const signature = safetySignature(machine), confirmed = confirmation === signature;
  const allowed = !stale && connectionSignature(machine) === origin.current && canLaunch(machine, role);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { alive.current = false; controller.current.abort(); element?.close(); }; }, []);
  const submit = async () => {
    const latest = current.current;
    if (lock.current || done || confirmation !== safetySignature(latest.machine) || connectionSignature(latest.machine) !== origin.current || latest.stale || !canLaunch(latest.machine, latest.role)) return;
    lock.current = true; pending.current = true; setBusy(true); setError('');
    try {
      await api.print(latest.machine.id, path, { ...(latest.machine.kind === 'longer-ray5' ? { operatorPresent: true } : {}), ...(latest.machine.capabilities?.externalFilament ? { filamentMode: 'external' as const } : {}) }, controller.current.signal);
      if (alive.current) setDone(true);
    } catch (failure) { if (alive.current) { setError(fileError(failure)); setDone(true); } }
    finally { pending.current = false; if (alive.current) { setBusy(false); changed(); } }
  };
  return <dialog ref={dialog} aria-labelledby={title} onCancel={event => { if (pending.current) event.preventDefault(); }} onClose={() => { if (!alive.current) return; if (pending.current) dialog.current?.showModal(); else close(); }}><form className="stack" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h2 id={title}>{t('printTitle')}</h2><p>{machine.name} · <strong>{path}</strong></p>
    {machine.capabilities?.externalFilament && <p className="notice">{t('external')}</p>}
    {!done && <label className="check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => setConfirmation(event.target.checked ? signature : '')} />{t(machine.kind === 'longer-ray5' ? 'confirmLaser' : 'confirmPrint')}</label>}
    {!allowed && !done && <p className="notice">{t('notReady')}</p>}{busy && <p role="status">{t('starting')}</p>}{error && <p className="error" role="alert">{t('errors.' + error)}</p>}{done && !error && <p className="notice" role="status">{t('started')}</p>}
    <div className="row wrap"><button type="button" autoFocus disabled={busy} onClick={() => { if (!pending.current) close(); }}>{t(done ? 'close' : 'cancel')}</button>{!done && <button type="submit" className="primary" disabled={!allowed || !confirmed || busy}>{t('start')}</button>}</div>
  </form></dialog>;
}
