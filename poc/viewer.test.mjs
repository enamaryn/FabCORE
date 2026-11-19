import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseGcode, layerOfSegment } from './gcode.mjs';

const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');

test('lecture locale : interpolation, pause, reprise et fin sans accès à la machine', () => {
  const result = parseGcode('M83\nG1 X60 Z1 E1\nG1 X120 E1\n');
  const gcode = { result, cursor: null, playing: false, follow: true, speed: 1, frame: null };
  const elements = new Map();
  let frame, cancelled = 0;
  const sandbox = { gcode, live: { page: 'viewer' }, t: fr => fr, layerOfSegment,
    app: { querySelector: selector => { if (!elements.has(selector)) elements.set(selector, {}); return elements.get(selector); } },
    requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame: () => cancelled++,
    viewerStatus: () => 'Simulation locale', setGcodeLayer: layer => { gcode.layer = layer; } };
  const code = source.slice(source.indexOf('function pauseGcode()'), source.indexOf('function drawGcode()'));
  runInNewContext(code + '\nthis.play=playGcode;this.pause=pauseGcode;', sandbox);
  sandbox.play(); frame(0); frame(100);
  assert.ok(gcode.cursor > 0.09 && gcode.cursor < 0.11, 'position interpolée dans le premier segment');
  assert.equal(gcode.follow, false);
  sandbox.pause(); const paused = gcode.cursor; assert.equal(gcode.playing, false); assert.equal(cancelled, 1);
  sandbox.play(); frame(1000); assert.equal(gcode.cursor, paused, 'la pause ne compte pas dans le parcours');
  gcode.speed = 100; frame(1100); assert.equal(gcode.cursor, 2); assert.equal(gcode.playing, false);
  sandbox.play(); assert.equal(gcode.cursor, 0, 'relecture après la fin');
  sandbox.live.page = 'detail'; frame(1200); assert.equal(gcode.playing, false, 'arrêt à la sortie');
});

test('projection 3D : hauteur, rotation et retour 2D ; cadrage dans la hauteur disponible', () => {
  const gcode = { mode: '3d', yaw: 0, pitch: 0 };
  const workspace = { style: {}, getBoundingClientRect: () => ({ top: 150 }) };
  const sandbox = { gcode, window: { innerHeight: 900 }, app: { querySelector: s => s === '[data-gcode-workspace]' ? workspace : null }, drawGcode: () => {} };
  const project = source.slice(source.indexOf('function projectGcode('), source.indexOf('function pauseGcode('));
  const size = source.slice(source.indexOf('function sizeGcode('), source.indexOf('function mountGcode('));
  runInNewContext(project + size + '\nthis.project=projectGcode;this.size=sizeGcode;', sandbox);
  assert.deepEqual([...sandbox.project(10, 20, 3)], [10, 3]);
  gcode.yaw = Math.PI / 2; assert.ok(Math.abs(sandbox.project(10, 20, 3)[0] + 20) < 0.001);
  gcode.mode = '2d'; assert.deepEqual([...sandbox.project(10, 20, 3)], [10, 20]);
  sandbox.size(); assert.equal(workspace.style.height, '738px');
  sandbox.window.innerHeight = 600; sandbox.size(); assert.equal(workspace.style.height, '438px');
});
