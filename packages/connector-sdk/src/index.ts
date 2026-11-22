/** Ports de migration internes, sans dépendance au cœur ni au stockage. SDK public stabilisé en MIG-07. */
export interface DiagnosticPort {
  record(category: string, event: string, machineId: string): void;
  report(machineId: string): void;
  trace?(machineId: string, event: string, details: Record<string, unknown>): void;
}

/** Projections partagées injectées par la composition POC pendant la migration. */
export interface ReportPorts<TReport, TControls, TMaterials> {
  readResponse(response: Response): Promise<unknown>;
  reportedControls(kind: string, report: TReport): TControls;
  canvasFilaments(report: TReport): TMaterials | null;
}

export interface MachineFile {
  path: string;
  size: number | null;
  modified: number | null;
}

/** Utilitaires HTTP/fichiers encore partagés, injectés par les adaptateurs de composition. */
export interface HttpFilePorts {
  readResponse(response: Response): Promise<unknown>;
  validOrigin(origin: string): string | null;
  filePath(path: unknown): string | null;
  encodePath(path: string): string;
  multipart(field: string, name: string, source: AsyncIterable<Uint8Array>, size: number, extra?: Record<string, string>): {
    body: ReadableStream<Uint8Array>;
    headers: Record<string, string>;
  };
}
