# Travailler sur FabCore

**Phase active : MVP — cadrage et migration.** POC clôturé. [Bilan](docs/POC-BILAN.md) · [Plan de migration](docs/MIGRATION-MVP.md) · [Périmètre MVP](docs/MVP.md).

## Accès direct — lire ceci avant d'explorer le dépôt

Ce fichier est la référence commune pour les assistants. Choisir le sujet ci-dessous, ouvrir le symbole et son test ; ne pas parcourir tout le code pour retrouver ces points d'entrée. La carte détaillée et les guides se chargent seulement si nécessaire.

| Sujet | Point d'entrée | Test de départ |
| --- | --- | --- |
| CC2 : session et fichiers | `connectors/elegoo/src/monitor.ts` → `createCC2Services` ; `files.ts` → `createCC2Files` ; adaptateurs `poc/elegoo*.mjs` | `connectors/elegoo/test/monitor.test.ts`, `poc/cc2-native-files.test.mjs` |
| P2S LAN / autorisations | `connectors/bambu/src/monitor.ts` → `createP2SMonitor`, `files.ts` → `createP2SFiles` ; adaptateur `poc/bambu.mjs` ; `poc/manual-controls.mjs` | `connectors/bambu/test/monitor.test.ts`, `poc/bambu-auth-http.test.mjs` |
| Moonraker : états, fichiers, commandes et terminal | `connectors/moonraker/src/index.ts` → `createMoonrakerServices` ; adaptateur `poc/moonraker.mjs` | `connectors/moonraker/test/connector.test.ts`, `poc/files.test.mjs`, `poc/terminal.test.mjs` |
| OctoPrint / PrusaLink | `connectors/octoprint/src/index.ts` → `createOctoPrintServices` ; `connectors/prusalink/src/index.ts` → `createPrusaLinkServices` ; adaptateurs `poc/octoprint.mjs`, `poc/prusalink.mjs` | `connectors/octoprint/test/connector.test.ts`, `connectors/prusalink/test/connector.test.ts`, `poc/octoprint.test.mjs` |
| CC1 : SDCP et transfert | `connectors/elegoo/src/cc1.ts` → `readElegooCC1`, `requestElegooCC1` ; `upload.ts` → `createElegooFileServices` | `connectors/elegoo/test/cc1.test.ts`, `poc/elegoo.test.mjs` |
| xTool M2 : session, caméra et découverte | `connectors/xtool/src/monitor.ts` → `createXToolServices` ; `camera.ts`, `media.ts`, `discovery.ts` | `connectors/xtool/test/monitor.test.ts`, `poc/xtool.test.mjs` |
| Longer Ray5 : GRBL et carte SD | `connectors/longer/src/monitor.ts` → `createRay5Services` ; `files.ts` → `createRay5FileServices` | `connectors/longer/test/connector.test.ts`, `poc/longer-ray5-controls.test.mjs` |
| Socle HTTP / OpenAPI (MIG-03) | `src/http/app.ts` → `createHttpApp` (gardes, mode brut, repli) ; toutes les routes `src/http/routes/index.ts` → `migratedRoutes` ; services et gestionnaires `handle*` dans `poc/server.mjs` ; corrélation `src/http/correlation.ts` | `src/http/app.test.ts`, `poc/routing-parity.test.mjs`, `poc/write-routes.test.mjs`, `poc/machine-writes.test.mjs`, `poc/correlation-http.test.mjs` |
| Droits et authentification | `src/application/accounts.ts` → `createAccountService` ; sessions dans `poc/server.mjs` → `createFabCore` ; `poc/oidc.mjs` | `src/application/services.test.ts`, `poc/write-routes.test.mjs`, `poc/oidc.test.mjs` |
| Notifications / bobine manuelle | `src/application/notifications.ts` → `createNotificationService` ; `machines.ts` → `createMachineMetadata` ; envoi `poc/notifications.mjs` → `sendNotification` | `src/application/services.test.ts`, `poc/notifications.test.mjs` |
| Temps réel SSE (MIG-05) | `src/application/events.ts` → `createEventHub` ; `fleet-events.ts` → `createFleetWatcher`, `observeFleet` ; route `src/http/routes/events.ts` ; flux `handleEvents` dans `poc/server.mjs` | `src/application/events.test.ts`, `poc/events-http.test.mjs` |
| Interface React (MIG-06) | `web/src/App.tsx` → `App` ; composants `web/src/components/` ; SSE `web/src/events.ts` ; build/ressources `src/http/web-build.ts` | `web/test/`, `poc/react-pages.test.mjs` ; [parité](docs/MIG-06-PARITY.md) |
| Parc / fiche machine | React : `web/src/components/FleetPage.tsx`, `machine/MachineDetail.tsx` → `MachineDetail` ; historique : `poc/live.js` → `liveDetail`, `filesPanel` | `web/test/cockpit.test.mjs`, `poc/machine-cockpit.test.mjs` |
| Commandes et chauffe | `src/domain/control.ts` → `validateControl` partagé HTTP/React ; protocole `poc/manual-controls.mjs` → `createManualControls` ; UI `web/src/components/controls/` | `web/test/controls.test.mjs`, `poc/manual-controls-http.test.mjs` |
| Découverte / multi-instance | `poc/discovery.mjs` → `scanNetwork`, `detectMoonraker` | `poc/discovery.test.mjs` |
| Contrats du domaine (MIG) | `src/domain/` → `mergeOutcome` (`command.ts`), `restrictCapabilities` (`capabilities.ts`) ; adaptateur `src/application/connectors.ts` → `createTypedConnectorRegistry` | `src/domain/contracts.test.ts`, `src/application/connectors.test.ts` |
| PostgreSQL / import `state.json` (MIG-04) | configuration `src/config/database.ts` → `loadDatabaseConfig` ; `src/persistence/postgres-store.ts` → `openPostgresStore` ; `import.ts` → `importState` ; `mapping.ts` ; CLI `scripts/import-state.mjs` | `src/config/database.test.ts`, `src/persistence/mapping.test.ts`, `src/persistence/postgres.test.ts` (`FABCORE_TEST_DATABASE_URL`) |
| Commande `fabcore` (update, backup, restore, database) | `scripts/fabcore.sh` → `cmd_backup`, `cmd_restore`, `cmd_database_setup` ; `scripts/database.mjs` (check, env) ; lanceurs `scripts/install.sh` | `scripts/fabcore-cli.test.mjs` |
| Comptes cloud / logs | `connectors/bambu/src/cloud-http.ts` → `createCloudHttp` ; `cloud-monitor.ts` → `createCloudMonitor` ; orchestration `poc/cloud-accounts.mjs` | `poc/cloud-accounts.test.mjs` |

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
