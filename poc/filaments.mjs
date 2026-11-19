const number = (value) => (typeof value === 'number' || typeof value === 'string') && /^\d{1,3}$/.test(value) ? Number(value) : -1;
const label = (value) => typeof value === 'string' ? value.trim().slice(0, 80) : '';
// Bambu humidity is an index (1–5); only humidity_raw is a percentage.
const humidity = (value) => {
  const parsed = number(value);
  return parsed >= 0 && parsed <= 100 ? parsed : null;
};

function color(value) {
  return typeof value === 'string' && /^#?[a-f0-9]{6}([a-f0-9]{2})?$/i.test(value)
    ? '#' + value.replace(/^#/, '').slice(0, 6).toUpperCase() : null;
}

function slot(id, occupied, active, material, name, shade) {
  return {
    id, occupied, active: occupied !== false && active,
    material: occupied === false ? '' : label(material),
    name: occupied === false ? '' : label(name),
    color: occupied === false ? null : color(shade)
  };
}

export function bambuFilaments(ams) {
  if (!ams || !Array.isArray(ams.ams)) return null;
  const mask = typeof ams.tray_exist_bits === 'string' && /^[a-f0-9]{1,6}$/i.test(ams.tray_exist_bits) ? parseInt(ams.tray_exist_bits, 16) : null;
  const present = typeof ams.ams_exist_bits === 'string' && /^[a-f0-9]{1,3}$/i.test(ams.ams_exist_bits) ? parseInt(ams.ams_exist_bits, 16) : null;
  const active = number(ams.tray_now);
  return ams.ams.slice(0, 12).flatMap((unit) => {
    const id = number(unit?.id);
    const ht = id >= 128 && id <= 135;
    if (!(ht || (id >= 0 && id < 4))) return [];
    const index = ht ? id - 128 + 4 : id;
    if (present !== null && !(present & (1 << index))) return [];
    const trays = Array.isArray(unit.tray) ? unit.tray.slice(0, 4) : [];
    return [{ id: index, variant: ht ? 'ht' : null, humidity: humidity(unit.humidity_raw), slots: Array.from({ length: ht ? 1 : 4 }, (_, i) => {
      const tray = trays.find((item) => number(item?.id) === i) ?? (ht ? trays[0] : null);
      const bit = ht ? 16 + id - 128 : id * 4 + i;
      const occupied = mask === null ? null : Boolean(mask & (1 << bit));
      return slot(i, occupied, active === (ht ? id : bit), tray?.tray_type, tray?.tray_sub_brands, tray?.tray_color);
    }) }];
  });
}

export function canvasFilaments(result) {
  const info = result?.canvas_info;
  if (result?.error_code !== 0 || !Array.isArray(info?.canvas_list)) return null;
  return info.canvas_list.slice(0, 8).flatMap((unit) => {
    const id = number(unit?.canvas_id);
    if (id < 0 || number(unit.connected) === 0 || unit.connected === false) return [];
    const trays = Array.isArray(unit.tray_list) ? unit.tray_list.slice(0, 4) : [];
    return [{ id, variant: null, slots: Array.from({ length: 4 }, (_, i) => {
      const tray = trays.find((item) => number(item?.tray_id) === i);
      const state = number(tray?.status);
      const occupied = state === 0 ? false : [1, 2].includes(state) ? true : null;
      const active = number(info.active_canvas_id) === id && number(info.active_tray_id) === i;
      return slot(i, occupied, active, tray?.filament_type, tray?.filament_name, tray?.filament_color);
    }) }];
  });
}
