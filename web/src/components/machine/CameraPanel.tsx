import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.js';
import type { createApi } from '../../api.ts';
import { BambuCameraSettings } from './BambuCameraSettings.tsx';
import { Unavailable } from './Unavailable.tsx';

export type CameraSize = 'normal' | 'wide' | 'page';
/** Caméra : clic sur l'image pour agrandir dans la page ; « Pleine page » occupe la fenêtre du navigateur (pas le plein écran système), Échap pour revenir. */
export function CameraPanel({ machine, api, size = 'normal', onSize = () => {}, role = 'observer' }: { machine: MachineData; api: ReturnType<typeof createApi>; size?: CameraSize; role?: 'admin' | 'observer'; onSize?(size: CameraSize): void }) {
  const { t } = useTranslation('machine'); const { t: cameraText } = useTranslation('camera'); const [playing, setPlaying] = useState(false), [view, setView] = useState('side');
  const [preview, setPreview] = useState<string | null>(null), [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const supported = machine.capabilities?.camera === true;
  const online = !['offline', 'connecting'].includes(machine.status);
  const cameraView = machine.kind === 'xtool-m2' ? view : '';
  useEffect(() => {
    if (!supported || !online || playing || failed) return;
    const controller = new AbortController(); let url: string | undefined;
    setPreview(null); setFailed(false);
    void api.preview(machine.id, cameraView, controller.signal).then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setPreview(url); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, machine.id, cameraView, playing, supported, online, failed]);
  useEffect(() => { const current = image.current; return () => current?.removeAttribute('src'); }, [playing, cameraView, supported, online, preview]);
  useEffect(() => { if (!online) setPlaying(false); }, [online]);
  useEffect(() => {
    if (size !== 'page') return;
    const leave = (event: KeyboardEvent) => { if (event.key === 'Escape') onSize('normal'); };
    document.addEventListener('keydown', leave); document.body.classList.add('camera-page-open');
    return () => { document.removeEventListener('keydown', leave); document.body.classList.remove('camera-page-open'); };
  }, [size, onSize]);
  useEffect(() => () => onSize('normal'), [machine.id, onSize]);
  const stream = '/api/machines/' + encodeURIComponent(machine.id) + '/camera' + (cameraView ? '/' + cameraView : '');
  return <section className="panel stack machine-camera" data-machine-block="camera" data-size={size}><div className="row between wrap"><h2>{t('camera')}</h2><small>{t(playing ? 'live' : 'openingPreview')}</small></div>
    {machine.kind === 'bambu-cloud' && <div className="stack"><p className="notice">{cameraText(machine.camera?.available ? 'hybrid' : machine.camera?.issue ?? 'camera-disabled')}</p>{role === 'admin' && <BambuCameraSettings machine={machine} api={api} />}</div>}
    {supported && machine.kind === 'xtool-m2' && <label>{t('cameraView')}<select value={view} onChange={e => { setPreview(null); setPlaying(false); setFailed(false); setView(e.target.value); }}>{['side', 'far', 'near'].map(key => <option key={key} value={key}>{t('cameraViews.' + key)}</option>)}</select></label>}
    {!supported || !online ? <Unavailable camera message={t(!supported ? 'cameraUnsupported' : 'offline')} /> : failed ? <><Unavailable camera message={t('cameraUnavailable')} /><button type="button" onClick={() => { setPreview(null); setFailed(false); setPlaying(true); }}>{t('viewCamera')}</button></> : <>
      {(playing || preview) ? <button type="button" className="camera-zoom" aria-label={t(size === 'normal' ? 'cameraEnlarge' : 'cameraReduce')} aria-pressed={size !== 'normal'} onClick={() => onSize(size === 'normal' ? 'wide' : 'normal')}><img key={playing ? 'stream:' + cameraView : 'preview:' + preview} ref={image} className="react-camera-image" src={playing ? stream : preview!} alt={t(playing ? 'liveCamera' : 'cameraPreview', { name: machine.name })} onError={() => { setFailed(true); setPlaying(false); }} /></button> : <p role="status">{t('loadingCamera')}</p>}
      <div className="row wrap"><button type="button" onClick={() => { setPreview(null); setFailed(false); setPlaying(value => !value); }}>{t(playing ? 'closeCamera' : 'viewCamera')}</button>{(playing || preview) && <button type="button" onClick={() => onSize(size === 'page' ? 'normal' : 'page')}>{t(size === 'page' ? 'cameraExitPage' : 'cameraPage')}</button>}</div>
    </>}
  </section>;
}
