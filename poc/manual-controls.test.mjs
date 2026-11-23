import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualControls, validateControl, reportedControls } from './manual-controls.mjs';

const machine = { origin: 'http://192.168.1.40:7125', apiKey: 'test-key' };
const objects = { extruder: { temperature: 23, target: 0 }, heater_bed: { temperature: 21, target: 0 },
  configfile: { settings: { extruder: { max_temp: 250 }, heater_bed: { max_temp: 120 } } },
  'neopixel chamber': { color_data: [[0, 0, 0, 0]] }, fan: { speed: 0.5, rpm: 1200 }, 'fan_generic aux': { speed: 0.2 },
  toolhead: { homed_axes: 'xyz', position: [10, 20, 30], axis_minimum: [0, 0, 0], axis_maximum: [200, 200, 200] },
  gcode_move: { gcode_position: [11, 21, 31] } };

test('contrôles Klipper : objets présents, plafond firmware, couleurs, ventilateurs et déplacement borné', async () => {
  const sent = [];
  const control = createManualControls('klipper', { fetcher: async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.headers['X-Api-Key'], 'test-key');
    if (url.endsWith('/list')) return Response.json({ result: { objects: Object.keys(objects) } });
    if (url.endsWith('/query')) return Response.json({ result: { status: objects } });
    sent.push(JSON.parse(options.body).script); return Response.json({ result: 'ok' });
  } });
  const state = await control.read(machine);
  assert.equal(state.heaters[0].max, 249); assert.equal(state.heaters[1].max, 100);
  assert.equal(state.lights[0].value, false); assert.equal(state.fans[0].percent, 50);
  const move = { action: 'move', axis: 'X', distance: 10, confirm: true };
  await control.execute(machine, validateControl(move, state), state);
  assert.match(sent.at(-1), /SAVE_GCODE_STATE.*\nG90\nG1 X21 F600\nRESTORE_GCODE_STATE/s);
  assert.equal(validateControl({ ...move, distance: 1000 }, state), null);
  assert.equal(validateControl(move, { ...state, motion: { ...state.motion, homed: 'xy' } }), null);
  assert.equal(validateControl(move, { ...state, motion: { ...state.motion, position: [199, 0, 0] } }), null);
  assert.equal(validateControl({ action: 'heat', id: 'nozzle', value: 250, confirm: true }, state), null);
  assert.equal(validateControl({ action: 'light', id: 'x\nM112', value: true, confirm: true }, state), null);
  await control.execute(machine, validateControl({ action: 'light', id: 'chamber', value: true, confirm: true }, state), state);
  assert.equal(sent.at(-1), 'SET_LED LED=chamber RED=1 GREEN=1 BLUE=1 WHITE=1');
  await control.execute(machine, validateControl({ action: 'fan', id: 'fan_generic aux', value: 25, confirm: true }, state), state);
  assert.equal(sent.at(-1), 'SET_FAN_SPEED FAN=aux SPEED=0.25');
});

test('Bambu : état rapporté distinct de la commande, lumière système et G-code borné', async () => {
  const state = reportedControls('bambu', { nozzle_temper: 25, nozzle_target_temper: 0, cooling_fan_speed: '15', lights_report: [{ node: 'chamber_light', mode: 'off' }] });
  const calls = [];
  const control = createManualControls('bambu', { read: () => state, wait: async () => { state.heaters[0].target = 240; }, send: async (...args) => { calls.push(args); return true; } });
  await control.execute(machine, validateControl({ action: 'light', id: 'chamber_light', value: true, confirm: true }, state), state);
  assert.equal(calls[0][1], 'ledctrl'); assert.equal(calls[0][3], 'system');
  assert.equal(state.lights[0].value, false, 'pas de mise à jour optimiste');
  await control.execute(machine, validateControl({ action: 'heat', id: 'nozzle', value: 240, confirm: true }, state), state);
  assert.deepEqual(calls.at(-1)[2], { param: 'M104 S240\n' });
  await control.execute(machine, validateControl({ action: 'fan', id: 'part', value: 50, confirm: true }, state), state);
  assert.deepEqual(calls.at(-1)[2], { param: 'M106 P1 S128\n' });
  assert.equal(state.fans[0].percent, 100);
  assert.equal(validateControl({ action: 'move', axis: 'X', distance: 1, confirm: true }, state), null);
});

test('OctoPrint : consignes et jog natifs sans inventer éclairage ou retour ventilateur', async () => {
  const sent = [];
  const control = createManualControls('octoprint', { fetcher: async (url, options) => {
    if (options.method === 'GET') return Response.json({ temperature: { tool0: { actual: 20, target: 0 }, bed: { actual: 18, target: 0 } } });
    sent.push([url, JSON.parse(options.body)]); return new Response(null, { status: 204 });
  } });
  const state = await control.read(machine);
  assert.deepEqual(state.lights, []); assert.deepEqual(state.fans, []);
  await control.execute(machine, validateControl({ action: 'heat', id: 'bed', value: 60, confirm: true }, state), state);
  assert.deepEqual(sent.at(-1), [machine.origin + '/api/printer/bed', { command: 'target', target: 60 }]);
  await control.execute(machine, validateControl({ action: 'move', axis: 'Z', distance: -0.1, confirm: true }, state), state);
  assert.deepEqual(sent.at(-1)[1], { command: 'jog', z: -0.1, absolute: false, speed: 120 });
});

test('CC2 : chauffe, éclairage et ventilateurs pilotables au repos ou en impression, PWM 0–255 converti', () => {
  const state = reportedControls('elegoo', { machine_status: { status: 1 }, led: { status: 1 }, extruder: { temperature: 25, target: 200 },
    fans: { fan: { speed: 102, rpm: 1234 }, aux_fan: { speed: 0 }, box_fan: { speed: 255 }, heater_fan: { speed: 255, rpm: 9000 }, controller_fan: { speed: 300 } } });
  assert.equal(state.lights[0].value, true); assert.equal(state.lights[0].writable, true);
  assert.equal(state.heaters[0].target, 200);
  assert.deepEqual(state.fans.map(({ id, percent, writable }) => [id, percent, writable]), [
    ['fan', 40, true], ['aux_fan', 0, true], ['box_fan', 100, true], ['heater_fan', 100, false], ['controller_fan', null, false],
  ], 'tête et électronique en lecture seule ; vitesse hors plage inconnue');
  assert.equal(state.fans[0].rpm, 1234);
  assert.equal(validateControl({ action: 'heat', id: 'nozzle', value: 200, confirm: true }, state).value, 200);
  assert.deepEqual(validateControl({ action: 'light', id: 'main', value: false, confirm: true }, state), { action: 'light', id: 'main', value: false });
  assert.deepEqual(validateControl({ action: 'fan', id: 'box_fan', value: 50, confirm: true }, state), { action: 'fan', id: 'box_fan', value: 50 });
  assert.equal(validateControl({ action: 'fan', id: 'heater_fan', value: 50, confirm: true }, state), null);
  const busy = reportedControls('elegoo', { machine_status: { status: 4 }, led: { status: 0 }, fans: { fan: { speed: 0 } } });
  assert.equal(busy.lights[0].writable, false); assert.equal(busy.fans[0].writable, false, 'autre état machine : lecture seule');
});

test('CC2 : éclairage 1029 et ventilateur 1030 confirmés par l’état relu, sinon inconnus sans renvoi', async () => {
  const machine = { id: 'cc2' };
  let led = 1, box = 0;
  const sent = [];
  const read = () => reportedControls('elegoo', { machine_status: { status: 1 }, led: { status: led }, fans: { box_fan: { speed: box }, heater_fan: { speed: 255 } } });
  const control = createManualControls('elegoo', { read, request: async (_machine, method, params) => { sent.push([method, params]); return true; },
    wait: async () => {}, confirmationAttempts: 3 });
  const state = read();
  await assert.rejects(control.execute(machine, { action: 'light', id: 'main', value: false }, state), /command-unconfirmed/, 'accusé sans état relu : inconnu');
  assert.deepEqual(sent, [[1029, { power: 0 }]], 'une seule émission');
  led = 0;
  assert.deepEqual(await control.execute(machine, { action: 'light', id: 'main', value: false }, state), { outcome: 'confirmed' });
  box = 128;
  assert.deepEqual(await control.execute(machine, { action: 'fan', id: 'box_fan', value: 50 }, state), { outcome: 'confirmed' }, '128/255 ≈ 50 %');
  assert.deepEqual(sent.at(-1), [1030, { box_fan: 128 }], 'un seul canal, valeur PWM');
  const before = sent.length;
  assert.deepEqual(await control.execute(machine, { action: 'fan', id: 'heater_fan', value: 50 }, state), { outcome: 'rejected' });
  assert.equal(sent.length, before, 'ventilateur en lecture seule : rien n’est envoyé');
  const refused = createManualControls('elegoo', { read, request: async () => false, wait: async () => {}, confirmationAttempts: 3 });
  assert.deepEqual(await refused.execute(machine, { action: 'light', id: 'main', value: true }, state), { outcome: 'rejected' });
});

test('Bambu : un accusé sans consigne confirmée échoue, sans renvoi de commande', async () => {
  const state = reportedControls('bambu', { nozzle_target_temper: 0, bed_target_temper: 0 });
  for (const id of ['nozzle', 'bed']) {
    let sends = 0;
    const control = createManualControls('bambu', { read: () => state, send: async () => { sends++; return true; }, wait: async () => {}, confirmationAttempts: 3 });
    await assert.rejects(control.execute(machine, { action: 'heat', id, value: id === 'nozzle' ? 200 : 60 }, state), /heater-unconfirmed/);
    assert.equal(sends, 1);
    assert.equal(state.heaters.find(item => item.id === id).target, 0);
  }
});

test('Bambu : consigne reçue en différé confirmée, température atteinte non présumée', async () => {
  for (const [id, value] of [['nozzle', 200], ['bed', 60], ['bed', 0]]) {
    let target = value === 0 ? 60 : 0, reads = 0, sends = 0;
    const control = createManualControls('bambu', { read: () => reportedControls('bambu', { nozzle_temper: 22, bed_temper: 21, [id === 'nozzle' ? 'nozzle_target_temper' : 'bed_target_temper']: target }),
      send: async () => { sends++; return true; }, wait: async () => { if (++reads === 2) target = value; }, confirmationAttempts: 3 });
    assert.deepEqual(await control.execute(machine, { action: 'heat', id, value }, {}), { outcome: 'confirmed' });
    assert.equal(sends, 1); assert.equal(reads, 2);
    assert.equal((await control.read(machine)).heaters[0].current, 22);
  }
});

test('Bambu : format de température compact, zéro valide et valeurs invalides ignorées', () => {
  const controls = reportedControls('bambu', { nozzle_temper: 10, nozzle_target_temper: 1, device: {
    extruder: { info: [{ id: 0, temp: (220 << 16) + 23 }] }, bed: { info: { temp: (60 << 16) + 21 } } } });
  assert.deepEqual(controls.heaters.map(({ current, target }) => [current, target]), [[23, 220], [21, 60]]);
  assert.equal(reportedControls('bambu', { device: { bed: { info: { temp: 0 } } } }).heaters[1].target, 0);
  for (const temp of [null, -1, 0xffffffff, '12', true, 0x100000000, 2.5]) {
    assert.equal(reportedControls('bambu', { bed_target_temper: 55, device: { bed: { info: { temp } } } }).heaters[1].target, 55);
  }
});

test('CC2 : chauffe native isolée par élément et arrêt à zéro, confirmation par retour réel', async () => {
  for (const [id, value] of [['nozzle', 200], ['bed', 60], ['nozzle', 0], ['bed', 0]]) {
    const state = reportedControls('elegoo', { machine_status: { status: 1 }, extruder: { temperature: 22, target: 100 }, heater_bed: { temperature: 20, target: 40 } });
    const sent = []; let polls = 0;
    const control = createManualControls('elegoo', { read: () => state, request: async (...args) => { sent.push(args); return true; },
      wait: async () => { if (++polls === 2) state.heaters.find(item => item.id === id).target = value; }, confirmationAttempts: 3 });
    const result = await control.execute(machine, validateControl({ action: 'heat', id, value, confirm: true }, state), state);
    assert.deepEqual(result, { outcome: 'confirmed' });
    assert.deepEqual(sent, [[machine, 1028, { [id === 'nozzle' ? 'extruder' : 'heater_bed']: value }]]);
    assert.equal(state.heaters.find(item => item.id !== id).target, id === 'nozzle' ? 40 : 100);
    assert.equal(state.heaters[0].current, 22); assert.equal(polls, 2);
  }
});

test('CC2 : refus, accusé sans consigne et perte de réponse sans renvoi', async () => {
  const state = reportedControls('elegoo', { machine_status: { status: 1 }, extruder: { temperature: 22, target: 0 } });
  const command = { action: 'heat', id: 'nozzle', value: 200 };
  for (const outcome of ['refused', 'no-echo', 'timeout']) {
    let sends = 0;
    const control = createManualControls('elegoo', { read: () => state, request: async () => { sends++; if (outcome === 'timeout') throw new Error('command-unconfirmed'); return outcome !== 'refused'; }, wait: async () => {}, confirmationAttempts: 2 });
    if (outcome === 'refused') assert.deepEqual(await control.execute(machine, command, state), { outcome: 'rejected' });
    else await assert.rejects(control.execute(machine, command, state), outcome === 'no-echo' ? /heater-unconfirmed/ : /command-unconfirmed/);
    assert.equal(sends, 1); assert.equal(state.heaters[0].target, 0);
  }
});

test('CC2 : limites conservées, calibration/chargement et contrôles non implémentés bloqués', async () => {
  const report = { machine_status: { status: 1 }, extruder: { target: 0 }, heater_bed: { target: 0 } };
  const state = reportedControls('elegoo', report);
  for (const [id, value] of [['nozzle', 261], ['bed', 101], ['bed', -1], ['bed', 40.5], ['other', 20]]) {
    assert.equal(validateControl({ action: 'heat', id, value, confirm: true }, state), null);
  }
  for (const status of [0, 3, 4, 5, 6, 10, 13, undefined]) {
    const controls = reportedControls('elegoo', { ...report, machine_status: { status } });
    assert.equal(validateControl({ action: 'heat', id: 'bed', value: 60, confirm: true }, controls), null);
  }
  let sends = 0;
  const control = createManualControls('elegoo', { request: async () => { sends++; return true; } });
  assert.deepEqual(await control.execute(machine, { action: 'light', id: 'main', value: true }, state), { outcome: 'rejected' });
  assert.equal(sends, 0);
});

test('CC2 : mise à l’origine 1026 puis déplacements 1027 bornés, confirmés par la position relue', async () => {
  const machine = { id: 'cc2' };
  let report = { machine_status: { status: 1 }, gcode_move: { x: 100, y: 264, z: 50 }, tool_head: { homed_axes: '' } };
  const sent = [];
  const read = () => reportedControls('elegoo', report);
  let state = read();
  assert.deepEqual(state.motion, { homed: '', position: [100, 264, 50], gcode: [100, 264, 50], minimum: [0, 0, 0], maximum: [256, 264, 256], home: true }, 'limite haute = position garée hors volume');
  assert.equal(validateControl({ action: 'move', axis: 'Z', distance: 10, confirm: true }, state), null, 'aucun déplacement avant mise à l’origine');
  const control = createManualControls('elegoo', { read, wait: async () => {}, confirmationAttempts: 3,
    request: async (_machine, method, params) => { sent.push([method, params]); if (method === 1026) report = { ...report, tool_head: { homed_axes: 'xyz' } }; if (method === 1027) report = { ...report, gcode_move: { ...report.gcode_move, [params.axes]: report.gcode_move[params.axes] + params.distance } }; return true; } });
  assert.deepEqual(await control.execute(machine, { action: 'home' }, state), { outcome: 'confirmed' });
  assert.deepEqual(sent[0], [1026, { homed_axes: 'xyz' }]);
  state = read();
  assert.deepEqual(await control.execute(machine, { action: 'move', axis: 'Z', distance: 10 }, state), { outcome: 'confirmed' });
  assert.deepEqual(sent[1], [1027, { axes: 'z', distance: 10 }]);
  state = read();
  assert.equal(validateControl({ action: 'move', axis: 'Y', distance: 1, confirm: true }, state), null, 'jamais au-delà d’une position déjà relue');
  assert.equal(validateControl({ action: 'move', axis: 'X', distance: 10, confirm: true }, reportedControls('elegoo', { ...report, gcode_move: { x: 250, y: 10, z: 5 } })), null, 'hors volume refusé');
  assert.equal(reportedControls('elegoo', { ...report, machine_status: { status: 2 } }).motion.home, false, 'pas de mise à l’origine en fabrication');
  const stuck = createManualControls('elegoo', { read: () => state, request: async (_m, method, params) => { sent.push([method, params]); return true; }, wait: async () => {}, confirmationAttempts: 3 });
  const before = sent.length;
  await assert.rejects(stuck.execute(machine, { action: 'move', axis: 'X', distance: 1 }, state), /command-unconfirmed/, 'position inchangée : inconnu');
  assert.equal(sent.length, before + 1, 'aucun renvoi');
  const refused = createManualControls('elegoo', { read, request: async () => false, wait: async () => {}, confirmationAttempts: 3 });
  assert.deepEqual(await refused.execute(machine, { action: 'move', axis: 'X', distance: 1 }, state), { outcome: 'rejected' }, 'error_code 1003 : refus');
});

test('CC1 : chauffe, éclairage et ventilateurs par Cmd 403, formes exactes, confirmés par le rapport SDCP', async () => {
  const machine = { id: 'cc1' };
  let report = { PrintInfo: { Status: 0 }, TempOfNozzle: 25.4, TempTargetNozzle: 0, TempOfHotbed: [0, 22.1], TempTargetHotbed: 0, CurrentFanSpeed: { ModelFan: 0, AuxiliaryFan: 0, BoxFan: 40 }, LightStatus: { SecondLight: 1, RgbLight: [0, 0, 0] } };
  const state = reportedControls('elegoo-cc1', report);
  assert.deepEqual(state.heaters.map(({ id, current, target, writable }) => [id, current, target, writable]), [['nozzle', 25.4, 0, true], ['bed', 22.1, 0, true]], 'nombre ou paire [consigne, mesure]');
  assert.deepEqual(state.lights, [{ id: 'main', value: true, writable: true }]);
  assert.deepEqual(state.fans.map(({ id, percent }) => [id, percent]), [['fan', 0], ['aux_fan', 0], ['box_fan', 40]]);
  assert.equal(reportedControls('elegoo-cc1', { ...report, PrintInfo: { Status: 1 } }).fans[0].writable, false, 'mise à l’origine en cours : lecture seule');
  const sent = [], pauses = [];
  const apply = (params) => {
    if (params.TempTargetNozzle !== undefined) report = { ...report, TempTargetNozzle: params.TempTargetNozzle };
    if (params.LightStatus) report = { ...report, LightStatus: { ...report.LightStatus, ...params.LightStatus } };
    if (params.TargetFanSpeed) report = { ...report, CurrentFanSpeed: { ...report.CurrentFanSpeed, ...params.TargetFanSpeed } };
  };
  const control = createManualControls('elegoo-cc1', { read: () => reportedControls('elegoo-cc1', report), wait: async ms => { pauses.push(ms); },
    request: async (_machine, command, params) => { sent.push([command, params]); apply(params); return true; } });
  assert.deepEqual(await control.execute(machine, { action: 'heat', id: 'nozzle', value: 200 }, state), { outcome: 'confirmed' });
  assert.deepEqual(await control.execute(machine, { action: 'light', id: 'main', value: false }, state), { outcome: 'confirmed' });
  assert.deepEqual(await control.execute(machine, { action: 'fan', id: 'box_fan', value: 70 }, state), { outcome: 'confirmed' });
  assert.deepEqual(sent, [[403, { TempTargetNozzle: 200 }], [403, { LightStatus: { SecondLight: 0 } }], [403, { TargetFanSpeed: { BoxFan: 70 } }]]);
  assert.ok(pauses.every(ms => ms === 1000), 'une relecture SDCP par seconde');
  const silent = createManualControls('elegoo-cc1', { read: () => reportedControls('elegoo-cc1', report), wait: async () => {},
    request: async (_machine, command, params) => { sent.push([command, params]); return true; } });
  const before = sent.length;
  let reads = 0;
  const counted = createManualControls('elegoo-cc1', { read: () => { reads++; return reportedControls('elegoo-cc1', report); }, wait: async () => {}, request: async () => true });
  await assert.rejects(counted.execute(machine, { action: 'fan', id: 'fan', value: 50 }, state), /command-unconfirmed/);
  assert.equal(reads, 6, 'six relectures au plus');
  await assert.rejects(silent.execute(machine, { action: 'light', id: 'main', value: true }, state), /command-unconfirmed/);
  assert.equal(sent.length, before + 1, 'aucun renvoi');
});

test('P2S : origine G28 depuis FabCore exigée avant tout déplacement, issues acceptées seulement', async () => {
  const machine = { id: 'p2s' };
  let online = true;
  const sent = [];
  const read = () => online ? reportedControls('bambu', { nozzle_temper: 25, bed_temper: 22, gcode_state: 'IDLE' }) : undefined;
  const control = createManualControls('bambu', { read, send: async (_machine, command, params) => { sent.push([command, params.param]); return true; } });
  let state = await control.read(machine);
  assert.deepEqual(state.motion, { homed: null, axes: [], fabcoreHoming: true });
  assert.deepEqual(await control.execute(machine, { action: 'move', axis: 'Z', distance: 10 }, state), { outcome: 'rejected' }, 'aucun déplacement avant origine');
  assert.equal(sent.length, 0);
  assert.deepEqual(await control.execute(machine, { action: 'home' }, state), { outcome: 'accepted' });
  state = await control.read(machine);
  assert.deepEqual(state.motion.axes, ['X', 'Y', 'Z']);
  assert.deepEqual(await control.execute(machine, { action: 'move', axis: 'Z', distance: 10 }, state), { outcome: 'accepted' }, 'jamais « confirmé » : aucune position relue');
  assert.deepEqual(await control.execute(machine, { action: 'move', axis: 'X', distance: -1 }, state), { outcome: 'accepted' });
  assert.deepEqual(sent, [['gcode_line', 'G28\n'], ['gcode_line', 'G91\nG1 Z10 F600\nG90\n'], ['gcode_line', 'G91\nG1 X-1 F3000\nG90\n']]);
  control.forgetHoming(machine.id);
  assert.deepEqual((await control.read(machine)).motion.axes, [], 'terminal utilisé : origine oubliée');
  await control.execute(machine, { action: 'home' }, state);
  online = false; await control.read(machine); online = true;
  assert.deepEqual((await control.read(machine)).motion.axes, [], 'rapport perdu : origine oubliée');
});

test('CC2 : mode de vitesse 1031 seulement en impression, confirmé par gcode_move.speed_mode, sinon inconnu sans renvoi', async () => {
  const machine = { id: 'cc2' };
  const report = (status, mode) => ({ machine_status: { status }, gcode_move: { x: 1, y: 2, z: 3, speed_mode: mode } });
  assert.deepEqual(reportedControls('elegoo', report(1, 1)).speed, { mode: 1, writable: false }, 'au repos : la méthode répond 1010');
  assert.equal(reportedControls('elegoo', report(2, 7)).speed, undefined, 'mode inconnu ignoré');
  let state = reportedControls('elegoo', report(2, 1));
  assert.equal(validateControl({ action: 'speed', value: 4, confirm: true }, state), null);
  assert.equal(validateControl({ action: 'speed', value: 2, confirm: true }, reportedControls('elegoo', report(1, 1))), null);
  assert.deepEqual(validateControl({ action: 'speed', value: 2, confirm: true }, state), { action: 'speed', value: 2 });
  const sent = [];
  const control = createManualControls('elegoo', { read: () => state, request: async (_machine, method, params) => { sent.push([method, params]); state = reportedControls('elegoo', report(2, params.mode)); return true; }, wait: async () => {}, confirmationAttempts: 3 });
  assert.deepEqual(await control.execute(machine, { action: 'speed', value: 2 }, state), { outcome: 'confirmed' });
  assert.deepEqual(sent, [[1031, { mode: 2 }]]);
  const stuck = createManualControls('elegoo', { read: () => reportedControls('elegoo', report(2, 1)), request: async (_machine, method, params) => { sent.push([method, params]); return true; }, wait: async () => {}, confirmationAttempts: 3 });
  await assert.rejects(stuck.execute(machine, { action: 'speed', value: 3 }, state), /command-unconfirmed/);
  assert.equal(sent.length, 2, 'aucun renvoi');
});
