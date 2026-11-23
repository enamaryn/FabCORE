// Illustrations des modules multi-filaments, dessinées pour FabCore (aucune image constructeur) :
// AmsUnit pour Bambu Lab (bac à quatre bobines vues de face), CanvasUnit pour Elegoo CC1/CC2 (boîtier à quatre
// bobines rondes aux coins). Données uniquement remontées par la machine ; inconnu affiché comme tel.
import { useId } from 'react';
import type { FilamentSlot } from '../../types.ts';

export type SlotText = { empty: string; unknown: string; active: string };
const hex = (value: unknown): string | null => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
/** Texte lisible sur la couleur de la bobine. */
function ink(color: string | null) {
  if (!color) return '#fff';
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.6 ? '#1a1a1a' : '#fff';
}
const shade = (color: string, amount: number) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(color.slice(i, i + 2), 16) * amount))).toString(16).padStart(2, '0')).join('');
const describe = (slot: FilamentSlot | undefined, name: string, text: SlotText) => !slot || slot.occupied === false ? `${name} : ${text.empty}` : `${name} : ${slot.material || text.unknown}, ${hex(slot.color) ?? text.unknown}${slot.active ? ', ' + text.active : ''}`;

/** Bac AMS : matières au-dessus, quatre bobines en cylindres, vitre basse, humidité à droite. */
export function AmsUnit({ slots, letter, humidity, text }: { slots: FilamentSlot[]; letter: string; humidity: number | null; text: SlotText }) {
  const id = useId().replace(/:/g, '');
  const bySlot = (index: number) => slots.find(slot => slot.id === index);
  const label = [0, 1, 2, 3].map(index => describe(bySlot(index), letter + (index + 1), text)).join(' · ') + (humidity !== null ? ` · ${humidity} %` : '');
  return <svg className="filament-art ams-art" viewBox="0 0 420 250" role="img" aria-label={label}>
    <defs>
      <linearGradient id={id + 'tray'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b6f73" /><stop offset="1" stopColor="#3c3f42" /></linearGradient>
      <linearGradient id={id + 'glass'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9dde0" stopOpacity=".35" /><stop offset="1" stopColor="#9ea3a7" stopOpacity=".55" /></linearGradient>
      <linearGradient id={id + 'shine'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".3" stopColor="#fff" stopOpacity=".22" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".4" /></linearGradient>
    </defs>
    {/* Bac et couvercle */}
    <path d="M24 92 Q24 66 50 66 H318 Q344 66 344 92 V214 H24 Z" fill={`url(#${id}tray)`} />
    <path d="M30 92 Q30 72 52 72 H316 Q338 72 338 92" fill="none" stroke="#9aa0a4" strokeWidth="3" />
    {[0, 1, 2, 3].map(index => {
      const slot = bySlot(index), x = 40 + index * 74, color = hex(slot?.color), empty = !slot || slot.occupied === false, active = slot?.active === true && !empty;
      const material = empty ? text.empty : slot?.material || '?';
      const body = color ?? '#7d8286';
      // Bobine vue de biais : flasque arrière, enroulement en cylindre, tranche du filament, flasque avant et moyeu.
      return <g key={index}>
        <text x={x + 30} y="22" textAnchor="middle" className="art-material">{material}</text>
        <rect x={x + 8} y="30" width="44" height="7" rx="3.5" fill={empty ? 'none' : '#e8eaec'} stroke={empty ? '#8a8f93' : 'none'} strokeDasharray={empty ? '3 3' : undefined} />
        <line x1={x + 30} y1="40" x2={x + 30} y2="80" stroke="#c4c8cb" strokeWidth="2" strokeDasharray="3 4" />
        {active && <rect x={x - 6} y="76" width="72" height="140" rx="14" fill="none" stroke="var(--accent)" strokeWidth="3" />}
        <ellipse cx={x + 10} cy="146" rx="12" ry="62" fill="#5d6164" />
        <ellipse cx={x + 10} cy="146" rx="8" ry="54" fill="#4a4e51" />
        {/* Enroulement : cylindre aux extrémités elliptiques, ombré et strié dans sa propre forme. */}
        <clipPath id={id + 'wind' + index}><path d={`M${x + 10} 94 H${x + 50} A9 52 0 0 1 ${x + 50} 198 H${x + 10} A9 52 0 0 1 ${x + 10} 94 Z`} /></clipPath>
        {empty ? <path d={`M${x + 10} 94 H${x + 50} A9 52 0 0 1 ${x + 50} 198 H${x + 10} A9 52 0 0 1 ${x + 10} 94 Z`} fill="none" stroke="#9aa0a4" strokeWidth="2" strokeDasharray="6 5" /> : <>
          <g clipPath={`url(#${id}wind${index})`}>
            <rect x={x} y="90" width="62" height="112" fill={body} />
            {color && Array.from({ length: 17 }, (_, line) => <path key={line} d={`M${x} ${97 + line * 6} Q${x + 30} ${95 + line * 6} ${x + 62} ${97 + line * 6}`} fill="none" stroke={shade(color, 0.8)} strokeWidth="1.2" opacity=".6" />)}
            <rect x={x} y="90" width="62" height="112" fill={`url(#${id}shine)`} />
            <ellipse cx={x + 30} cy="108" rx="22" ry="6" fill="#fff" opacity=".18" />
          </g>
          {!color && <text x={x + 30} y="132" textAnchor="middle" className="art-unknown">?</text>}
          {/* Tranche du filament côté avant, légèrement plus sombre. */}
          <ellipse cx={x + 50} cy="146" rx="9" ry="52" fill={shade(body, 0.7)} />
          <ellipse cx={x + 50} cy="146" rx="6" ry="36" fill={shade(body, 0.6)} />
        </>}
        <ellipse cx={x + 52} cy="146" rx="13" ry="62" fill="#a3a8ac" />
        <ellipse cx={x + 52} cy="146" rx="9" ry="50" fill="#bfc3c6" />
        <ellipse cx={x + 52} cy="146" rx="4.5" ry="15" fill="#5d6164" />
        <text x={x + 27} y="186" textAnchor="middle" className="art-slot" fill={empty ? '#c4c8cb' : ink(color)}>{letter}{index + 1}</text>
      </g>;
    })}
    {/* Vitre basse du bac */}
    <path d="M16 158 H352 V222 Q352 228 346 228 H22 Q16 228 16 222 Z" fill={`url(#${id}glass)`} stroke="#c4c8cb" strokeOpacity=".6" />
    {/* Humidité */}
    {humidity !== null && <g>
      <rect x="360" y="92" width="52" height="96" rx="26" fill="#2b2e31" stroke="#6b6f73" />
      <path d="M386 104 C380 113 375 119 375 125 a11 11 0 0 0 22 0 c0-6-5-12-11-21Z" fill="none" stroke="#e8eaec" strokeWidth="2.5" />
      <path d={`M375.5 ${127 - Math.min(10, humidity / 10)} h21 a10.5 10.5 0 0 1 -21 0Z`} fill="#4fb3ff" />
      <text x="386" y="164" textAnchor="middle" className="art-humidity">{humidity}%</text>
    </g>}
  </svg>;
}

/** Boîtier CANVAS : quatre bobines rondes aux coins (1 haut gauche, 2 bas gauche, 3 bas droite, 4 haut droite), répartiteur en haut. */
export function CanvasUnit({ slots, humidity, text }: { slots: FilamentSlot[]; humidity: number | null; text: SlotText }) {
  const bySlot = (index: number) => slots.find(slot => slot.id === index);
  const spots = [{ x: 104, y: 128, badge: 40 }, { x: 104, y: 238, badge: 40 }, { x: 216, y: 238, badge: 280 }, { x: 216, y: 128, badge: 280 }];
  const label = spots.map((_, index) => describe(bySlot(index), String(index + 1), text)).join(' · ') + (humidity !== null ? ` · ${humidity} %` : '');
  return <svg className="filament-art canvas-art" viewBox="0 0 320 300" role="img" aria-label={label}>
    {/* Boîtier et répartiteur à quatre entrées */}
    <rect x="62" y="70" width="196" height="222" rx="10" fill="#c9ccce" stroke="#e3e5e6" strokeWidth="2" />
    <rect x="70" y="78" width="180" height="206" rx="6" fill="#b5b9bc" />
    {spots.map((spot, index) => <path key={'tube' + index} d={`M${130 + index * 20} 46 C${130 + index * 20} 70 ${spot.x + (index < 2 ? 22 : -22)} ${spot.y - 70} ${spot.x} ${spot.y - 46}`} fill="none" stroke="#eef0f1" strokeWidth="4" />)}
    <rect x="112" y="18" width="96" height="34" rx="8" fill="#2a2c2e" stroke="#5c6064" />
    {spots.map((_, index) => {
      const slot = bySlot(index), loaded = slot && slot.occupied !== false;
      return <circle key={'led' + index} cx={130 + index * 20} cy="35" r="6.5" fill={slot?.active ? 'var(--accent)' : loaded ? '#8fd14f' : '#55595d'} stroke="#1a1a1a" />;
    })}
    {spots.map((spot, index) => {
      const slot = bySlot(index), color = hex(slot?.color), empty = !slot || slot.occupied === false, active = slot?.active === true && !empty;
      return <g key={index}>
        {active && <circle cx={spot.x} cy={spot.y} r="53" fill="none" stroke="var(--accent)" strokeWidth="4" />}
        {empty ? <circle cx={spot.x} cy={spot.y} r="46" fill="#9ea3a7" fillOpacity=".25" stroke="#e8eaec" strokeWidth="2.5" strokeDasharray="7 6" /> : <>
          <circle cx={spot.x} cy={spot.y} r="46" fill={color ?? '#7d8286'} stroke="#f2f3f4" strokeWidth="3" />
          <circle cx={spot.x} cy={spot.y} r="38" fill="none" stroke="#000" strokeOpacity=".12" strokeWidth="4" />
          <circle cx={spot.x} cy={spot.y - 6} r="15" fill="#e9ebec" />
          {!color && <text x={spot.x} y={spot.y - 1} textAnchor="middle" className="art-unknown">?</text>}
        </>}
        <text x={spot.x} y={spot.y + 32} textAnchor="middle" className="art-material" style={{ fill: empty ? '#f2f3f4' : ink(color) }}>{empty ? text.empty : slot?.material || '?'}</text>
        <circle cx={spot.badge} cy={spot.y} r="15" fill="#3a3d40" stroke="#6b6f73" />
        <text x={spot.badge} y={spot.y + 6} textAnchor="middle" className="art-badge">{index + 1}</text>
      </g>;
    })}
    {humidity !== null && <text x="160" y="296" textAnchor="middle" className="art-humidity-small">{humidity} %</text>}
  </svg>;
}
