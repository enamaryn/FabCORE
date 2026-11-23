// Rendu du visualiseur G-code (MIG-06.2.2), repris du POC : fonctions pures, sans état global ni DOM implicite.
// Aucun ordre machine : lecture d'un fichier et dessin local.
import type { GcodeResult } from '../../../poc/gcode.mjs';

export type Camera = { mode: '2d' | '3d'; yaw: number; pitch: number };
export type View = { scale: number; x: number; y: number };
export type Palette = { dim: string; accent: string; travel: string; marker: string; text: string };
export type DrawState = { layer: number; previous: boolean; travel: boolean; cursor: number | null; printed: number | null };

export const initialCamera = (): Camera => ({ mode: '2d', yaw: -0.6, pitch: 0.65 });

export function project(camera: Camera, x: number, y: number, z: number): [number, number] {
  if (camera.mode !== '3d') return [x, y];
  const side = x * Math.cos(camera.yaw) - y * Math.sin(camera.yaw);
  const depth = x * Math.sin(camera.yaw) + y * Math.cos(camera.yaw);
  return [side, depth * Math.sin(camera.pitch) + z * Math.cos(camera.pitch)];
}

/** Cadrage qui montre tout le fichier (boîte projetée en 3D), marge de 24 px. */
export function fit(result: GcodeResult, camera: Camera, width: number, height: number): View {
  let bounds = result.bounds;
  if (bounds && camera.mode === '3d') {
    let minZ = 0, maxZ = 0;
    for (const z of result.heights) { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const points: [number, number][] = [];
    for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [minZ, maxZ]) points.push(project(camera, x, y, z));
    bounds = { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])) };
  }
  if (!bounds) return { scale: 1, x: width / 2, y: height / 2 };
  const margin = 24;
  const scale = Math.max(0.01, Math.min((width - margin * 2) / Math.max(bounds.maxX - bounds.minX, 1), (height - margin * 2) / Math.max(bounds.maxY - bounds.minY, 1)));
  return { scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale, y: height / 2 + (bounds.minY + bounds.maxY) / 2 * scale };
}

/** Zoom centré sur un point de l'écran, borné. */
export function zoom(view: View, factor: number, x: number, y: number): View {
  const scale = Math.min(Math.max(view.scale * factor, 0.05), 2000);
  return { scale, x: x - (x - view.x) * scale / view.scale, y: y - (y - view.y) * scale / view.scale };
}

/** Rotation 3D en conservant zoom et déplacement relatifs au cadrage. */
export function orbit(result: GcodeResult, camera: Camera, view: View, dx: number, dy: number, width: number, height: number): { camera: Camera; view: View } {
  const fitted = fit(result, camera, width, height);
  const factor = view.scale / fitted.scale;
  const panX = view.x - (width / 2 + (fitted.x - width / 2) * factor);
  const panY = view.y - (height / 2 + (fitted.y - height / 2) * factor);
  const next = { ...camera, yaw: camera.yaw + dx * 0.01, pitch: Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.01)) };
  const refit = fit(result, next, width, height);
  return { camera: next, view: { scale: refit.scale * factor, x: width / 2 + (refit.x - width / 2) * factor + panX, y: height / 2 + (refit.y - height / 2) * factor + panY } };
}

/** Avance la simulation locale : 60 mm/s × vitesse, pas de temps borné à 100 ms. Renvoie le nouveau curseur. */
export function advance(result: GcodeResult, cursor: number, seconds: number, speed: number): number {
  const { segments, heights, types } = result;
  let distance = Math.min(seconds, 0.1) * 60 * speed;
  while (distance > 0 && cursor < types.length) {
    const i = Math.floor(cursor), at = i * 4;
    const length = Math.max(0.001, Math.hypot(segments[at + 2]! - segments[at]!, segments[at + 3]! - segments[at + 1]!, heights[i * 2 + 1]! - heights[i * 2]!));
    const remaining = (1 - (cursor - i)) * length;
    if (distance >= remaining) { cursor = i + 1; distance -= remaining; }
    else { cursor += distance / length; distance = 0; }
  }
  return cursor;
}

/** Dessine la couche choisie : déjà fait, reste à faire, déplacements à vide, couche précédente et repère d'outil. */
export function draw(context: CanvasRenderingContext2D, result: GcodeResult, camera: Camera, view: View, state: DrawState, palette: Palette, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  const current = result.layers[state.layer];
  if (!current) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const { segments, types, heights } = result;
  const point = (index: number, end = false, fraction = end ? 1 : 0): [number, number] => {
    const at = index * 4;
    const [x, y] = project(camera, segments[at]! + (segments[at + 2]! - segments[at]!) * fraction, segments[at + 1]! + (segments[at + 3]! - segments[at + 1]!) * fraction, heights[index * 2]! + (heights[index * 2 + 1]! - heights[index * 2]!) * fraction);
    return [view.x + x * view.scale, view.y - y * view.scale];
  };
  const stroke = (from: number, to: number, type: number, style: string, lineWidth: number, alpha: number) => {
    if (from >= to) return;
    context.beginPath();
    for (let index = from; index < to; index++) {
      if (types[index] !== type) continue;
      context.moveTo(...point(index));
      context.lineTo(...point(index, true));
    }
    context.globalAlpha = alpha;
    context.strokeStyle = style;
    context.lineWidth = lineWidth;
    context.stroke();
  };
  const below = result.layers[state.layer - 1];
  const position = state.cursor ?? state.printed;
  const done = position != null ? Math.min(Math.max(Math.floor(position), current.start), current.end) : current.end;
  if (state.previous && below) stroke(camera.mode === '3d' ? 0 : below.start, below.end, 1, palette.dim, 1.5, 0.3);
  stroke(done, current.end, 1, palette.dim, 1.6, 0.55);
  stroke(current.start, done, 1, palette.accent, 1.8, 1);
  if (state.travel) stroke(current.start, done, 0, palette.travel, 1, 0.7);
  if (position != null && types.length) {
    const index = Math.min(types.length - 1, Math.max(0, Math.floor(position)));
    const fraction = position >= types.length ? 1 : position - index;
    const marker = point(index, true, fraction);
    if (state.cursor != null && index >= current.start && index < current.end) {
      context.beginPath(); context.moveTo(...point(index)); context.lineTo(...marker);
      context.strokeStyle = types[index] ? palette.accent : palette.travel; context.globalAlpha = 1; context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = palette.marker;
    context.beginPath(); context.arc(...marker, 6, 0, Math.PI * 2); context.fill();
    context.strokeStyle = palette.text; context.lineWidth = 1; context.stroke();
  }
  context.globalAlpha = 1;
}
