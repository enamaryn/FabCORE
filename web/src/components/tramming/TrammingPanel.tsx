// Nivellement 4 points (façon assistant MRiscoC) : palpe les quatre coins atteignables, indique pour chaque coin
// de combien monter ou abaisser le plateau (mm et fraction de tour de molette), puis repart au premier point
// après un délai tant que l'utilisateur n'a pas validé ou que le plateau n'est pas dans la tolérance.
// Chaque point est une demande séparée, jamais renvoyée automatiquement après une erreur.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type createApi, type TrammingCorner, type TrammingMeasure, type TrammingResult } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import './tramming.css';

export const corners: TrammingCorner[] = ['front-left', 'front-right', 'back-right', 'back-left'];
/** Pas de vis : M4 (molettes Ender 3 d'origine) 0,7 mm par tour, M3 0,5 mm. */
export const threads = { M4: 0.7, M3: 0.5 } as const;
export const tolerance = 0.05;
export type Flatness = 'excellent' | 'good' | 'improve' | 'out';
export const flatnessLevel = (range: number): Flatness => range <= tolerance ? 'excellent' : range <= 0.1 ? 'good' : range <= 0.2 ? 'improve' : 'out';
/** Fraction de tour arrondie au huitième, lisible sur une molette. */
export function turns(delta: number, pitch: number): string {
  const eighths = Math.round(Math.abs(delta) / pitch * 8);
  if (eighths === 0) return '0';
  const whole = Math.floor(eighths / 8), rest = eighths % 8;
  const divisor = rest === 0 ? 1 : rest % 4 === 0 ? 2 : rest % 2 === 0 ? 4 : 8, numerator = rest / (8 / divisor);
  return [whole ? String(whole) : '', rest ? `${numerator}/${divisor}` : ''].filter(Boolean).join(' ');
}
const delay = 10;

export function TrammingPanel({ machine, api, stale }: { machine: MachineData; api: ReturnType<typeof createApi>; stale: boolean }) {
  const { t, i18n } = useTranslation('tramming'); const client = useQueryClient();
  const geometry = useQuery({ queryKey: ['tramming', machine.id], queryFn: ({ signal }) => api.tramming(machine.id, signal), retry: false, staleTime: 30000 });
  const [thread, setThread] = useState<keyof typeof threads>(() => { try { return localStorage.getItem('fabcore-tramming-thread') === 'M3' ? 'M3' : 'M4'; } catch { return 'M4'; } });
  const [measures, setMeasures] = useState<TrammingMeasure[]>([]), [result, setResult] = useState<TrammingResult | null>(null);
  const [current, setCurrent] = useState<number | null>(null), [failure, setFailure] = useState<{ code: string; detail?: string } | null>(null);
  const [loop, setLoop] = useState(true), [countdown, setCountdown] = useState<number | null>(null), [confirming, setConfirming] = useState(false), [passes, setPasses] = useState(0);
  const running = useRef(false), stop = useRef(false), alive = useRef(true), controller = useRef(new AbortController());
  useEffect(() => () => { alive.current = false; controller.current.abort(); }, []);
  const allowed = !stale && ['ready', 'done'].includes(machine.status) && geometry.data?.available === true;
  const shown = result ?? geometry.data?.last ?? null;
  const format = (value: number, digits = 2) => new Intl.NumberFormat(i18n.resolvedLanguage, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

  async function pass() {
    if (running.current || !alive.current) return;
    running.current = true; stop.current = false; setFailure(null); setResult(null); setMeasures([]); setCountdown(null);
    let finished: TrammingResult | null = null;
    try {
      for (let point = 0; point < 4; point++) {
        if (stop.current || !alive.current) break;
        setCurrent(point);
        const reply = await api.trammingPoint(machine.id, point, controller.current.signal);
        if (!alive.current) return;
        setMeasures(previous => [...previous, reply.measure]);
        if (reply.result) finished = reply.result;
      }
    } catch (error) {
      if (alive.current) setFailure(error instanceof ApiError ? { code: error.code, ...(error.detail ? { detail: error.detail } : {}) } : { code: 'tramming-unavailable' });
    } finally {
      running.current = false;
      if (alive.current) {
        setCurrent(null);
        if (finished) { setResult(finished); setPasses(value => value + 1); void client.invalidateQueries({ queryKey: ['fleet'] }); void client.invalidateQueries({ queryKey: ['tramming', machine.id] }); }
        // Repart au premier point après un délai, tant que non validé et hors tolérance.
        if (finished && loop && !stop.current && flatnessLevel(finished.range) !== 'excellent') setCountdown(delay);
      }
    }
  }
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); void pass(); return; }
    const timer = setTimeout(() => setCountdown(value => value === null ? null : value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  const validate = () => { stop.current = true; setCountdown(null); };
  const chooseThread = (value: keyof typeof threads) => { setThread(value); try { localStorage.setItem('fabcore-tramming-thread', value); } catch { /* préférence locale facultative */ } };

  if (geometry.isLoading) return <section className="panel"><p role="status">{t('loading')}</p></section>;
  if (geometry.isError || !geometry.data) return <section className="panel stack"><h2>{t('title')}</h2><p className="error" role="alert">{t('errors.tramming-unavailable')}</p><div><button type="button" onClick={() => { void geometry.refetch(); }}>{t('retry')}</button></div></section>;
  if (!geometry.data.available) return <section className="panel stack"><h2>{t('title')}</h2><p className="notice">{t(geometry.data.reason === 'no-probe' ? 'noProbe' : 'noGeometry')}</p></section>;

  const byCorner = new Map((result?.points ?? measures).map(item => [item.corner, item]));
  const deviation = (corner: TrammingCorner) => shown?.deviations.find(item => item.corner === corner)?.delta;
  const busy = current !== null;
  return <section className="panel stack tramming">
    <header className="row between wrap"><div><h2>{t('title')}</h2><p className="muted">{t('intro')}</p></div>
      <label className="row">{t('thread')}<select value={thread} disabled={busy} onChange={event => chooseThread(event.target.value as keyof typeof threads)}><option value="M4">M4 · 0,7 mm/{t('turn')}</option><option value="M3">M3 · 0,5 mm/{t('turn')}</option></select></label></header>

    <div className="tramming-layout">
      <div className="tramming-bed" role="img" aria-label={t('bedLabel')}>
        <span className="tramming-back">{t('back')}</span><span className="tramming-front">{t('front')}</span>
        {corners.map((corner, index) => {
          const measured = byCorner.get(corner), delta = measures.length === 4 || result || (!busy && shown) ? deviation(corner) : undefined;
          const state = current === index ? 'active' : delta === undefined ? (measured ? 'done' : 'idle') : index === 0 ? 'reference' : Math.abs(delta) <= tolerance ? 'ok' : 'adjust';
          return <div key={corner} className={'tramming-corner tramming-' + corner} data-state={state}>
            <strong>{t('corners.' + corner)}</strong>
            {current === index ? <span>{t('probing')}</span> : delta === undefined ? <span>{measured ? format(measured.z, 3) + ' mm' : '—'}</span>
              : index === 0 ? <span>{t('reference')}</span>
              : Math.abs(delta) <= tolerance ? <span>✓ {t('ok')}</span>
              : <><span className="tramming-action">{t(delta > 0 ? 'lower' : 'raise', { value: format(Math.abs(delta)) })}</span><small>≈ {t('turns', { value: turns(delta, threads[thread]) })}</small></>}
          </div>;
        })}
      </div>

      <div className="stack tramming-side">
        {shown && <div className={'tramming-flatness'} data-level={flatnessLevel(shown.range)}>
          <span>{t('flatness')}</span><strong>{format(shown.range)} mm</strong><span>{t('levels.' + flatnessLevel(shown.range))}</span>
          <small>{t('measuredAt', { date: new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(shown.at)) })}{passes ? ' · ' + t('passes', { count: passes }) : ''}</small>
        </div>}
        {busy && <p role="status">{t('progress', { point: (current ?? 0) + 1 })}</p>}
        {countdown !== null && <p className="notice" role="status">{t('restartIn', { seconds: countdown })}</p>}
        {result && flatnessLevel(result.range) === 'excellent' && <p className="notice" role="status">{t('done')}</p>}
        {failure && <p className="error" role="alert">{t('errors.' + (['tramming-state', 'tramming-failed', 'tramming-sequence', 'command-busy', 'rate', 'forbidden'].includes(failure.code) ? failure.code : 'tramming-unavailable'))}{failure.detail && <><br /><code>{failure.detail}</code></>}</p>}
        <label className="check"><input type="checkbox" checked={loop} disabled={busy} onChange={event => { setLoop(event.target.checked); if (!event.target.checked) setCountdown(null); }} />{t('loop', { seconds: delay })}</label>
        <div className="row wrap">
          {!busy && countdown === null && <button type="button" className="primary" disabled={!allowed} onClick={() => setConfirming(true)}>{t(shown ? 'again' : 'start')}</button>}
          {countdown !== null && <button type="button" className="primary" onClick={() => { setCountdown(null); void pass(); }}>{t('now')}</button>}
          {(busy || countdown !== null) && <button type="button" onClick={validate}>{t(busy ? 'stopAfter' : 'validate')}</button>}
        </div>
        {!allowed && !busy && <small>{t('blocked')}</small>}
        <small>{t('help')}</small>
      </div>
    </div>

    {confirming && <ConfirmDialog close={() => setConfirming(false)} submit={() => { setConfirming(false); void pass(); }} />}
  </section>;
}

function ConfirmDialog({ close, submit }: { close(): void; submit(): void }) {
  const { t } = useTranslation('tramming'); const ref = useRef<HTMLDialogElement>(null); const [checked, setChecked] = useState(false);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby="tramming-confirm" onClose={close}><div className="stack">
    <h2 id="tramming-confirm">{t('confirmTitle')}</h2><p>{t('confirmText')}</p>
    <label className="check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />{t('confirmCheck')}</label>
    <div className="row wrap"><button type="button" autoFocus onClick={close}>{t('cancel')}</button><button type="button" className="primary" disabled={!checked} onClick={submit}>{t('start')}</button></div>
  </div></dialog>;
}
