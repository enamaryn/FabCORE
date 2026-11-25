export type BambuCameraMode = 'auto' | 'lan' | 'cloud' | 'disabled';
export interface BambuCameraConfig { mode: BambuCameraMode; host: string }
/** Explicit RFC1918 IPv4 only: no DNS, loopback, link-local, URL or arbitrary port. */
export function privateCameraHost(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return false;
  const octets = value.split('.').map(Number);
  return octets.every(n => n <= 255) && (octets[0] === 10 || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31 || octets[0] === 192 && octets[1] === 168);
}
export function bambuCameraConfig(value: unknown): BambuCameraConfig | null {
  if (!value || typeof value !== 'object' || !('mode' in value) || typeof value.mode !== 'string' || !['auto', 'lan', 'cloud', 'disabled'].includes(value.mode)) return null;
  const host = 'host' in value && typeof value.host === 'string' ? value.host.trim() : '';
  if (host && !privateCameraHost(host) || (value.mode === 'lan' && !host)) return null;
  return { mode: value.mode as BambuCameraMode, host };
}
export function bambuCameraInfo(value: unknown, experimental: boolean) {
  const saved = bambuCameraConfig(value) ?? { mode: 'auto' as const, host: '' };
  // Legacy protocol choices converge on automatic LAN video; never advertise remote cloud video.
  const config = { mode: saved.mode === 'disabled' ? 'disabled' as const : 'auto' as const, host: saved.host };
  const issue = !experimental ? 'camera-experimental-disabled' : config.mode === 'disabled' ? 'camera-disabled' : null;
  return { ...config, experimental, available: issue === null, source: issue === null ? 'lan' as const : null, transport: issue === null ? 'rtsps' as const : 'unknown' as const, issue };
}
