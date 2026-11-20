// Informational FabCore metadata, never a command or a reported machine slot.
export const supportsManualSpool = kind => ['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud'].includes(kind);
export function manualSpool(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const clean = (s, max) => typeof s === 'string' && s.length <= max && !/[\x00-\x1f\x7f]/.test(s) ? s.trim() : null;
  const material = clean(input.material, 40), name = clean(input.name ?? '', 80);
  if (!material || name === null || (input.color != null && (typeof input.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(input.color)))) return null;
  return { material, name, color: input.color == null ? null : input.color.toUpperCase() };
}
