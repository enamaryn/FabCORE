import { useTranslation } from 'react-i18next';
import type { ActivityEntry } from '../types.js';
import { ActivityList } from './ActivityList.js';
export function HistoryPage({ events }: { events: ActivityEntry[] }) {
  const { t } = useTranslation('fleet');
  return <><div className="hero"><div><h1 tabIndex={-1}>{t('recentActivity')}</h1><p>{t('historyDescription')}</p></div></div><section className="panel"><ActivityList events={events} /></section></>;
}
