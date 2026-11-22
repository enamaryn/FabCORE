import Type from 'typebox';
import { ErrorCode } from '../domain/index.ts';

/** Corps d'erreur HTTP, identique au POC : un code stable traduit par l'interface (ADR 0005). */
export const ErrorBody = Type.Object({ error: ErrorCode }, { additionalProperties: false, $id: 'ErrorBody' });

/** Erreur métier transportée jusqu'au gestionnaire central, qui répond `{ error: code }`. */
export class HttpError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
  }
}

/** Réponses d'erreur documentées, réutilisées par chaque route. */
export const errorResponses = (...statuses: number[]) =>
  Object.fromEntries(statuses.map(status => [status, Type.Ref('ErrorBody')]));
