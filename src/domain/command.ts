import Type from 'typebox';
import { CommandAction } from './capabilities.ts';
import { FabError } from './error.ts';

export const Command = Type.Object({
  /** Identifiant de corrélation, unique ; une commande n'est jamais rejouée automatiquement. */
  id: Type.String({ format: 'uuid' }),
  machineId: Type.String({ format: 'uuid' }),
  action: CommandAction,
  requestedBy: Type.String({ minLength: 1, maxLength: 120 }),
  requestedAt: Type.String({ format: 'date-time' }),
  /** Confirmation explicite de l'utilisateur, requise pour `start`, `stop` et `emergencyStop`. */
  confirmed: Type.Boolean(),
}, { additionalProperties: false });

export type Command = Type.Static<typeof Command>;

/**
 * Issue d'une commande, du plus prouvé au moins prouvé :
 * - `confirmed` : effet observé par la supervision ;
 * - `executed` : la machine indique avoir exécuté la commande ;
 * - `accepted` : accusé de réception du transport, effet non observé ;
 * - `rejected` : refus explicite de la machine ou du serveur ;
 * - `unknown` : réponse perdue ou délai dépassé, effet indéterminé.
 */
export const CommandOutcome = Type.Union([
  Type.Literal('confirmed'),
  Type.Literal('executed'),
  Type.Literal('accepted'),
  Type.Literal('rejected'),
  Type.Literal('unknown'),
]);
export type CommandOutcome = Type.Static<typeof CommandOutcome>;

export const CommandResult = Type.Object({
  commandId: Type.String({ format: 'uuid' }),
  outcome: CommandOutcome,
  at: Type.String({ format: 'date-time' }),
  error: Type.Optional(FabError),
  /** Code HTTP natif conservé sans l’assimiler à une confirmation physique. */
  nativeCode: Type.Optional(Type.Integer()),
}, { additionalProperties: false });

export type CommandResult = Type.Static<typeof CommandResult>;

/** Seuls `confirmed` et `executed` prouvent l'effet ; `accepted` ne doit pas être affiché comme un succès. */
export const isEffectProven = (outcome: CommandOutcome): boolean => outcome === 'confirmed' || outcome === 'executed';

const rank: Record<Exclude<CommandOutcome, 'rejected'>, number> = { unknown: 0, accepted: 1, executed: 2, confirmed: 3 };

/**
 * Combine un nouveau constat avec l'issue connue sans jamais la dégrader :
 * un accusé ne remplace pas une confirmation, un refus reste un refus,
 * et un refus tardif ne contredit pas un effet déjà prouvé.
 */
export function mergeOutcome(current: CommandOutcome, next: CommandOutcome): CommandOutcome {
  if (current === 'rejected') return current;
  if (next === 'rejected') return isEffectProven(current) ? current : next;
  return rank[next] > rank[current] ? next : current;
}
