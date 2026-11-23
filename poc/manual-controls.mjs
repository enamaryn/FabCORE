import { moonrakerOrigin, readResponse } from './connector-http.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const numeric = value => Number.isFinite(value) ? value : null;
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null;
const safeName = name => /^[A-Za-z0-9_]+$/.test(name);
export const emptyControls = () => ({ lights: [], heaters: [], fans: [], motion: null });
const heater = (id, current, target, max, writable = true) => ({ id, current: numeric(current), target: numeric(target), max, writable });
function packedTemperature(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  const current = value & 0xffff, target = value >>> 16;
  return current <= 500 && target <= 500 ? { current, target } : null;
}

// Values below are software ceilings, not a substitute for firmware limits.
export function reportedControls(kind, report) {
  const out = emptyControls();
  if (kind === 'bambu') {
    const nozzle = packedTemperature(report.device?.extruder?.info?.find?.(item => item.id === 0)?.temp);
    const bed = packedTemperature(report.device?.bed?.info?.temp);
    out.heaters = [heater('nozzle', nozzle?.current ?? report.nozzle_temper, nozzle?.target ?? report.nozzle_target_temper, 260), heater('bed', bed?.current ?? report.bed_temper, bed?.target ?? report.bed_target_temper, 100)];
    const light = report.lights_report?.find(item => item.node === 'chamber_light');
    if (light) out.lights.push({ id: 'chamber_light', value: light.mode === 'on' ? true : light.mode === 'off' ? false : null, writable: true });
    for (const [id, key] of [['part', 'cooling_fan_speed'], ['aux', 'big_fan1_speed'], ['chamber', 'big_fan2_speed']]) {
      if (id === 'aux' && report.aux_part_fan === false) continue;
      const raw = report[key];
      if ((typeof raw === 'string' && /^\d{1,2}$/.test(raw)) || Number.isFinite(raw)) {
        const level = Number(raw);
        if (level >= 0 && level <= 15) out.fans.push({ id, percent: Math.round(level / 15 * 100), rpm: null, writable: true });
      }
    }
  } else if (kind === 'elegoo') {
    // Commandes acceptées seulement au repos (1) ou en fabrication (2, pause comprise), comme la chauffe.
    const canControl = [1, 2].includes(report.machine_status?.status);
    if (report.extruder) out.heaters.push(heater('nozzle', report.extruder.temperature, report.extruder.target, 260, canControl));
    if (report.heater_bed) out.heaters.push(heater('bed', report.heater_bed.temperature, report.heater_bed.target, 100, canControl));
    if ([0, 1].includes(report.led?.status)) out.lights.push({ id: 'main', value: report.led.status === 1, writable: canControl });
    // CC2 : vitesse PWM 0–255 ; seuls pièce, auxiliaire et caisson sont pilotables (méthode 1030).
    for (const [id, fan] of Object.entries(report.fans ?? {})) if (['fan', 'aux_fan', 'box_fan', 'heater_fan', 'controller_fan'].includes(id)) {
      const pwm = Number.isFinite(fan?.speed) && fan.speed >= 0 && fan.speed <= 255 ? fan.speed : null;
      out.fans.push({ id, percent: pwm === null ? null : Math.round(pwm / 255 * 100), rpm: numeric(fan?.rpm), writable: canControl && ['fan', 'aux_fan', 'box_fan'].includes(id) });
    }
    // Déplacements : position relue, axes à l'origine exigés ; limites = volume 256 mm, jamais au-delà
    // d'une position déjà relue (la tête se gare hors volume), le firmware gardant ses propres butées.
    const position = ['x', 'y', 'z'].map(axis => numeric(report.gcode_move?.[axis]));
    if (position.every(Number.isFinite)) {
      const homed = typeof report.tool_head?.homed_axes === 'string' ? report.tool_head.homed_axes.toLowerCase() : '';
      out.motion = { homed, position, gcode: position, minimum: [0, 0, 0], maximum: position.map(value => Math.max(256, value)), home: report.machine_status?.status === 1 };
    }
  }
  return out;
}

export function validateControl(data, controls) {
  if (data?.confirm !== true) return null;
  if (data.action === 'light' && typeof data.value === 'boolean' && controls.lights.some(item => item.id === data.id && item.writable)) return { action: 'light', id: data.id, value: data.value };
  if (data.action === 'heat' && Number.isInteger(data.value)) {
    const item = controls.heaters.find(item => item.id === data.id && item.writable);
    if (item && data.value >= 0 && data.value <= item.max) return { action: 'heat', id: data.id, value: data.value };
  }
  if (data.action === 'fan' && Number.isInteger(data.value) && data.value >= 0 && data.value <= 100 && controls.fans.some(item => item.id === data.id && item.writable)) return { action: 'fan', id: data.id, value: data.value };
  if (controls.laser?.writable) {
    if (['laser-off','zero','unlock','reset','jog-cancel'].includes(data.action)) return { action: data.action };
    if (data.action === 'laser-pulse' && data.operatorPresent === true && controls.laser.mode && controls.laser.max > 0 && Number.isInteger(data.value) && data.value >= 1 && data.value <= 5 && [100,250,500].includes(data.duration)) return { action: data.action, value: data.value, duration: data.duration, operatorPresent: true };
  }
  if (data.action === 'home' && controls.motion && controls.motion.home !== false) return { action: 'home' };
  if (data.action === 'move' && controls.motion && ['X', 'Y', 'Z'].includes(data.axis) && [0.1, 1, 10].includes(Math.abs(data.distance))) {
    const motion = controls.motion;
    if (motion.axes && !motion.axes.includes(data.axis)) return null;
    const index = ['X', 'Y', 'Z'].indexOf(data.axis);
    if (motion.homed !== null) {
      if (!['x', 'y', 'z'].every(axis => motion.homed?.includes(axis))) return null;
      if (![motion.position?.[index], motion.minimum?.[index], motion.maximum?.[index], motion.gcode?.[index]].every(Number.isFinite)) return null;
      const next = motion.position[index] + data.distance;
      if (next < motion.minimum[index] || next > motion.maximum[index]) return null;
    }
    return { action: 'move', axis: data.axis, distance: data.distance };
  }
  return null;
}

export function createManualControls(kind, { fetcher = fetch, send, request, read, wait = delay, confirmationAttempts = 25, trace } = {}) {
  async function confirmHeat(machine, id, value) {
    // An acknowledgement alone does not prove the setpoint changed.
    for (let attempt = 0; attempt < confirmationAttempts; attempt++) {
      await wait(200);
      const reported = await snapshot(machine);
      const actual = reported.heaters.find(item => item.id === id)?.target;
      if (attempt === 0 || attempt === confirmationAttempts - 1 || actual === value) trace?.(machine.id, 'heater-confirmation', { id, expected: value, actual, attempt, confirmed: actual === value });
      if (actual === value) return { outcome: 'confirmed' };
    }
    throw new Error('heater-unconfirmed');
  }
  async function confirmReported(machine, control, id, value, matches) {
    for (let attempt = 0; attempt < confirmationAttempts; attempt++) {
      await wait(200);
      const confirmed = matches(await snapshot(machine));
      if (attempt === 0 || attempt === confirmationAttempts - 1 || confirmed) trace?.(machine.id, 'control-confirmation', { control, id, expected: value, attempt, confirmed });
      if (confirmed) return { outcome: 'confirmed' };
    }
    throw new Error('command-unconfirmed');
  }
  async function call(machine, path, body) {
    if (moonrakerOrigin(machine.origin) !== machine.origin) throw new Error('invalid-machine');
    const response = await fetcher(machine.origin + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { ...(machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status >= 500 ? 'command-unconfirmed' : 'command-rejected'); }
    return response.status === 204 ? null : readResponse(response);
  }
  async function snapshot(machine) {
    if (kind === 'bambu' || kind.startsWith('elegoo')) return await read?.(machine) ?? emptyControls();
    if (kind === 'octoprint') {
      const data = await call(machine, '/api/printer');
      const out = emptyControls();
      if (data?.temperature?.tool0) out.heaters.push(heater('nozzle', data.temperature.tool0.actual, data.temperature.tool0.target, 260));
      if (data?.temperature?.bed) out.heaters.push(heater('bed', data.temperature.bed.actual, data.temperature.bed.target, 100));
      out.motion = { homed: null }; // OctoPrint delegates homing/soft limits to the firmware.
      return out;
    }
    const objects = (await call(machine, '/printer/objects/list'))?.result?.objects ?? [];
    const names = objects.filter(name => ['extruder', 'heater_bed', 'fan', 'toolhead', 'gcode_move', 'configfile'].includes(name) || /^(led|neopixel|dotstar|pca9533|pca9632|fan_generic) [A-Za-z0-9_]+$/.test(name));
    const data = (await call(machine, '/printer/objects/query', { objects: Object.fromEntries(names.map(name => [name, null])) }))?.result?.status ?? {};
    const out = emptyControls();
    for (const [id, name, ceiling] of [['nozzle', 'extruder', 260], ['bed', 'heater_bed', 100]]) if (data[name]) {
      const max = data.configfile?.settings?.[name]?.max_temp;
      out.heaters.push(heater(id, data[name].temperature, data[name].target, Number.isFinite(max) ? Math.max(0, Math.min(ceiling, Math.floor(max - 1))) : ceiling));
    }
    for (const name of names) {
      if (/^(led|neopixel|dotstar|pca9533|pca9632) /.test(name) && data[name]) {
        const colors = data[name].color_data;
        out.lights.push({ id: name.split(' ')[1], value: Array.isArray(colors) ? colors.some(c => c.some(n => n > 0)) : null, writable: true });
      }
      if ((name === 'fan' || name.startsWith('fan_generic ')) && data[name]) out.fans.push({ id: name === 'fan' ? 'part' : name, percent: percent(Number.isFinite(data[name].speed) ? data[name].speed * 100 : null), rpm: numeric(data[name].rpm), writable: true });
    }
    if (data.toolhead && data.gcode_move) out.motion = { homed: data.toolhead.homed_axes ?? '', position: data.toolhead.position, minimum: data.toolhead.axis_minimum, maximum: data.toolhead.axis_maximum, gcode: data.gcode_move.gcode_position };
    return out;
  }
  return { read: snapshot, async execute(machine, command, controls) {
    const { action, id, value } = command;
    if (kind === 'bambu') {
      const ok = action === 'light' ? await send(machine, 'ledctrl', { led_node: 'chamber_light', led_mode: value ? 'on' : 'off', led_on_time: 500, led_off_time: 500, loop_times: 1, interval_time: 1000 }, 'system')
        : await send(machine, 'gcode_line', { param: action === 'heat' ? `${id === 'nozzle' ? 'M104' : 'M140'} S${value}\n` : `M106 P${{ part: 1, aux: 2, chamber: 3 }[id]} S${Math.round(value / 100 * 255)}\n` });
      if (ok && action === 'heat') return confirmHeat(machine, id, value);
      return { outcome: ok ? 'accepted' : 'rejected' };
    }
    if (kind === 'elegoo') {
      if (!['heat', 'light', 'fan', 'home', 'move'].includes(action) || !validateControl({ ...command, confirm: true }, controls)) return { outcome: 'rejected' };
      if (action === 'heat') {
        const ok = await request(machine, 1028, { [id === 'nozzle' ? 'extruder' : 'heater_bed']: value });
        return ok ? confirmHeat(machine, id, value) : { outcome: 'rejected' };
      }
      // Un seul champ par commande ; l'accusé (`error_code: 0`) ne suffit pas, l'état relu doit correspondre.
      if (action === 'light') {
        const ok = await request(machine, 1029, { power: value ? 1 : 0 });
        return ok ? confirmReported(machine, 'light', id, value, reported => reported.lights.find(item => item.id === id)?.value === value) : { outcome: 'rejected' };
      }
      if (action === 'home') {
        const ok = await request(machine, 1026, { homed_axes: 'xyz' });
        return ok ? confirmReported(machine, 'home', 'xyz', 'xyz', reported => ['x', 'y', 'z'].every(axis => reported.motion?.homed?.includes(axis))) : { outcome: 'rejected' };
      }
      if (action === 'move') {
        const index = ['X', 'Y', 'Z'].indexOf(command.axis);
        const target = controls.motion.position[index] + command.distance;
        const ok = await request(machine, 1027, { axes: command.axis.toLowerCase(), distance: command.distance });
        return ok ? confirmReported(machine, 'move', command.axis, target, reported => Math.abs((reported.motion?.position?.[index] ?? NaN) - target) <= 0.05) : { outcome: 'rejected' };
      }
      const pwm = Math.round(value / 100 * 255);
      const ok = await request(machine, 1030, { [id]: pwm });
      // Tolérance d'un point : la conversion 0–100 ↔ 0–255 arrondit.
      return ok ? confirmReported(machine, 'fan', id, value, reported => {
        const actual = reported.fans.find(item => item.id === id)?.percent;
        return Number.isFinite(actual) && Math.abs(actual - value) <= 1;
      }) : { outcome: 'rejected' };
    }
    if (kind === 'octoprint') {
      if (action === 'heat') await call(machine, id === 'nozzle' ? '/api/printer/tool' : '/api/printer/bed', id === 'nozzle' ? { command: 'target', targets: { tool0: value } } : { command: 'target', target: value });
      else await call(machine, '/api/printer/printhead', action === 'home' ? { command: 'home', axes: ['x', 'y', 'z'] } : { command: 'jog', [command.axis.toLowerCase()]: command.distance, absolute: false, speed: command.axis === 'Z' ? 120 : 600 });
      return { outcome: 'accepted' };
    }
    let script;
    if (action === 'heat') script = `SET_HEATER_TEMPERATURE HEATER=${id === 'nozzle' ? 'extruder' : 'heater_bed'} TARGET=${value}`;
    if (action === 'light' && safeName(id)) script = `SET_LED LED=${id} RED=${+value} GREEN=${+value} BLUE=${+value} WHITE=${+value}`;
    if (action === 'fan') script = id === 'part' ? `M106 S${Math.round(value / 100 * 255)}` : id.startsWith('fan_generic ') && safeName(id.slice(12)) ? `SET_FAN_SPEED FAN=${id.slice(12)} SPEED=${value / 100}` : null;
    if (action === 'home') script = 'G28';
    if (action === 'move') {
      const index = ['X', 'Y', 'Z'].indexOf(command.axis);
      const target = Number((controls.motion.gcode[index] + command.distance).toFixed(4));
      script = `SAVE_GCODE_STATE NAME=FABCORE_CONTROL\nG90\nG1 ${command.axis}${target} F${command.axis === 'Z' ? 120 : 600}\nRESTORE_GCODE_STATE NAME=FABCORE_CONTROL`;
    }
    if (!script) return { outcome: 'rejected' };
    const result = await call(machine, '/printer/gcode/script', { script });
    if (result?.result !== 'ok') throw new Error('command-unconfirmed');
    return { outcome: 'executed' };
  } };
}
