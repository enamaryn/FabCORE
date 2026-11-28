// Console G-code (administrateur) : une ligne par envoi, réponses de la machine affichées en entier (texte brut),
// historique ↑/↓, commandes rapides. Pendant une impression, le serveur exige une confirmation explicite pour
// toute commande autre qu'une lecture d'état. Un résultat inconnu n'est jamais renvoyé automatiquement.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type createApi } from '../../api.ts';
import type { MachineData } from '../../types.ts';
import { StatusBadge } from '../StatusBadge.tsx';
import './console.css';

type Outcome = 'pending' | 'executed' | 'accepted' | 'rejected' | 'unconfirmed' | 'failed';
export type ConsoleEntry = { id: number; command: string; outcome: Outcome; responses?: string[] | null; message?: string; at: string };
// Journal conservé pendant la session du navigateur, par machine (50 commandes).
const journals = new Map<string, ConsoleEntry[]>(), histories = new Map<string, string[]>();
let sequence = 0;
/** Commandes de lecture proposées : sans effet sur la machine. */
export const quickCommands = (kind: string) => kind === 'klipper' ? ['HELP', 'STATUS', 'QUERY_ENDSTOPS', 'GET_POSITION', 'M105'] : ['M105', 'M114', 'M115'];

export function ConsolePanel({ machine, api }: { machine: MachineData; api: ReturnType<typeof createApi> }) {
  const { t, i18n } = useTranslation('console');
  const [entries, setEntries] = useState<ConsoleEntry[]>(() => journals.get(machine.id) ?? []);
  const [command, setCommand] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState<string | null>(null);
  const cursor = useRef(-1), log = useRef<HTMLDivElement>(null), alive = useRef(true), controller = useRef(new AbortController());
  useEffect(() => () => { alive.current = false; controller.current.abort(); }, []);
  useEffect(() => { journals.set(machine.id, entries.slice(-50)); log.current?.scrollTo({ top: log.current.scrollHeight }); }, [entries, machine.id]);
  const update = (id: number, patch: Partial<ConsoleEntry>) => setEntries(items => items.map(item => item.id === id ? { ...item, ...patch } : item));

  async function send(script: string, confirmed = false) {
    const line = script.trim();
    if (busy || !line) return;
    if (!/^[\x20-\x7E]{1,256}$/.test(line)) { setEntries(items => [...items, { id: ++sequence, command: line.slice(0, 256), outcome: 'failed', message: t('invalid'), at: new Date().toISOString() }]); return; }
    const id = ++sequence; setBusy(true); setConfirm(null); setCommand(''); cursor.current = -1;
    histories.set(machine.id, [line, ...(histories.get(machine.id) ?? []).filter(item => item !== line)].slice(0, 30));
    setEntries(items => [...items, { id, command: line, outcome: 'pending', at: new Date().toISOString() }]);
    try {
      const result = await api.gcode(machine.id, line, confirmed, controller.current.signal);
      if (alive.current) update(id, { outcome: result.outcome, responses: result.responses ?? null, ...(result.message ? { message: result.message } : {}) });
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof ApiError ? error.code : 'network';
      if (code === 'terminal-confirm') { update(id, { outcome: 'failed', message: t('needsConfirm') }); setConfirm(line); }
      else update(id, { outcome: code === 'command-unconfirmed' || code === 'network' ? 'unconfirmed' : 'failed', message: t('errors.' + code, { defaultValue: t('errors.failed') }) });
    } finally { if (alive.current) setBusy(false); }
  }
  function key(event: React.KeyboardEvent<HTMLInputElement>) {
    const history = histories.get(machine.id) ?? [];
    if (event.key === 'ArrowUp' && history.length) { event.preventDefault(); cursor.current = Math.min(cursor.current + 1, history.length - 1); setCommand(history[cursor.current]!); }
    if (event.key === 'ArrowDown') { event.preventDefault(); cursor.current = Math.max(cursor.current - 1, -1); setCommand(cursor.current < 0 ? '' : history[cursor.current]!); }
  }
  const time = (at: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'medium' }).format(new Date(at));
  return <section className="panel stack console">
    <div className="row between wrap"><h2>{t('title')}</h2><span className="row">{t('target')} <strong>{machine.name}</strong> <StatusBadge status={machine.status} /></span></div>
    <div ref={log} className="console-log" role="log" aria-live="polite" aria-label={t('log')}>
      {entries.length ? entries.map(entry => <div key={entry.id} className="console-entry" data-outcome={entry.outcome}>
        <div className="row between wrap"><code className="console-command">&gt; {entry.command}</code><small>{time(entry.at)} · {t('outcomes.' + entry.outcome)}</small></div>
        {entry.message && <p className="console-message">{entry.message}</p>}
        {entry.outcome === 'executed' && entry.responses === null && <small className="muted">{t('noReplies')}</small>}
        {(entry.responses ?? []).map((line, index) => <pre key={index}>{line}</pre>)}
      </div>) : <small className="muted">{t('empty')}</small>}
    </div>
    {confirm && <div className="notice row wrap" role="alert"><span>{t('confirmText', { command: confirm })}</span><button type="button" onClick={() => setConfirm(null)}>{t('cancel')}</button><button type="button" className="danger" onClick={() => { void send(confirm, true); }}>{t('confirmSend')}</button></div>}
    <form className="row console-form" onSubmit={event => { event.preventDefault(); void send(command); }}>
      <input value={command} onChange={event => setCommand(event.target.value)} onKeyDown={key} maxLength={256} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label={t('command')} placeholder="M105" disabled={busy} />
      <button type="submit" className="primary" disabled={busy || !command.trim()}>{busy ? t('sending') : t('send')}</button>
    </form>
    <div className="row wrap console-quick"><small>{t('quick')}</small>{quickCommands(machine.kind ?? 'klipper').map(item => <button type="button" key={item} className="ghost" disabled={busy} onClick={() => { void send(item); }}>{item}</button>)}{entries.length > 0 && <button type="button" className="ghost" disabled={busy} onClick={() => setEntries([])}>{t('clear')}</button>}</div>
    <small className="muted">{t('help')}</small>
  </section>;
}
