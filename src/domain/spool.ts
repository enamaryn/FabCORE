// Bobine renseignée à la main : information FabCore, jamais une commande ni un emplacement remonté par la machine.
export type ManualSpool = { material: string; name: string; color: string | null };

export const supportsManualSpool = (kind: string): boolean => ['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud'].includes(kind);

/** Valide et normalise une saisie ; `null` si elle est invalide. */
export function manualSpool(input: unknown): ManualSpool | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  // eslint-disable-next-line no-control-regex -- refuse exprès les caractères de contrôle (même règle que le POC)
  const clean = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
  const material = clean(data.material, 40), name = clean(data.name ?? '', 80);
  if (!material || name === null || (data.color != null && (typeof data.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(data.color)))) return null;
  return { material, name, color: data.color == null ? null : (data.color as string).toUpperCase() };
}
