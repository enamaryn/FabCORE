// Analyse locale d’un fichier G-code pour le visualiseur par couches.
// Le module ne communique avec aucune machine : il lit un texte et produit des segments XY regroupés par couche.

export const TRAVEL = 0;
export const EXTRUDE = 1;

const EPSILON = 1e-4;
const ARC_STEP = 1; // longueur maximale d’un segment d’arc, en millimètres
const IGNORED_G = new Set([4, 10, 11, 17, 29, 80, 94]);
const UNSUPPORTED_G = new Set([5, 6, 12, 18, 19, 42, 53]);

const WORD = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

function words(code) {
  const values = {};
  WORD.lastIndex = 0;
  let match;
  while ((match = WORD.exec(code))) {
    if (!(match[1] in values)) values[match[1]] = Number(match[2]);
  }
  return values;
}

export function createGcodeParser() {
  let segments = new Float32Array(4096 * 4);
  let types = new Uint8Array(4096);
  let offsets = new Float64Array(4096);
  let count = 0;
  let lineOffset = 0;
  let byteOffset = 0;
  const layers = [];
  const unsupported = new Map();
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const travelBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const position = { X: 0, Y: 0, Z: 0, E: 0 };
  let absolute = true;
  let absoluteE = true;
  let scale = 1;
  let plane = 17;
  let lineNumber = 0;
  let commands = 0;
  let zChangedAt = 0;
  let layer = null;

  const flag = (command) => {
    const entry = unsupported.get(command) ?? { count: 0, line: lineNumber };
    entry.count++;
    unsupported.set(command, entry);
  };

  const grow = (area, x, y) => {
    if (x < area.minX) area.minX = x;
    if (x > area.maxX) area.maxX = x;
    if (y < area.minY) area.minY = y;
    if (y > area.maxY) area.maxY = y;
  };

  const push = (x0, y0, x1, y1, type) => {
    if (count === types.length) {
      const nextSegments = new Float32Array(segments.length * 2);
      nextSegments.set(segments);
      segments = nextSegments;
      const nextTypes = new Uint8Array(types.length * 2);
      nextTypes.set(types);
      types = nextTypes;
      const nextOffsets = new Float64Array(offsets.length * 2);
      nextOffsets.set(offsets);
      offsets = nextOffsets;
    }
    offsets[count] = lineOffset;
    const at = count * 4;
    segments[at] = x0;
    segments[at + 1] = y0;
    segments[at + 2] = x1;
    segments[at + 3] = y1;
    types[count] = type;
    count++;
    const area = type === EXTRUDE ? bounds : travelBounds;
    grow(area, x0, y0);
    grow(area, x1, y1);
  };

  const target = (values, axis) => {
    if (!(axis in values)) return position[axis];
    const value = values[axis] * scale;
    return absolute ? value : position[axis] + value;
  };

  const extrusion = (values) => {
    if (!('E' in values)) return 0;
    const value = values.E * scale;
    return absoluteE ? value - position.E : value;
  };

  const startLayer = () => {
    if (layer && Math.abs(layer.z - position.Z) < EPSILON) return;
    if (layer) layer.end = zChangedAt;
    layer = { z: Math.round(position.Z * 1000) / 1000, start: layer ? zChangedAt : 0, end: count, extrusions: 0 };
    layers.push(layer);
  };

  // Ajoute un tracé (ligne ou arc déjà découpé) en attribuant les extrusions à la couche de leur hauteur.
  const draw = (points, delta) => {
    const type = delta > EPSILON ? EXTRUDE : TRAVEL;
    if (type === EXTRUDE) startLayer();
    let [x0, y0] = [position.X, position.Y];
    for (const [x1, y1] of points) {
      if (Math.abs(x1 - x0) > EPSILON || Math.abs(y1 - y0) > EPSILON) push(x0, y0, x1, y1, type);
      [x0, y0] = [x1, y1];
    }
    if (type === EXTRUDE) layer.extrusions += points.length;
  };

  const move = (values) => {
    const x = target(values, 'X');
    const y = target(values, 'Y');
    const z = target(values, 'Z');
    const delta = extrusion(values);
    if (Math.abs(z - position.Z) > EPSILON) {
      position.Z = z;
      zChangedAt = count;
    }
    draw([[x, y]], delta);
    position.X = x;
    position.Y = y;
    position.E += delta;
  };

  const arc = (values, clockwise, command) => {
    if (plane !== 17 || !('I' in values || 'J' in values) || 'R' in values) return flag(command);
    const x = target(values, 'X');
    const y = target(values, 'Y');
    const z = target(values, 'Z');
    const cx = position.X + (values.I ?? 0) * scale;
    const cy = position.Y + (values.J ?? 0) * scale;
    const radius = Math.hypot(position.X - cx, position.Y - cy);
    let start = Math.atan2(position.Y - cy, position.X - cx);
    let end = Math.atan2(y - cy, x - cx);
    let sweep = end - start;
    if (clockwise && sweep >= -EPSILON) sweep -= 2 * Math.PI;
    if (!clockwise && sweep <= EPSILON) sweep += 2 * Math.PI;
    const steps = Math.max(1, Math.min(720, Math.ceil(Math.abs(sweep) * radius / ARC_STEP)));
    const points = [];
    for (let step = 1; step < steps; step++) {
      const angle = start + sweep * step / steps;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    points.push([x, y]);
    const delta = extrusion(values);
    if (Math.abs(z - position.Z) > EPSILON) {
      position.Z = z;
      zChangedAt = count;
    }
    draw(points, delta);
    position.X = x;
    position.Y = y;
    position.E += delta;
  };

  // Position en octets de chaque ligne : Klipper et OctoPrint donnent l’avancement de l’impression dans cette unité.
  const encoder = new TextEncoder();
  const line = (text) => {
    lineNumber++;
    lineOffset = byteOffset;
    byteOffset += (/[^\x00-\x7f]/.test(text) ? encoder.encode(text).length : text.length) + 1;
    let code = text;
    const comment = code.indexOf(';');
    if (comment !== -1) code = code.slice(0, comment);
    if (code.includes('(')) code = code.replace(/\([^)]*\)/g, '');
    code = code.trim().toUpperCase();
    if (!code) return;
    if (code[0] === 'N') code = code.replace(/^N\d+\s*/, '');
    if (code.includes('*')) code = code.replace(/\*\d+$/, '');
    const head = code.match(/^([GM])\s*(\d+)(?:\.(\d+))?/);
    if (!head) return;
    commands++;
    const number = Number(head[2]);
    const name = head[1] + number;
    const values = words(code.slice(head[0].length));
    if (head[1] === 'M') {
      if (number === 82) absoluteE = true;
      if (number === 83) absoluteE = false;
      return;
    }
    if (number === 0 || number === 1) return move(values);
    if (number === 2 || number === 3) return arc(values, number === 2, name);
    if (number === 90) { absolute = true; absoluteE = true; return; }
    if (number === 91) { absolute = false; absoluteE = false; return; }
    if (number === 20) { scale = 25.4; return; }
    if (number === 21) { scale = 1; return; }
    if (number === 92) {
      const axes = Object.keys(values).filter(axis => axis in position);
      for (const axis of axes.length ? axes : Object.keys(position)) position[axis] = (values[axis] ?? 0) * scale;
      if (!axes.length || axes.includes('Z')) zChangedAt = count;
      return;
    }
    if (number === 28) {
      const axes = ['X', 'Y', 'Z'].filter(axis => axis in values);
      for (const axis of axes.length ? axes : ['X', 'Y', 'Z']) position[axis] = 0;
      zChangedAt = count;
      return;
    }
    if (number === 17) { plane = 17; return; }
    if (number === 18 || number === 19) plane = number;
    if (IGNORED_G.has(number)) return;
    if (UNSUPPORTED_G.has(number)) flag(name);
  };

  // Accepte un morceau de texte quelconque : les lignes coupées entre deux morceaux sont recollées.
  let rest = '';
  const write = (chunk) => {
    const text = rest + chunk;
    let start = 0;
    let index;
    while ((index = text.indexOf('\n', start)) !== -1) {
      line(text.slice(start, index));
      start = index + 1;
    }
    rest = text.slice(start);
  };

  const finish = () => {
    if (rest) line(rest);
    rest = '';
    if (layer) layer.end = count;
    const area = bounds.minX <= bounds.maxX ? bounds : travelBounds;
    return {
      segments: segments.subarray(0, count * 4),
      types: types.subarray(0, count),
      offsets: offsets.subarray(0, count),
      layers: layers.map(({ z, start, end, extrusions }) => ({ z, start, end, extrusions })),
      bounds: area.minX <= area.maxX ? { ...area } : null,
      unsupported: [...unsupported].map(([command, { count, line }]) => ({ command, count, line })),
      lines: lineNumber,
      commands
    };
  };

  return { write, finish };
}

export function parseGcode(text) {
  const parser = createGcodeParser();
  parser.write(text);
  return parser.finish();
}

// Nombre de segments déjà lus par la machine pour une position donnée dans le fichier.
export function printedSegments(result, filePosition) {
  const { offsets } = result;
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < filePosition) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Couche qui contient un segment donné.
export function layerOfSegment(result, index) {
  const { layers } = result;
  let low = 0;
  let high = layers.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (layers[middle].start <= index) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, low);
}
