import type { MachineData } from './types.ts';
export interface MachineFile { path: string; size: number | null; modified: number | null }
export interface FileInventory { files: MachineFile[]; truncated: boolean }
export type FileSort = 'newest' | 'oldest' | 'name';
export const fileBaseName = (path: string) => path.split('/').at(-1)!;
export function safeFilePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && /^[\x20-\x7e]+$/.test(value) && !value.includes('\\') && !value.split('/').some(p => !p || p === '.' || p === '..' || p.trim() !== p) && /\.(gcode|gco|g|gc|nc|3mf)$/i.test(value);
}
export function filePage(files: MachineFile[], query: string, sort: FileSort, page: number, size: number, locale: string) {
  const needle = query.trim().toLocaleLowerCase(locale);
  const byName = (a: MachineFile, b: MachineFile) => a.path.localeCompare(b.path, locale, { numeric: true, sensitivity: 'base' });
  const rows = files.filter(f => f.path.toLocaleLowerCase(locale).includes(needle)).sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (a.modified === null || b.modified === null) return a.modified === b.modified ? byName(a, b) : a.modified === null ? 1 : -1;
    return (sort === 'oldest' ? a.modified - b.modified : b.modified - a.modified) || byName(a, b);
  });
  const pageSize = size === 20 ? 20 : 5, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1)), start = current * pageSize;
  return { rows: rows.slice(start, start + pageSize), count: rows.length, pages, start, page: current };
}
export const downloadHref = (id: string, path: string) => '/api/machines/' + encodeURIComponent(id) + '/file?download=1&path=' + encodeURIComponent(path);
export const viewerHref = (id: string, path: string, follow = false) => '/?machine=' + encodeURIComponent(id) + '&view=' + encodeURIComponent(path) + (follow ? '&follow=1' : '');
export const localViewerHref = (id: string) => '/?machine=' + encodeURIComponent(id) + '&tab=files';
export function uploadProblem(machine: MachineData, file: { name: string; size: number }): string | null {
  const name = file.name;
  if (name.length > 200 || !safeFilePath(name) || name.includes('/') || (machine.kind === 'longer-ray5' ? !/^[A-Za-z0-9 _.()-]+\.(gcode|gco|g|gc|nc)$/i.test(name) : !(machine.capabilities?.projects ? /\.(gcode|gco|g|3mf)$/i : /\.(gcode|gco|g)$/i).test(name))) return 'invalid-name';
  return !Number.isSafeInteger(file.size) || file.size < 1 || file.size > (machine.kind === 'longer-ray5' ? 16 : 512) * 1024 * 1024 ? 'file-too-large' : null;
}
export function fileError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return ['files-unavailable', 'file-too-large', 'file-exists', 'file-quota', 'upload-busy', 'upload-rejected', 'upload-failed', 'upload-unknown', 'upload-proxy-limit', 'command-state', 'command-busy', 'command-rejected', 'command-unconfirmed', 'bambu-authorization', 'forbidden', 'sign-in', 'project-format', 'project-multiple-plates', 'project-no-gcode', 'missing', 'invalid', 'invalid-name'].includes(code) ? code : 'command-unconfirmed';
}
