import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { validateControl } from '../../src/domain/control.ts';
import { validateControl as pocValidation } from '../../poc/manual-controls.mjs';

const resources = Object.fromEntries(['fr', 'en'].map(lang => [lang, { controls: JSON.parse(readFileSync(new URL(`../locales/${lang}/controls.json`, import.meta.url), 'utf8')) }]));
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', defaultNS: 'controls', interpolation: { escapeValue: false } });
const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
after(() => server.close());
const { HeaterControls, QuickControls, MotionControls } = await server.ssrLoadModule('/src/components/controls/index.ts');
const { allowed } = await server.ssrLoadModule('/src/components/controls/shared.tsx');
const controls = {
  status: 'ready', heaters: [{ id: 'nozzle', current: 42, target: 0, max: 245, writable: true }],
  lights: [{ id: 'main', value: null, writable: true }], fans: [{ id: 'part', percent: 40, rpm: null, writable: true }, { id: 'controller_fan', percent: 25, rpm: 1000, writable: false }],
  motion: { homed: 'xyz', position: [0, 100, 100], minimum: [0, 0, 0], maximum: [256, 256, 256], gcode: [0, 100, 100] },
};
const props = { machine: { id: 'test', name: 'Machine', kind: 'elegoo', status: 'ready', nozzle: 42, bed: null }, controls, role: 'admin', busy: false, async onControl() { throw new Error('render must not send commands'); } };
const render = (component, overrides = {}) => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(component, { ...props, ...overrides })));

test('The HTTP and UI parameter validator is one canonical function', () => {
  assert.equal(pocValidation, validateControl);
  for (const value of [-1, 246, 250.5, '200', Infinity, NaN]) assert.equal(validateControl({ action: 'heat', id: 'nozzle', value, confirm: true }, controls), null);
  assert.deepEqual(validateControl({ action: 'heat', id: 'nozzle', value: 245, confirm: true }, controls), { action: 'heat', id: 'nozzle', value: 245 });
  assert.equal(validateControl({ action: 'heat', id: 'nozzle', value: 100 }, controls), null);
  assert.equal(validateControl({ action: 'fan', id: 'controller_fan', value: 50, confirm: true }, controls), null);
});
test('Homing, coordinates, declared axes and exact jog steps gate moves', () => {
  const move = { action: 'move', axis: 'X', distance: -0.1, confirm: true };
  assert.equal(validateControl(move, controls), null, 'refuse travel beyond minimum');
  assert.ok(validateControl({ ...move, distance: 0.1 }, controls));
  for (const distance of [0, 0.2, 100, Infinity]) assert.equal(validateControl({ ...move, distance }, controls), null);
  for (const motion of [{ ...controls.motion, homed: 'xy' }, { ...controls.motion, gcode: undefined }, { ...controls.motion, maximum: [NaN, 256, 256] }, { homed: null, axes: [] }]) assert.equal(validateControl({ ...move, distance: 1 }, { ...controls, motion }), null);
  assert.equal(validateControl({ action: 'home', confirm: true }, { ...controls, motion: { homed: null, home: false } }), null);
});
test('UI additionally requires both current statuses, administrator and an idle unlocked command path', () => {
  const command = { action: 'heat', id: 'nozzle', value: 100 };
  assert.equal(allowed(props, command), true);
  for (const override of [{ role: 'observer' }, { busy: true }, { controls: null }, { machine: { ...props.machine, status: 'offline' } }, { controls: { ...controls, status: 'offline' } }, { controls: { ...controls, status: undefined } }]) assert.equal(allowed({ ...props, ...override }, command), false);
  assert.equal(allowed({ ...props, machine: { ...props.machine, status: 'printing' } }, { action: 'move', axis: 'Y', distance: 1 }), false);
  assert.equal(allowed({ ...props, controls: { ...controls, status: 'paused' } }, { action: 'home' }), false);
});
test('Observer and missing equipment keep measurements without command fields', () => {
  for (const component of [HeaterControls, QuickControls, MotionControls]) {
    const html = render(component, { role: 'observer' });
    assert.doesNotMatch(html, /<input|<select|<form/);
    assert.doesNotMatch(html.replace(/<dialog.*?<\/dialog>/s, ''), /<button/);
  }
  const heater = render(HeaterControls, { role: 'observer' });
  assert.match(heater, /42 °C/); assert.match(heater, /Consigne remontée/);
  assert.doesNotMatch(render(HeaterControls, { controls: null }), /<input|<form/);
  assert.match(render(HeaterControls), /max="245"/);
  assert.match(render(QuickControls), /1000 tr\/min/);
  const motion = render(MotionControls);
  assert.match(motion, /aria-label="Déplacer X de -1 mm" disabled/);
  assert.match(motion, /<dialog[^>]+aria-labelledby/);
  assert.doesNotMatch(motion, /<section/);
});
test('Ray5 retains bounded pulses, operator presence, XY only and native GRBL state gates', () => {
  const laserControls = { ...controls, motion: { homed: null, axes: ['X', 'Y'], home: false }, laser: { writable: true, mode: true, max: 1000, nativeState: 'Idle' } };
  const laserProps = { ...props, controls: laserControls, machine: { ...props.machine, kind: 'longer-ray5' } };
  const pulse = { action: 'laser-pulse', value: 1, duration: 100, operatorPresent: true, confirm: true };
  assert.ok(validateControl(pulse, laserControls));
  for (const change of [{ value: 0 }, { value: 6 }, { duration: 101 }, { operatorPresent: false }]) assert.equal(validateControl({ ...pulse, ...change }, laserControls), null);
  assert.equal(allowed(laserProps, pulse), true);
  assert.equal(allowed({ ...laserProps, controls: { ...laserControls, laser: { ...laserControls.laser, nativeState: 'Run' } } }, pulse), false);
  assert.equal(allowed(laserProps, { action: 'unlock' }), false);
  const quick = render(QuickControls, laserProps);
  assert.match(quick, /max="5"/); assert.match(quick, /type="checkbox"/); assert.match(quick, /Impulsion unique/);
  assert.match(quick, /type="submit" disabled/);
  const motion = render(MotionControls, laserProps);
  assert.doesNotMatch(motion, /Déplacer Z/); assert.match(motion, /Définir zéro XY/); assert.doesNotMatch(motion, /<button[^>]*>Prise d’origine/);
});

test('Ray5 recovery remains available in Alarm/error with fresh states, never to observers or offline machines', () => {
  const alarm = { ...props, machine: { ...props.machine, kind: 'longer-ray5', status: 'error' }, controls: { ...controls, status: 'error', laser: { writable: true, mode: true, max: 1000, nativeState: 'Alarm' } } };
  assert.equal(allowed(alarm, { action: 'unlock' }), true);
  assert.equal(allowed(alarm, { action: 'reset' }), true);
  assert.equal(allowed(alarm, { action: 'move', axis: 'X', distance: 1 }), false);
  assert.equal(allowed(alarm, { action: 'laser-pulse', value: 1, duration: 100, operatorPresent: true }), false);
  for (const change of [{ role: 'observer' }, { busy: true }, { machine: { ...alarm.machine, status: 'offline' } }, { controls: { ...alarm.controls, status: 'offline' } }]) assert.equal(allowed({ ...alarm, ...change }, { action: 'reset' }), false);
  assert.equal(allowed({ ...alarm, controls: { ...alarm.controls, laser: { ...alarm.controls.laser, nativeState: 'Jog' } } }, { action: 'jog-cancel' }), true);
});
