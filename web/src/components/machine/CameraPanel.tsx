import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.js';
import type { createApi } from '../../api.ts';
import { Unavailable } from './Unavailable.tsx';

export function CameraPanel({ machine, api }: { machine: MachineData; api: ReturnType<typeof createApi> }) {
  const { t } = useTranslation('machine'); const [playing, setPlaying] = useState(false), [view, setView] = useState('side');
  const [preview, setPreview] = useState<string | null>(null), [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const supported = machine.capabilities?.camera === true;
  const online = !['offline', 'connecting'].includes(machine.status);
  const cameraView = machine.kind === 'xtool-m2' ? view : '';
  useEffect(() => {
    if (!supported || !online || playing) return;
    const controller = new AbortController(); let url: string | undefined;
    setPreview(null); setFailed(false);
    void api.preview(machine.id, cameraView, controller.signal).then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setPreview(url); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [api, machine.id, cameraView, playing, supported, online]);
  useEffect(() => { const current = image.current; return () => current?.removeAttribute('src'); }, [playing, cameraView, supported, online, preview]);
  useEffect(() => { if (!online) setPlaying(false); }, [online]);
  const stream = '/api/machines/' + encodeURIComponent(machine.id) + '/camera' + (cameraView ? '/' + cameraView : '');
  return <section className="panel stack machine-camera" data-machine-block="camera"><div className="row between wrap"><h2>{t('camera')}</h2><small>{t(playing ? 'live' : 'openingPreview')}</small></div>
    {supported && machine.kind === 'xtool-m2' && <label>{t('cameraView')}<select value={view} onChange={e => { setPreview(null); setPlaying(false); setFailed(false); setView(e.target.value); }}>{['side', 'far', 'near'].map(key => <option key={key} value={key}>{t('cameraViews.' + key)}</option>)}</select></label>}
    {!supported || !online ? <Unavailable camera message={t(!supported ? 'cameraUnsupported' : 'offline')} /> : failed ? <><Unavailable camera message={t('cameraUnavailable')} /><button type="button" onClick={() => { setPreview(null); setFailed(false); setPlaying(true); }}>{t('viewCamera')}</button></> : <>
      {(playing || preview) ? <img key={playing ? 'stream:' + cameraView : 'preview:' + preview} ref={image} className="react-camera-image" src={playing ? stream : preview!} alt={t(playing ? 'liveCamera' : 'cameraPreview', { name: machine.name })} onError={() => { setFailed(true); setPlaying(false); }} /> : <p role="status">{t('loadingCamera')}</p>}
      <div className="row wrap"><button type="button" onClick={() => { setPreview(null); setFailed(false); setPlaying(value => !value); }}>{t(playing ? 'closeCamera' : 'viewCamera')}</button></div>
    </>}
  </section>;
}
