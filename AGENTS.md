# Travailler sur FabCore

**Phase active : MVP — cadrage et migration.** POC clôturé. [Bilan](docs/POC-BILAN.md) · [Plan de migration](docs/MIGRATION-MVP.md) · [Périmètre MVP](docs/MVP.md).

## Accès direct — lire ceci avant d'explorer le dépôt

Ce fichier est la référence commune pour les assistants. Choisir le sujet ci-dessous, ouvrir le symbole et son test ; ne pas parcourir tout le code pour retrouver ces points d'entrée. La carte détaillée et les guides se chargent seulement si nécessaire.

| Sujet | Point d'entrée | Test de départ |
| --- | --- | --- |
| Fichiers internes CC2 | `poc/elegoo-files.mjs` → `createElegooFiles` ; session dans `poc/elegoo.mjs` | `poc/cc2-native-files.test.mjs` |
| P2S LAN / autorisations | `poc/bambu.mjs` → `createBambuMonitor` ; `poc/manual-controls.mjs` | `poc/bambu-auth-http.test.mjs` |
| Envoi de fichier Moonraker | `poc/server.mjs` → `createFabCore` ; `poc/moonraker.mjs` → `createMoonrakerFiles` | `poc/files.test.mjs` |
| Droits et authentification | `poc/server.mjs` → `createFabCore` ; `poc/oidc.mjs` | `poc/oidc.test.mjs` |
| Parc / fiche machine | `poc/live.js` → `liveFleet`, `liveDetail`, `filesPanel` | `poc/machine-cockpit.test.mjs` |
| Commandes et chauffe | `poc/manual-controls.mjs` → `createManualControls` | `poc/manual-controls-http.test.mjs` |
| Découverte / multi-instance | `poc/discovery.mjs` → `scanNetwork`, `detectMoonraker` | `poc/discovery.test.mjs` |
| Contrats du domaine (MIG) | `src/domain/` → `mergeOutcome` (`command.ts`), `restrictCapabilities` (`capabilities.ts`) ; adaptateur `src/application/connectors.ts` → `createTypedConnectorRegistry` | `src/domain/contracts.test.ts`, `src/application/connectors.test.ts` |
| Comptes cloud / logs | `poc/cloud-accounts.mjs` → `createCloudAccounts` ; `poc/machine-logs.mjs` | `poc/cloud-accounts.test.mjs` |

Autre sujet ou références actuelles avec lignes/empreintes : `node scripts/ai-context.mjs --list`, puis `node scripts/ai-context.mjs <sujet>`. Pas de numéro de ligne figé dans ce fichier. Lors d'un déplacement ou renommage, actualiser cette table et la carte détaillée.

## Reprendre une tâche

1. Vérifier dépôt, branche, état local et référence distante : `git status --short --branch`. Vérifier sur GitHub si la copie est ancienne. Préserver tout travail local ; utiliser une branche/worktree dédié pour un nouveau jalon.
2. Consulter [CODEMAP](docs/ai/CODEMAP.md), ou `node scripts/ai-context.mjs --list` puis `<sujet>`. Lire le symbole, son test et le seul document du jalon utile. Élargir aux dépendances identifiées ; ne pas relire tout le journal POC ou le prompt d'origine.
3. Si une session travaille déjà sur le sujet, reprendre sa branche ou coordonner le périmètre avant d'écrire. Un seul propriétaire par fichier ; worktrees séparés pour travaux parallèles.

## Références à la demande

- Connecteur : [contrat](poc/CONNECTORS.md), puis guide fabricant dans `docs/protocols/`.
- Décisions d'architecture : [ADR](docs/adr/README.md).
- Interface : [règles produit](docs/PRODUCT.md).
- Exploitation : [guide](poc/README.md).
- Organisation IA/délégation : [routine](docs/ai/WORKFLOW.md) ; [relais court](docs/ai/HANDOFF.md).
- Étapes futures : [développement complet](docs/FULL-DEVELOPPEMENT.md).
- Intention d'origine : `MASTER_PROMPT_ORIGIN.md`, seulement pour cadrage.

## Modifier et vérifier

- Livrer le plus petit diff couvrant la demande. Réutiliser interfaces et conventions ; préserver contrats, installations, données et acquis de recette. Migration progressive, sans réécriture des connecteurs.
- Aucun formatage global, renommage en série ou changement de dépendances sans besoin du jalon. Ne modifier le verrouillage que si nécessaire. Ne jamais effacer ou réécrire le travail d'une autre session.
- Avant PR : relire `git diff --stat` et `git diff`, exécuter `git diff --check` et les contrôles adaptés. Pour du code produit : `npm run check` (types, lint, tests, licences). Pour la navigation : `node scripts/ai-context.mjs --check`. Indiquer tests physiques/navigateur restant à faire.
- Si un point d'entrée change : mettre à jour `docs/ai/topics.json`, puis `node scripts/ai-context.mjs --write-map` et `--check`. La carte et les empreintes aident à naviguer ; vérifier les relations réelles dans le code.
- Sorties d'outils : bilan et erreurs utiles ; conserver les détails dans un fichier temporaire sans masquer les codes d'échec. Aucun secret dans les journaux, docs ou PR.

## Agents et livraison

Travail simple : un seul agent. Déléguer une tâche indépendante volumineuse à un spécialiste avec objectif, références, critères et périmètre courts ; deux spécialistes simultanés maximum au départ, sans sous-délégation ni débats répétés sur les décisions acquises. Profils locaux : `.codex/agents/`. Ne pas supposer leur chargement automatique dans ChatGPT Work ; y transmettre les instructions pertinentes explicitement.

Chaque jalon a sa PR et son état de reprise : branche/commit, résultat, vérifications, limites et première action suivante. Distinguer ouvert, fusionné, déployé et testé matériel. Ouvrir la PR pour revue ; fusion et déploiement sur demande. Aucune commande machine implicite dans une tâche de développement. Les profils de lecture seule ne modifient ni fichiers ni matériel ; leurs restrictions textuelles ne remplacent pas les permissions du client.
