import { useTranslation } from 'react-i18next';
import type { MachineData } from '../../types.ts';
import { StatusBadge } from '../StatusBadge.tsx';
export function MachineHeader({ machine, role, tab = 'overview' }: { machine: MachineData; role: 'admin' | 'observer'; tab?: 'files' | 'logs' | 'overview' }) {
  const { t } = useTranslation('machine');
  return <><div className="hero"><div className="row wrap"><a className="button ghost" href="#machines" aria-label={t('back')}>←</a><div><h1 tabIndex={-1}>{machine.name}</h1><p>{machine.model}</p></div><StatusBadge status={machine.status} /></div>{role === 'admin' && <a className="button ghost" href={'/?machine=' + encodeURIComponent(machine.id)}>{t('machineSettings')}</a>}</div>
    <nav className="react-machine-tabs" aria-label={t('machineNavigation')}><a href={'#machine/' + machine.id} aria-current={tab === 'overview' ? 'page' : undefined}>{t('overview')}</a><a href={'#machine/' + machine.id + '/files'} aria-current={tab === 'files' ? 'page' : undefined}>{t('files')}</a>{role === 'admin' && <a href={'#machine/' + machine.id + '/logs'} aria-current={tab === 'logs' ? 'page' : undefined}>{t('logs')}</a>}{machine.capabilities?.terminal && <a href={'/?machine=' + encodeURIComponent(machine.id) + '&tab=console'}>{t('console')}</a>}</nav>
  </>;
}
