import { useTranslation } from 'react-i18next';
import type { ActivityEntry } from '../types.js';
import { StatusBadge } from './StatusBadge.js';
import { Icon } from './Icon.js';
export function ActivityList({ events }: { events: ActivityEntry[] }) {
  const { t, i18n } = useTranslation('fleet');
  return events.length ? <ul className="activity-list">{events.map(event => {
    const date = new Date(event.at);
    return <li className="activity row" key={event.id}><Icon name="history" /><div className="activity-description"><p>{event.machineName}</p><StatusBadge status={event.status} /><br /><small><time dateTime={Number.isFinite(date.getTime()) ? event.at : undefined}>{Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(date) : t('unknown')}</time></small></div><a className="button ghost" href={'/?machine=' + encodeURIComponent(event.machineId)} aria-label={t('openMachine', { name: event.machineName })}><Icon name="arrow" /></a></li>;
  })}</ul> : <p className="muted">{t('noEvents')}</p>;
}
