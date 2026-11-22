export interface MoonrakerConnection { origin: string; apiKey?: string | undefined }
export type MoonrakerStatus = 'connecting' | 'ready' | 'printing' | 'paused' | 'done' | 'error' | 'offline';
/** Forme POC préservée ; conversion vers la télémétrie commune par l'adaptateur du registre. */
export interface MoonrakerSnapshot {
  status: MoonrakerStatus;
  issue: string | null;
  nozzle: number | null;
  bed: number | null;
  progress: number;
  file: string;
  filePath?: string;
  filePosition?: number;
}
export type MoonrakerRequest = RequestInit & { duplex?: 'half' };
export type MoonrakerFetch = (url: string, options: MoonrakerRequest) => Promise<Response>;
export interface MoonrakerObjects {
  webhooks?: { state?: unknown };
  print_stats?: { state?: string; filename?: unknown };
  virtual_sdcard?: { progress?: unknown; file_position?: unknown };
  extruder?: { temperature?: unknown };
  heater_bed?: { temperature?: unknown };
}
export interface MoonrakerReply<T> {
  result?: T;
  error?: { message?: unknown };
  item?: { path?: unknown };
}
export interface MoonrakerFile { path: string; size?: unknown; modified?: unknown }
export interface GcodeEntry { type?: unknown; message?: unknown }
export type MoonrakerGcodeResult = { outcome: 'rejected'; message: string } | { outcome: 'executed'; responses: string[] | null };
