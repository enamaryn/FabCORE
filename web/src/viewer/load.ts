// Lecture en flux d'un fichier G-code (machine ou fichier local) vers le parseur unique, avec progression et
// annulation : quitter le visualiseur interrompt la lecture et libère la réponse.
import { createGcodeParser, type GcodeResult } from '../../../poc/gcode.mjs';

export class ViewerLoadError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export type Source = { kind: 'machine'; machineId: string; path: string } | { kind: 'local'; file: Blob };

export async function loadGcode(source: Source, { laser, signal, onProgress, fetcher = fetch }: {
  laser: boolean; signal: AbortSignal; onProgress?: (read: number, size: number) => void; fetcher?: typeof fetch;
}): Promise<GcodeResult> {
  let response: Response;
  if (source.kind === 'local') response = new Response(source.file);
  else {
    try { response = await fetcher('/api/machines/' + encodeURIComponent(source.machineId) + '/file?path=' + encodeURIComponent(source.path), { signal, credentials: 'same-origin' }); }
    catch (error) { if (signal.aborted) throw error; throw new ViewerLoadError('network'); }
    if (!response.ok) {
      let code = '';
      try { code = String((await response.json() as { error?: unknown }).error ?? ''); } catch { /* corps vide */ }
      throw new ViewerLoadError(/^[a-z][a-z0-9-]{0,60}$/.test(code) ? code : 'files-unavailable');
    }
  }
  const size = source.kind === 'local' ? source.file.size : Number(response.headers.get('content-length')) || 0;
  const parser = createGcodeParser({ laser });
  if (!response.body) throw new ViewerLoadError('files-unavailable');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  let read = 0, shown = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      if (done) break;
      parser.write(value);
      read += value.length;
      if (Date.now() - shown > 150) {
        shown = Date.now();
        onProgress?.(read, size);
        // Rend la main au navigateur pendant les gros fichiers.
        await new Promise(resolve => setTimeout(resolve));
      }
    }
  } finally { signal.removeEventListener('abort', abort); }
  onProgress?.(size || read, size || read);
  return parser.finish();
}
