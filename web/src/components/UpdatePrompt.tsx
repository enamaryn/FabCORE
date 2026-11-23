// Mise à jour disponible (administrateur) : « Ne pas me rappeler » (pour cette version), « Me rappeler plus tard »
// (une fois par jour au plus) ou « Faire la mise à jour » (commande à lancer sur le serveur). Choix gardés dans ce
// navigateur ; une nouvelle version publiée redéclenche l'annonce.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VersionStatus } from '../api.ts';
import { savePreference } from '../preferences.ts';
import { day } from '../update.ts';

export function UpdatePrompt({ version, open, onClose }: { version: VersionStatus; open: boolean; onClose(): void }) {
  const { t } = useTranslation('common');
  const dialog = useRef<HTMLDialogElement>(null);
  const [instructions, setInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { setInstructions(false); setCopied(false); element.showModal(); }
    if (!open && element.open) element.close();
  }, [open]);
  const later = () => { savePreference('fabcore-update-remind', String(Date.now() + day)); onClose(); };
  const never = () => { if (version.latest) savePreference('fabcore-update-dismissed', version.latest); onClose(); };
  const command = 'fabcore update';
  return <dialog ref={dialog} className="update-dialog" aria-labelledby="update-title" onCancel={event => { event.preventDefault(); later(); }}>
    <div className="stack">
      <h2 id="update-title">{t('update.title')}</h2>
      <p>{t('update.text', { current: version.current?.slice(0, 7) ?? '?', latest: version.latest?.slice(0, 7) ?? '?' })}</p>
      {instructions ? <>
        <p>{t('update.how')}</p>
        <div className="row wrap"><code className="update-command">{command}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => setCopied(false)); }}>{t(copied ? 'update.copied' : 'update.copy')}</button></div>
        <small>{t('update.after')}</small>
        <div className="row wrap"><button type="button" className="primary" onClick={later}>{t('update.close')}</button></div>
      </> : <div className="row wrap">
        <button type="button" onClick={never}>{t('update.never')}</button>
        <button type="button" onClick={later}>{t('update.later')}</button>
        <button type="button" className="primary" onClick={() => setInstructions(true)}>{t('update.now')}</button>
      </div>}
    </div>
  </dialog>;
}
