import { useTranslation } from 'react-i18next';
import type { MachineData } from '../types.js';
const classes: Record<string, string> = { printing: 'info', ready: 'good', done: 'good', error: 'bad', offline: 'neutral', paused: 'warn', connecting: 'info' };
export function StatusBadge({ status }: { status: MachineData['status'] }) {
  const { t } = useTranslation('fleet');
  return <span className={'badge ' + (classes[status] ?? 'neutral')}>{t('status.' + status)}</span>;
}
