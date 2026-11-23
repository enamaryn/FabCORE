// Erreur de service : un statut et un code stable (ADR 0005), sans texte affiché. Levée par les cas d'usage,
// traduite en réponse `{ error: code }` par la couche HTTP (`HttpError` en est l'alias).
export class ServiceError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
  }
}
