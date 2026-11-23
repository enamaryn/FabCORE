import { useTranslation } from 'react-i18next';
import type { ActivityEntry, MachineData } from '../types.js';
import { Icon } from './Icon.js';
import { StatusBadge } from './StatusBadge.js';
import { FilamentDots } from './FilamentDots.js';
import { ActivityList } from './ActivityList.js';
export interface FleetPageProps { machines: MachineData[]; overview: boolean; role: 'admin' | 'observer'; events: ActivityEntry[] }
export function MachineCard({ machine }: { machine: MachineData }) {
  const { t, i18n } = useTranslation('fleet');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const progress = machine.progressKnown !== false && typeof machine.progress === 'number' && Number.isFinite(machine.progress) && machine.progress >= 0 && machine.progress <= 100 ? machine.progress : null;
  const temperature = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(language, { style: 'unit', unit: 'celsius', maximumFractionDigits: 1 }).format(value) : t('unknown');
  const checked = machine.checkedAt ? new Date(machine.checkedAt) : null;
  return <article className="machine"><FilamentDots machine={machine} /><div className="row between machine-header"><div className="row"><span className="machine-mark"><Icon name="machines" /></span><div><h3>{machine.name}</h3>{machine.model && <small>{machine.model}</small>}</div></div><div className="card-indicators"><StatusBadge status={machine.status} /></div></div><div className="row between job"><span>{machine.file || t('noJob')}</span><strong>{progress === null ? t('unknown') : number.format(progress) + ' %'}</strong></div>{progress === null ? <small className="progress-unavailable">{t('progressUnknown')}</small> : <progress value={progress} max={100} aria-label={t('progressFor', { name: machine.name })} />}<div className="row wrap machine-temperatures"><small>{t('nozzle')}: {temperature(machine.nozzle)}</small><small>{t('bed')}: {temperature(machine.bed)}</small></div>{machine.status === 'offline' && <small>{t('lastReadings')}</small>}{checked && Number.isFinite(checked.getTime()) && <small>{t('updated')}: <time dateTime={machine.checkedAt ?? undefined}>{new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(checked)}</time></small>}<a className="button ghost machine-open" href={'/?machine=' + encodeURIComponent(machine.id)}>{t('openMachine', { name: machine.name })}<Icon name="arrow" /></a></article>;
}
export function FleetPage({ machines, overview, role, events }: FleetPageProps) {
  const { t, i18n } = useTranslation('fleet');
  const totals = [machines.length, machines.filter(machine => machine.status === 'printing').length, machines.filter(machine => machine.status === 'ready').length, machines.filter(machine => ['offline', 'error'].includes(machine.status)).length];
  const grid = <section className="fleet-grid-scope" aria-labelledby="fleet-heading"><div className="row between section-head"><h2 id="fleet-heading">{t('machines')}</h2>{overview && <a href="#machines">{t('viewFleet')}</a>}</div>{machines.length ? <div className="cards machine-grid">{machines.map(machine => <MachineCard key={machine.id} machine={machine} />)}</div> : <p className="notice">{t(role === 'admin' ? 'emptyAdmin' : 'emptyObserver')}</p>}</section>;
  return <><div className="hero"><div><h1 tabIndex={-1}>{t(overview ? 'overview' : 'machines')}</h1><p>{t(overview ? 'overviewDescription' : 'fleetDescription')}</p></div>{role === 'admin' && <a className="button primary" href="/?screen=add"><Icon name="plus" />{t('addMachine')}</a>}</div>{overview ? <><div className="stats">{(['total', 'printing', 'ready', 'attention'] as const).map((key, index) => <div className="stat" key={key}><small>{t('stats.' + key)}</small><strong>{new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(totals[index] ?? 0)}</strong></div>)}</div><div className="fleet-overview">{grid}<section className="panel"><div className="section-head"><h2>{t('recentActivity')}</h2></div><ActivityList events={events.slice(0, 4)} /><a className="button ghost" href="#history">{t('viewHistory')}<Icon name="arrow" /></a></section></div></> : grid}</>;
}
