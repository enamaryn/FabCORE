import { useTranslation } from 'react-i18next';
import type { TemperatureSample } from '../../temperature.ts';
export function TemperatureChart({ samples }: { samples: TemperatureSample[] }) {
  const { t, i18n } = useTranslation('machine');
  if (!samples.length) return <p className="muted">{t('waitingTemperatures')}</p>;
  const end = samples.at(-1)!.at, start = Math.min(samples[0]!.at, end - 10000);
  const values = samples.flatMap(p => [p.nozzle, p.bed].filter((n): n is number => n !== null && Number.isFinite(n)));
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const step = [10, 20, 25, 50, 100].find(s => max - min <= s * 6) ?? Math.ceil((max - min) / 600) * 100;
  const low = Math.floor(min / step) * step, high = Math.max(low + 3 * step, Math.ceil(max / step) * step);
  const x = (at: number) => 38 + (at - start) / (end - start) * 388;
  const y = (n: number) => 122 - (n - low) / (high - low) * 108;
  const time = (at: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' }).format(at);
  let gaps = false;
  const lines = (['nozzle', 'bed'] as const).map(key => {
    let previous: TemperatureSample | undefined, path = '', dashed = '';
    const point = (p: TemperatureSample) => `${x(p.at).toFixed(2)},${y(p[key]!).toFixed(2)}`;
    for (const p of samples) {
      if (p[key] === null) continue;
      if (previous && p.at - previous.at > 25000) { gaps = true; dashed += `M${point(previous)}L${point(p)}`; path += `M${point(p)}`; }
      else path += (previous ? 'L' : 'M') + point(p);
      previous = p;
    }
    const color = key === 'nozzle' ? '#ea8a42' : '#4aa9d6', latest = samples.at(-1)!;
    return <g key={key} stroke={color} fill="none"><path d={dashed} strokeDasharray="3 4" opacity=".55" /><path d={path} strokeWidth="2" />{latest[key] !== null && <circle cx={x(latest.at)} cy={y(latest[key]!)} r="3" fill={color} />}</g>;
  });
  return <><svg viewBox="0 0 438 146" role="img" aria-label={t('temperatureHistory')} width="100%">
    {Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, i) => { const n = low + i * step; return <g key={n}><line x1="38" x2="426" y1={y(n)} y2={y(n)} stroke="currentColor" opacity=".14" /><text x="30" y={y(n) + 3} textAnchor="end" fill="currentColor" fontSize="10">{n}°</text></g>; })}{lines}
    <text x="38" y="141" fill="currentColor" fontSize="10">{time(start)}</text><text x="426" y="141" textAnchor="end" fill="currentColor" fontSize="10">{time(end)}</text>
  </svg>{gaps && <small>{t('temperatureGaps')}</small>}</>;
}
