export function Unavailable({ message, camera = false }: { message: string; camera?: boolean }) {
  return <div className={'unavailable-control' + (camera ? ' camera-stage' : '')}><div className="unavailable-skeleton" aria-hidden="true" inert>
    {camera ? <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="15" height="14" rx="2" /><path d="m18 9 4-3v12l-4-3" /></svg> : <><input type="text" value="—" disabled tabIndex={-1} readOnly /><button type="button" disabled tabIndex={-1}>−</button><button type="button" disabled tabIndex={-1}>+</button></>}
  </div><p className="unavailable-message">{message}</p></div>;
}
