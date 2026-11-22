# ADR 0002 · Outillage

**État :** Proposé · **Étape :** MIG-01.1.2 · Installation effective en MIG-01.2, sans mise à jour globale des dépendances existantes.

## Contexte

Le plan exige de choisir et motiver le framework HTTP, le build frontend, l'accès SQL et la validation. Contraintes : migration progressive, OpenAPI (MIG-03.1.2), contrôles centralisés d'autorisation, de validation, de délais et d'annulation (MIG-03.1.3), contrats réutilisables par un SDK de connecteurs ([ADR 0006](0006-connecteurs-autonomes.md)), peu de dépendances, licences compatibles GPL-3.0.

## Décision

| Besoin | Choix | Motif |
| --- | --- | --- |
| Exécution TS serveur | **Sans étape de build** : Node 24 retire les types à l'exécution ; `tsc --noEmit` vérifie. | `node --test` inchangé ; aucun artefact compilé à maintenir. Impose `erasableSyntaxOnly`. |
| HTTP | **Fastify 5** | Schémas JSON pour validation et sérialisation, génération OpenAPI (`@fastify/swagger`), hooks d'authentification, délais par route, bon typage. L'ancien gestionnaire `node:http` est monté derrière une route attrape-tout : chaque route migrée remplace l'ancienne (étrangleur). |
| Validation et contrats | **TypeBox** | Un schéma produit le type TS, le JSON Schema utilisé par Fastify et le contrat OpenAPI. Même format pour la configuration ([ADR 0007](0007-profils-installation.md)) et les manifestes de connecteurs. |
| SQL | **Kysely + `pg`** | Requêtes typées proches du SQL, migrations versionnées intégrées, aucun moteur binaire ni génération obligatoire. |
| Tests base de données | PostgreSQL 16 réel en service CI ; PGlite accepté pour les tests locaux rapides. | Même moteur qu'en production. |
| Frontend | **Vite + React + TypeScript** ; données via TanStack Query invalidé par les événements SSE. | Standard, rapide ; l'interface existante est servie à côté des écrans migrés. |
| Lint | **ESLint + typescript-eslint**, jeu de règles limité : `no-floating-promises`, `no-misused-promises`, `no-restricted-imports` (frontières). | Erreurs asynchrones critiques pour les sessions machines ; aucun formatage global imposé. |
| Licences | Vérification automatique en CI : refus de toute licence incompatible GPL-3.0. | MVP-00.7, MVP-01.8. |

## Conséquences

- Ajout progressif des dépendances dans MIG-01.2, chacune justifiée dans sa PR.
- Pas de syntaxe TS non effaçable dans le code serveur.
- Les schémas TypeBox deviennent la source unique des contrats ; aucun type dupliqué à la main.

## Alternatives écartées

- Express : validation et typage hors cadre. NestJS : structure et décorateurs trop lourds. Hono : viable, écosystème OpenAPI/Node moins direct.
- Zod : viable, mais conversion JSON Schema supplémentaire pour Fastify et OpenAPI.
- Prisma : moteur et génération, moins de contrôle SQL. TypeORM : décorateurs, comportement implicite. Drizzle : alternative crédible conservée en repli.
- `tsx`/ts-node/Babel : inutiles tant que Node retire les types.
- Next.js : rendu serveur inutile pour une application d'atelier authentifiée.
