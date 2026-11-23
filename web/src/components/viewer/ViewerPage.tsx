// Visualiseur G-code React (MIG-06.2.2) : lecture en flux, couches, 2D/3D, suivi du fichier en cours et simulation
// locale. Chaque ressource (lecture, animation, observateurs, écouteurs) est libérée au démontage ou au changement de
// fichier. Aucun ordre machine : le lancement passe par la confirmation existante.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { layerOfSegment, printedSegments, type GcodeResult } from '../../../../poc/gcode.mjs';
import type { createApi } from '../../api.ts';
import type { ViewerSource } from '../../route.ts';
import type { MachineData } from '../../types.ts';
import { loadGcode, ViewerLoadError } from '../../viewer/load.ts';
import { advance, draw, fit, initialCamera, orbit, zoom, type Camera, type View } from '../../viewer/render.ts';
import { PrintFileDialog } from '../files/PrintFileDialog.tsx';
import { MachineHeader } from '../machine/MachineHeader.tsx';
import './viewer.css';

type Props = { machine: MachineData; source: ViewerSource; role: 'admin' | 'observer'; stale: boolean; api: ReturnType<typeof createApi> };
type Load = { status: 'idle' | 'loading' | 'ready' | 'error'; result: GcodeResult | null; percent: number; error: string; name: string };

/** Fichier en cours d'impression sur la machine, s'il est connu avec sa position. */
export const liveFile = (machine: MachineData) => (machine.status === 'printing' || machine.status === 'paused') && typeof machine.filePath === 'string' && Number.isFinite(machine.filePosition) ? machine.filePath : null;
const fileName = (path: string) => path.split('/').pop() || path;

export function ViewerPage({ machine, source, role, stale, api }: Props) {
  const { t, i18n } = useTranslation('viewer');
  const laser = machine.kind === 'xtool-m2';
  const [local, setLocal] = useState<File | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'idle', result: null, percent: 0, error: '', name: '' });
  const [layer, setLayer] = useState(0);
  const [follow, setFollow] = useState(source.kind === 'machine' && source.follow);
  const [options, setOptions] = useState({ travel: true, previous: true });
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const [speed, setSpeed] = useState(10);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [print, setPrint] = useState(false);
  const path = source.kind === 'machine' ? source.path : null;
  const startAt = useRef({ mode: camera.mode, follow }); startAt.current = { mode: camera.mode, follow };

  // Lecture : relancée à chaque fichier, annulée en quittant la page ou en changeant de fichier.
  useEffect(() => {
    const target = source.kind === 'machine' ? { kind: 'machine' as const, machineId: machine.id, path: source.path } : local ? { kind: 'local' as const, file: local } : null;
    if (!target) { setLoad({ status: 'idle', result: null, percent: 0, error: '', name: '' }); return; }
    const controller = new AbortController();
    const name = target.kind === 'machine' ? fileName(target.path) : local?.name ?? '';
    setLoad({ status: 'loading', result: null, percent: 0, error: '', name });
    setCursor(null); setPlaying(false); setLayer(0);
    loadGcode(target, { laser, signal: controller.signal, onProgress: (read, size) => setLoad(state => ({ ...state, percent: size ? Math.min(100, Math.floor(read / size * 100)) : 0 })) })
      .then(result => {
        if (controller.signal.aborted) return;
        // En 3D sans suivi, la dernière couche avec les précédentes montre la pièce entière.
        if (startAt.current.mode === '3d' && !startAt.current.follow) setLayer(Math.max(0, result.layers.length - 1));
        setLoad({ status: 'ready', result, percent: 100, error: '', name });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoad({ status: 'error', result: null, percent: 0, error: error instanceof ViewerLoadError ? error.code : 'read', name }); });
    return () => controller.abort();
  }, [machine.id, source.kind, path, local, laser]);

  const result = load.result;
  // Suivi en direct : seulement pour le fichier de la machine réellement en cours, à sa position remontée.
  const printed = useMemo(() => {
    if (!result || source.kind !== 'machine' || liveFile(machine) !== source.path) return null;
    return printedSegments(result, machine.filePosition!);
  }, [result, source, machine]);
  useEffect(() => {
    if (!result?.layers.length) return;
    if (follow && printed != null) setLayer(layerOfSegment(result, Math.max(0, printed - 1)));
  }, [result, follow, printed]);

  // Simulation locale : une seule boucle d'animation, arrêtée en pause, en fin de fichier et au démontage.
  const cursorRef = useRef<number | null>(null);
  cursorRef.current = cursor;
  useEffect(() => {
    if (!playing || !result?.types.length) return;
    let frame = 0, last: number | null = null;
    const tick = (time: number) => {
      const next = advance(result, cursorRef.current ?? 0, last == null ? 0 : (time - last) / 1000, speed);
      last = time;
      setCursor(next);
      setLayer(layerOfSegment(result, Math.min(result.types.length - 1, Math.floor(next))));
      if (next >= result.types.length) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, result, speed]);

  const togglePlay = () => {
    if (!result?.types.length) return;
    if (playing) { setPlaying(false); return; }
    setFollow(false);
    if (cursor == null || cursor >= result.types.length) setCursor(0);
    setPlaying(true);
  };
  // Un choix manuel de couche suspend suivi et simulation.
  const chooseLayer = (index: number) => {
    if (!result?.layers.length) return;
    setPlaying(false); setCursor(null); setFollow(false);
    setLayer(Math.min(Math.max(index, 0), result.layers.length - 1));
  };

  const current = result?.layers[layer];
  const number = (value: number) => value.toLocaleString(i18n.resolvedLanguage);
  const status = cursor != null ? t('simulation') : printed != null && result ? t(machine.status === 'paused' ? 'livePaused' : 'live', { layer: layerOfSegment(result, Math.max(0, printed - 1)) + 1, layers: result.layers.length, progress: machine.progress ?? 0 }) : t('preview');
  const canPrint = role === 'admin' && source.kind === 'machine' && !stale && (machine.status === 'ready' || machine.status === 'done') && load.status === 'ready';

  return <div className="react-viewer">
    <MachineHeader machine={machine} role={role} tab="files" />
    <section className="panel stack viewer-head">
      <div className="row wrap between">
        <div><h2>{load.name || t('localTitle')}</h2>{path && <small className="viewer-path">{path}</small>}</div>
        <div className="row wrap">
          <a className="button ghost" href={'#machine/' + machine.id + '/files'}>{t('back')}</a>
          {canPrint && <button type="button" className="primary" onClick={() => setPrint(true)}>{t('print')}</button>}
        </div>
      </div>
      {source.kind === 'local' && <label className="stack">{t('localPick')}<input type="file" accept=".gcode,.gco,.g,.gc,.nc" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) setLocal(file); }} /><small>{t('localNotice')}</small></label>}
      {load.status === 'loading' && <><p role="status">{t(source.kind === 'local' ? 'readingLocal' : 'reading', { percent: load.percent })}</p><progress value={load.percent} max={100} aria-label={t('progress')} /></>}
      {load.status === 'error' && <p className="error" role="alert">{t('error.' + (['files-unavailable', 'missing', 'forbidden', 'sign-in', 'network', 'project-no-gcode', 'project-multiple-plates', 'project-format'].includes(load.error) ? load.error : 'read'))}</p>}
      {result && <p className="muted">{t('summary', { lines: result.lines, layers: result.layers.length, segments: result.types.length })}</p>}
      {result?.unsupported.length ? <p className="notice" role="status">{t('unsupported')} {result.unsupported.map(item => <span key={item.command}><code>{item.command}</code> × {item.count} ({t('firstLine', { line: item.line })}) </span>)}</p> : null}
    </section>
    {result && (result.layers.length && current ? <section className="panel stack viewer-body">
      <div className="viewer-tools stack">
        <div className="row wrap between"><strong role="status">{status}</strong>
          {source.kind === 'machine' && <label className="row"><input type="checkbox" checked={follow} onChange={event => { setFollow(event.target.checked); if (event.target.checked) { setPlaying(false); setCursor(null); } }} /> {t('follow')}</label>}</div>
        <div className="row wrap">
          <button type="button" onClick={() => chooseLayer(layer - 1)} disabled={layer === 0}>{t('previousLayer')}</button>
          <label className="viewer-layer stack"><span>{t('layer', { layer: layer + 1, layers: result.layers.length, z: number(current.z) })}</span>
            <input type="range" min={1} max={result.layers.length} value={layer + 1} onChange={event => chooseLayer(Number(event.target.value) - 1)} /></label>
          <button type="button" onClick={() => chooseLayer(layer + 1)} disabled={layer + 1 >= result.layers.length}>{t('nextLayer')}</button>
        </div>
        <div className="row wrap">
          <label className="row"><input type="checkbox" checked={options.travel} onChange={event => setOptions(value => ({ ...value, travel: event.target.checked }))} /> {t('travel')}</label>
          <label className="row"><input type="checkbox" checked={options.previous} onChange={event => setOptions(value => ({ ...value, previous: event.target.checked }))} /> {t('previous')}</label>
          {(['2d', '3d'] as const).map(mode => <button key={mode} type="button" className={camera.mode === mode ? 'primary' : ''} aria-pressed={camera.mode === mode} onClick={() => { setCamera(value => ({ ...value, mode })); if (mode === '3d' && !follow && cursor == null) setLayer(result.layers.length - 1); }}>{mode.toUpperCase()}</button>)}
          <button type="button" onClick={togglePlay}>{t(playing ? 'pause' : 'play')}</button>
          <button type="button" onClick={() => { setPlaying(false); setCursor(null); }}>{t('restart')}</button>
          <label>{t('speed')} <select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[1, 5, 10, 50, 100].map(value => <option key={value} value={value}>×{value}</option>)}</select></label>
          <small>{cursor != null ? t('simulationProgress', { percent: Math.round(cursor / result.types.length * 100) }) : t('simulationNotice')}</small>
        </div>
      </div>
      <GcodeCanvas result={result} camera={camera} setCamera={setCamera} layer={layer} options={options} cursor={cursor} printed={printed} label={t('canvas')} zoomIn={t('zoomIn')} zoomOut={t('zoomOut')} fitLabel={t('fit')} />
      <div className="row wrap"><small className="viewer-legend good">{t(laser ? 'doneLaser' : 'done')}</small><small className="viewer-legend neutral">{t(laser ? 'todoLaser' : 'todo')}</small><small className="viewer-legend info">{t('travelMove')}</small><small className="viewer-legend warn">{t(laser ? 'tool' : 'nozzle')}</small><small>{t('gestures')}</small></div>
    </section> : <p className="notice">{t(laser ? 'emptyLaser' : 'empty')}</p>)}
    {print && path && <PrintFileDialog machine={machine} path={path} role={role} stale={stale} api={api} close={() => setPrint(false)} changed={() => {}} />}
  </div>;
}

type CanvasProps = {
  result: GcodeResult; camera: Camera; setCamera(camera: Camera): void; layer: number; options: { travel: boolean; previous: boolean };
  cursor: number | null; printed: number | null; label: string; zoomIn: string; zoomOut: string; fitLabel: string;
};

/** Canvas : cadrage, zoom, déplacement et rotation ; redimensionnement observé ; tout est détaché au démontage. */
function GcodeCanvas({ result, camera, setCamera, layer, options, cursor, printed, label, zoomIn, zoomOut, fitLabel }: CanvasProps) {
  const area = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, redraw] = useState(0);
  const latest = useRef({ result, camera }); latest.current = { result, camera };

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Nouveau fichier ou changement 2D/3D : recadrage.
  useEffect(() => { view.current = null; redraw(n => n + 1); }, [result, camera.mode]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !size.width || !size.height) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    view.current ??= fit(result, camera, size.width, size.height);
    const context = element.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const styles = getComputedStyle(document.documentElement), color = (name: string) => styles.getPropertyValue(name).trim();
    draw(context, result, camera, view.current, { layer, previous: options.previous, travel: options.travel, cursor, printed }, { dim: color('--dim'), accent: color('--accent'), travel: color('--blue'), marker: color('--amber'), text: color('--text') }, size.width, size.height);
  });

  // Molette non passive (empêche le défilement de la page) et glisser au pointeur, détachés au démontage.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let drag: { id: number; x: number; y: number; orbit: boolean } | null = null;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!view.current) return;
      const box = element.getBoundingClientRect();
      view.current = zoom(view.current, event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - box.left, event.clientY - box.top);
      redraw(n => n + 1);
    };
    const down = (event: PointerEvent) => {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, orbit: latest.current.camera.mode === '3d' && !event.shiftKey && event.button === 0 };
      element.setPointerCapture(event.pointerId);
      area.current?.classList.add('dragging');
    };
    const move = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId || !view.current) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.orbit) {
        const next = orbit(latest.current.result, latest.current.camera, view.current, dx, dy, element.clientWidth, element.clientHeight);
        view.current = next.view;
        setCamera(next.camera);
      } else {
        view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy };
        redraw(n => n + 1);
      }
    };
    const release = () => { drag = null; area.current?.classList.remove('dragging'); };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointercancel', release);
    };
  }, [setCamera]);

  const zoomCenter = (factor: number) => { if (view.current) { view.current = zoom(view.current, factor, size.width / 2, size.height / 2); redraw(n => n + 1); } };
  return <>
    <div className="row wrap viewer-zoom">
      <button type="button" aria-label={zoomOut} onClick={() => zoomCenter(1 / 1.2)}>−</button>
      <button type="button" aria-label={zoomIn} onClick={() => zoomCenter(1.2)}>+</button>
      <button type="button" onClick={() => { view.current = null; redraw(n => n + 1); }}>{fitLabel}</button>
    </div>
    <div className="viewer-canvas" ref={area}><canvas ref={canvas} role="img" aria-label={label} /></div>
  </>;
}
