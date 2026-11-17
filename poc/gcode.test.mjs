import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGcodeParser, parseGcode, EXTRUDE, TRAVEL } from './gcode.mjs';

const segmentsOf = (result, index) => {
  const { start, end } = result.layers[index];
  return Array.from({ length: end - start }, (_, offset) => {
    const at = start + offset;
    return [...result.segments.subarray(at * 4, at * 4 + 4)].map(value => Math.round(value * 1000) / 1000).concat(result.types[at]);
  });
};

test('le G-code PrusaSlicer (E relatif) est découpé par couche avec extrusions et déplacements', () => {
  const result = parseGcode([
    'G90', 'M83', 'G28 ; origine', 'G1 Z0.2 F600', 'G1 X10 Y10 F9000',
    'G1 X20 Y10 E0.5', 'G1 X20 Y20 E0.5', 'G1 E-0.8 ; rétraction', 'G1 Z0.6', 'G1 X30 Y30', 'G1 Z0.4',
    'G1 E0.8', 'G1 X40 Y30 E0.4'
  ].join('\n'));
  assert.equal(result.layers.length, 2);
  assert.deepEqual(result.layers.map(({ z }) => z), [0.2, 0.4]);
  assert.deepEqual(segmentsOf(result, 0), [[0, 0, 10, 10, TRAVEL], [10, 10, 20, 10, EXTRUDE], [20, 10, 20, 20, EXTRUDE], [20, 20, 30, 30, TRAVEL]]);
  assert.deepEqual(segmentsOf(result, 1), [[30, 30, 40, 30, EXTRUDE]]);
  assert.deepEqual(result.bounds, { minX: 10, minY: 10, maxX: 40, maxY: 30 });
  assert.deepEqual(result.unsupported, []);
});

test('le G-code Cura (E absolu, G0, G92 E0) gère les remises à zéro et ignore les rétractions', () => {
  const result = parseGcode([
    ';FLAVOR:Marlin', 'M82', 'G92 E0', ';LAYER:0', 'G0 F6000 X5 Y5 Z0.3',
    'G1 F1500 X15 Y5 E1', 'G1 X15 Y15 E2', 'G1 F2700 E-4.5', 'G92 E0', ';LAYER:1', 'G0 X5 Y5 Z0.5',
    'G1 F2700 E0', 'G1 X15 Y5 E1'
  ].join('\r\n'));
  assert.deepEqual(result.layers.map(({ z }) => z), [0.3, 0.5]);
  assert.deepEqual(segmentsOf(result, 0).map(segment => segment.at(-1)), [TRAVEL, EXTRUDE, EXTRUDE]);
  assert.deepEqual(segmentsOf(result, 1), [[15, 15, 5, 5, TRAVEL], [5, 5, 15, 5, EXTRUDE]]);
});

test('le mode relatif G91, les pouces G20 et la syntaxe compacte sont pris en compte', () => {
  const result = parseGcode(['N1 G21*12', 'G1Z0.2', 'G91', 'G1 X10 Y0 E1', 'G1 X0 Y10 E1', 'G90', 'G20', 'G1 X1 Y1 E3 (fin)'].join('\n'));
  assert.deepEqual(segmentsOf(result, 0), [[0, 0, 10, 0, EXTRUDE], [10, 0, 10, 10, EXTRUDE], [10, 10, 25.4, 25.4, EXTRUDE]]);
});

test('les arcs G2/G3 sont découpés et les trajectoires non prises en charge sont signalées', () => {
  const result = parseGcode(['G1 Z0.2', 'G1 X10 Y0', 'M83', 'G3 X-10 Y0 I-10 J0 E2', 'G2 X10 Y0 R10 E1', 'G5 X1 Y1 I1 J1 P1 Q1 E1', 'G5 X2 Y2 E1'].join('\n'));
  const arc = segmentsOf(result, 0).filter(segment => segment[4] === EXTRUDE);
  assert.ok(arc.length >= 30);
  assert.ok(arc.every(([, , x, y]) => Math.abs(Math.hypot(x, y) - 10) < 0.01));
  assert.ok(arc.every(([, , , y]) => y >= -0.001), 'G3 tourne dans le sens antihoraire par le haut');
  assert.deepEqual(result.unsupported, [{ command: 'G2', count: 1, line: 5 }, { command: 'G5', count: 2, line: 6 }]);
});

test('le lecteur incrémental donne le même résultat quel que soit le découpage du fichier', () => {
  const text = Array.from({ length: 200 }, (_, index) => `G1 Z${(Math.floor(index / 20) + 1) * 0.2} X${index % 7} Y${index % 5} E${index}`).join('\n');
  const parser = createGcodeParser();
  for (let at = 0; at < text.length; at += 13) parser.write(text.slice(at, at + 13));
  const chunked = parser.finish();
  const whole = parseGcode(text);
  assert.equal(chunked.layers.length, 10);
  assert.deepEqual(chunked.layers, whole.layers);
  assert.deepEqual([...chunked.segments], [...whole.segments]);
  assert.equal(whole.lines, 200);
});

test('la position dans le fichier (octets) donne les segments imprimés et la couche en cours', async () => {
  const { printedSegments, layerOfSegment } = await import('./gcode.mjs');
  const lines = ['; é accentué', 'M83', 'G1 Z0.2', 'G1 X10 E1', 'G1 X20 E1', 'G1 Z0.4', 'G1 X10 E1'];
  const text = lines.join('\n');
  const result = parseGcode(text);
  const at = (index) => Buffer.byteLength(lines.slice(0, index).join('\n') + '\n');
  assert.deepEqual([...result.offsets], [at(3), at(4), at(6)]);
  assert.equal(printedSegments(result, 0), 0);
  assert.equal(printedSegments(result, at(4)), 1, 'la ligne 5 n’est pas encore lue');
  assert.equal(printedSegments(result, at(5)), 2);
  assert.equal(printedSegments(result, Buffer.byteLength(text)), 3);
  assert.deepEqual([0, 1, 2].map(index => layerOfSegment(result, index)), [0, 0, 1]);
});
