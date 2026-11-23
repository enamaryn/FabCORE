// Types du parseur G-code (implémentation unique : poc/gcode.mjs), importé par l'interface React.
export const TRAVEL: 0;
export const EXTRUDE: 1;
export type Layer = { z: number; start: number; end: number; extrusions: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GcodeResult = {
  /** x0, y0, x1, y1 par segment. */
  segments: Float32Array;
  /** 0 déplacement à vide, 1 extrusion (ou laser actif). */
  types: Uint8Array;
  /** z0, z1 par segment. */
  heights: Float32Array;
  /** Position dans le fichier (octets) à la fin de chaque segment. */
  offsets: Float64Array;
  layers: Layer[];
  bounds: Bounds | null;
  unsupported: { command: string; count: number; line: number }[];
  lines: number;
  commands: number;
};
export function createGcodeParser(options?: { laser?: boolean }): { write(chunk: string): void; finish(): GcodeResult };
export function parseGcode(text: string): GcodeResult;
export function printedSegments(result: GcodeResult, filePosition: number): number;
export function layerOfSegment(result: GcodeResult, index: number): number;
