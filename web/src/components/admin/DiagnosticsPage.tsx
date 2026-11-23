// Diagnostics (MIG-06.2.3) : 300 événements au plus depuis le démarrage, filtrés par machine ou FabCore. Lecture seule.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { createApi } from '../../api.ts';
import { codeLabel } from './codes.ts';

export function DiagnosticsPage({ api }: { api: ReturnType<typeof createApi> }) {
  const { t, i18n } = useTranslation('admin');
  const diagnostics = useQuery({ queryKey: ['diagnostics'], queryFn: ({ signal }) => api.diagnostics(signal), staleTime: 5000 });
  const [scope, setScope] = useState('');
  const date = (at?: string | null) => at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString(i18n.resolvedLanguage) : '—';
  const data = diagnostics.data;
  const names = new Map(data?.fleet.map(({ id, name }) => [id, name]) ?? []);
  const current = scope === 'server' || names.has(scope) ? scope : '';
  const events = data?.events.filter(({ id }) => !current || (current === 'server' ? id === null : id === current)) ?? [];
  const selected = current && current !== 'server' ? data?.machines?.[current] : undefined;
  return <section className="panel stack">
    <div className="row between wrap"><h1 tabIndex={-1}>{t('diagnostics.title')}</h1><button type="button" disabled={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }}>{t('refresh')}</button></div>
    {!data ? <p role={diagnostics.isError ? 'alert' : 'status'} className={diagnostics.isError ? 'error' : ''}>{t(diagnostics.isError ? 'diagnostics.unavailable' : 'loading')}</p> : <>
      <small>{t('diagnostics.scopeHelp')}</small>
      <label className="stack">{t('diagnostics.scope')}<select value={current} onChange={event => setScope(event.target.value)}>
        <option value="">{t('diagnostics.all')}</option><option value="server">FabCore</option>
        {data.fleet.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      {selected && <div className="row wrap"><small>{t('diagnostics.lastReport', { date: date(selected.reportAt) })}</small><small>{t('diagnostics.lastFrame', { date: date(selected.frameAt) })}</small></div>}
      {events.length ? <ul className="react-activity">{events.map((event, index) => <li key={event.at + ':' + index} className="activity">
        <small>{date(event.at)} · {event.id ? names.get(event.id) ?? t('diagnostics.removed') : 'FabCore'} · {t('diagnostics.area.' + event.area, { defaultValue: event.area })}</small>
        <p>{codeLabel(t, event.code, ['diagnostic', 'issue', 'status'])}</p>
      </li>)}</ul> : <p>{t('diagnostics.empty')}</p>}
    </>}
  </section>;
}
