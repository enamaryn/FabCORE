// Journal d'une machine (MIG-06.2.3, administrateur) : 500 dernières entrées, recherche locale, téléchargement complet.
// Le serveur filtre déjà secrets, codes LAN et jetons ; les détails restent du texte, jamais du HTML.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { createApi } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { codeLabel } from '../admin/codes.ts';

export function LogsPanel({ machine, api }: { machine: MachineData; api: ReturnType<typeof createApi> }) {
  const { t, i18n } = useTranslation('admin');
  const log = useQuery({ queryKey: ['machine-log', machine.id], queryFn: ({ signal }) => api.machineLog(machine.id, signal), staleTime: 5000 });
  const [query, setQuery] = useState('');
  const lines = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const all = [...(log.data?.lines ?? [])].reverse();
    return needle ? all.filter(line => JSON.stringify(line).toLocaleLowerCase().includes(needle)) : all;
  }, [log.data, query]);
  const date = (at?: string) => at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString(i18n.resolvedLanguage) : '—';
  return <section className="panel stack react-logs">
    <div className="row between wrap"><h2>{t('logs.title')}</h2><div className="row wrap">
      <button type="button" disabled={log.isFetching} onClick={() => { void log.refetch(); }}>{t('refresh')}</button>
      <a className="button ghost" href={'/api/machines/' + encodeURIComponent(machine.id) + '/logs-download'} download>{t('logs.download')}</a>
    </div></div>
    <p className="notice">{machine.kind === 'bambu-cloud' ? t('logs.cloud') + ' ' : ''}{t('logs.help')}</p>
    <label className="stack">{t('logs.search')}<input type="search" value={query} maxLength={200} placeholder={t('logs.searchPlaceholder')} onChange={event => setQuery(event.target.value)} /></label>
    {log.isError && <p className="error" role="alert">{t('logs.unavailable')}</p>}
    <small role="status">{log.isFetching ? t('loading') : t('logs.count', { count: lines.length })}</small>
    <div className="react-log-entries">{log.data && (lines.length ? lines.map((line, index) => <details key={(line.at ?? '') + ':' + index} open={index < 20}>
      <summary>{date(line.at)} · {line.event ? codeLabel(t, line.event, ['event']) : '—'}{typeof line.details?.operation === 'string' ? ' · ' + line.details.operation : ''}</summary>
      <pre>{JSON.stringify(line.details ?? {}, null, 2)}</pre>
    </details>) : <p>{t(query.trim() ? 'logs.noMatch' : 'logs.empty')}</p>)}</div>
  </section>;
}
