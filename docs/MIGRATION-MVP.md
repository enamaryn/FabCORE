# Migration du POC vers le socle MVP

**État : migration engagée. MIG-01 et MIG-02 fusionnés ; MIG-03 engagé (socle, lectures et écritures comptes/notifications fusionnés ; administration du parc en revue).** Référence : [bilan POC v0](POC-BILAN.md). Ce plan détaille MVP-00/01/02/03/12/13 ; il ne remplace pas le périmètre produit du [MVP](MVP.md).

## Règles de passage

Une étape correspond à une petite PR révisable. Elle avance de « À faire » vers « En cours », « En revue », « Fusionné », puis « Déployé/Testé » lorsque cela a réellement eu lieu. Une phase n'est terminée que lorsque ses critères sont démontrés. Une fusion ne vaut pas recette matérielle. Les travaux dépendants attendent leur prérequis ; aucune date arbitraire n'est imposée.

Les connecteurs et leurs comportements sont conservés, les tests existants restent verts. Pas de nouveau protocole pendant la migration hors correction de régression. Aucun ordre machine, rejeu après reconnexion ou lancement d'impression au démarrage. Les essais matériels restent explicites et supervisés. Une machine conserve un seul transport configuré, LAN ou cloud, sans bascule implicite.

| Phase | Objet | Dépendance | État initial |
| --- | --- | --- | --- |
| MIG-00 | Référence et recette de non-régression | Clôture POC | POC v0 publié ; bilan accepté |
| MIG-01 | Architecture, contrats et outillage | MIG-00 | Fusionné : PR #100 et #101 ([ADR](adr/README.md)) |
| MIG-02 | Domaine et connecteurs TypeScript | MIG-01 | Fusionné (#102 à #107, #109) ; recette physique à faire |
| MIG-03 | Services backend et API | MIG-02 | En cours : socle, lectures, comptes/notifications fusionnés (#110, #111, #113) ; administration du parc en revue |
| MIG-04 | PostgreSQL et reprise des données | MIG-03 | À faire |
| MIG-05 | Événements et SSE | MIG-03/04 | À faire |
| MIG-06 | Interface React par parcours | MIG-05 | À faire |
| MIG-07 | Documentation et extensibilité | MIG-02 à 06 | À faire |
| MIG-08 | Installation, recette et bascule | MIG-04 à 07 | À faire |

## MIG-00 · Figer les acquis

### MIG-00.1 · Référence de livraison

- MIG-00.1.1 Consigner le commit accepté, les notes et les limites : [POC v0](releases/POC-v0.md).
- MIG-00.1.2 Enregistrer le brouillon GitHub ; publication et tag définitif après validation du propriétaire.
- MIG-00.1.3 Sauvegarder l'installation et les données avant toute future migration ; ne pas joindre de données personnelles à la release.

### MIG-00.2 · Contrat de recette

- MIG-00.2.1 Conserver les tests existants et constituer des fixtures anonymisées à partir des retours utiles.
- MIG-00.2.2 Relever modèles, versions et modes des machines de recette lors du prochain essai.
- MIG-00.2.3 Séparer acquis CC2/P2S, essais reportés et anomalies connues dans une matrice de parité.

**Sortie :** référence immuable identifiée, limites acceptées et recette reproductible. **Retour arrière :** code POC et données originales préservés.

## MIG-01 · Décisions et fondations

### MIG-01.1 · Décisions d'architecture

Acceptés : [ADR 0001 à 0007](adr/README.md) — TypeBox, Fastify, Kysely, Vite, Node 24 (CI 24 + 26), PostgreSQL ≥ 16, i18n, connecteurs autonomes, profils d'installation.

- MIG-01.1.1 Formaliser les décisions acquises : TypeScript strict, Node.js LTS, monolithe modulaire, React, PostgreSQL et SSE.
- MIG-01.1.2 Choisir et motiver le framework HTTP éventuel, le build frontend, l'accès SQL/ORM et les outils de validation ; ne pas imposer ces choix silencieusement.
- MIG-01.1.3 Définir les frontières domaine, application, transports, persistance et présentation ; une seule implémentation autoritaire par responsabilité.

### MIG-01.2 · Outillage et contrats

Fusionné dans la PR #101 : TypeScript sans build (`npm run typecheck`), ESLint limité à `src/` (`npm run lint`), contrats TypeBox dans `src/domain/`, contrôle des licences (`npm run check:licenses`), CI Node 24 et 26 (`.github/workflows/ci.yml`). `npm run check` enchaîne tout.

- MIG-01.2.1 Ajouter compilation incrémentale JS/TS, typage strict des modules migrés, lint limité et scripts de développement.
- MIG-01.2.2 Définir Machine, Connexion, Capacités, Télémétrie, Commande/Résultat, Événement et Erreur ; distinguer accepté, confirmé et inconnu.
- MIG-01.2.3 Installer la CI tests/typecheck/lint/licences sans mise à jour globale des dépendances.

**Sortie :** décisions écrites, contrats revus, build et tests verts. **Retour arrière :** entrée POC encore exécutable ; changements d'outillage réversibles.

## MIG-02 · Typer les connecteurs sans changer les protocoles

### MIG-02.1 · Domaine et adaptation

Fusionné dans la PR #102 : contrats de cycle de vie, registre typé et normalisation. Le serveur HTTP reste celui du POC jusqu’à MIG-03.

Fusionné (#102) : contrat `ConnectorManifest` et `ConnectorLifecycle` (`src/domain/connector.ts`) ; adaptateur `createTypedConnectorRegistry` (`src/application/connectors.ts`) autour du registre du POC, sans changer protocoles, sessions ni temporisations. Le serveur POC n'utilise pas encore l'adaptateur : branchement progressif à partir de MIG-02.2/MIG-03.

- MIG-02.1.1 Extraire types, validations et contrats de cycle de vie : ouvrir, lire, commander, fermer.
- MIG-02.1.2 Adapter le registre existant ; conserver identifiants, capacités, temporisations et corrélations.
- MIG-02.1.3 Garder inconnue toute donnée non remontée ; ne pas inventer état, couleur, consigne ou succès.

### MIG-02.2 · Migration fabricant par fabricant

**CC2 fusionnée (#103)** : session MQTT, identité et sondes dans `connectors/elegoo/src/monitor.ts`, inventaire/téléchargement/lancement dans `files.ts`. Les points d’entrée POC sont des adaptateurs de composition ; le serveur existant passe déjà par ces modules typés, une seule implémentation du protocole. Helpers communs de projection (chauffe/CANVAS), décodage HTTP et transfert segmenté CC1/CC2 injectés, sans copie ni migration de CC1. Ports internes initiaux dans `packages/connector-sdk`, workspaces privés ; SDK public, manifestes/fiches autonomes et chaîne complète de conformité restent à compléter aux jalons dédiés, pas déclarés livrés par cette extraction.

Validation locale Node 24 : types, lint, **154 tests**, licences et navigation. Pas de commande matérielle, de déploiement ni de nouvelle validation firmware. Recette courte après mise à jour : températures/CANVAS, liste interne, téléchargement et pause/stop sur une fabrication supervisée. **P2S LAN fusionnée (#104)** : session MQTT/TLS, corrélation `sequence_id`, refus `bambu-authorization` et sondes dans `connectors/bambu/src/monitor.ts` ; inventaire FTPS, téléchargement, envoi et lancement dans `files.ts`. `poc/bambu.mjs` et `poc/bambu-files.mjs` deviennent des adaptateurs ; certificat, projection des contrôles et AMS injectés. Caméra P2S, découverte et pilote cloud inchangés. 157 tests. Recette courte après mise à jour : télémétrie/AMS, liste FTPS, téléchargement, pause/reprise/arrêt supervisés et refus d'autorisation en mode non développeur.

**Moonraker fusionnée (#105)** (première partie de MIG-02.2.2) : supervision HTTP, Pause/Reprise/Cancel, fichiers natifs et terminal dans `connectors/moonraker/src/index.ts`. `poc/moonraker.mjs` compose le module avec les helpers HTTP/fichiers communs, sans implémentation parallèle ; exports utilitaires conservés pour les autres appelants. Aucun changement du registre, de la découverte ou des contrôles partagés. Ports HTTP internes ajoutés au SDK, workspace privé sans nouvelle dépendance externe. **164 tests** locaux Node 24, typage/lint/licences/navigation vérifiés. Pas de déploiement ni de commande matérielle. Recette physique après mise à jour demandée ; OctoPrint et PrusaLink ont suivi dans #106.

**OctoPrint et PrusaLink fusionnés (#106)** (deuxième partie de MIG-02.2.2) : lecture, Pause/Reprise/Cancel, fichiers et terminal OctoPrint dans `connectors/octoprint/src/index.ts` ; statut, commandes sur la tâche courante et stockages PrusaLink dans `connectors/prusalink/src/index.ts`. `poc/octoprint.mjs` et `poc/prusalink.mjs` deviennent des adaptateurs composés avec les helpers HTTP/fichiers communs ; exports, endpoints, délais, intervalle 5 s et tolérances de sonde inchangés, aucune capacité ajoutée. **170 tests** locaux, typage/lint/licences/navigation vérifiés. Pas de déploiement ni de commande matérielle. La dernière extraction CC1/xTool/Ray5/Bambu Cloud est décrite ci-dessous.

**CC1, xTool M2, Longer Ray5 et pilote Bambu Cloud fusionnés (#107)** (dernière partie de MIG-02.2.2) : SDCP et transfert segmenté partagé Elegoo dans `connectors/elegoo/src/cc1.ts` et `upload.ts` ; session, découverte et caméra M2 dans `connectors/xtool/src/` ; GRBL TCP/ESP3D et carte SD Ray5 dans `connectors/longer/src/` ; HTTPS d’authentification/inventaire et suivi MQTT cloud dans `connectors/bambu/src/cloud-http.ts` et `cloud-monitor.ts`. Les adaptateurs POC composent ces implémentations uniques. Gestion des comptes, chiffrement, autorisations et journaux restent au POC jusqu’à MIG-03. CC1 conserve les copies FabCore, M2 son absence de transfert natif, ESP3D ses contrôles non exposés et Bambu Cloud la lecture seule. Aucun élargissement de capacités ni nouvelle dépendance externe. **191 tests** locaux Node 24, typage/lint/licences vérifiés ; navigation actualisée. Pas de commande matérielle ni de déploiement. MIG-02.2.2 sera fusionné après acceptation de cette PR ; la vérification transversale MIG-02.2.3 reste à mener avant MIG-03. Point préexistant relevé en revue à traiter à ce jalon : rejet des enveloppes MQTT cloud JSON non objet (notamment `null`) avant accès aux champs ; le typage ne valide pas à lui seul les données réseau.

**MIG-02.2.3 fusionnée (#109)** · fiabilisation du cycle de vie. Défauts corrigés : (1) une lecture de supervision lancée avant la suppression ou la modification d'une machine pouvait, après le chargement du connecteur, rouvrir une session avec l'ancienne configuration que plus rien ne fermait — `registry.read(kind, machine)` vérifie désormais que la machine est toujours celle du stockage (`isCurrent`) et le serveur l'utilise pour `GET /api/machines` et la supervision périodique ; une machine seulement remplacée (bobine, édition) garde son dernier état au lieu d'un faux « hors ligne » ; (2) P2S, CC2 et xTool M2 pouvaient rouvrir une session après `close()` ; ils refusent désormais tout appel tardif, comme Ray5 et Bambu Cloud. Tests ajoutés : isolation P2S entre deux machines, reconnexion P2S sans état périmé ni renvoi, absence de réouverture après fermeture pour P2S/CC2/M2/Ray5, fermeture CC2 pendant l'identification, lecture concurrente du registre. Vérification négative : les cinq tests visés échouent sans les corrections. **200 tests**. Couverture déjà existante conservée : isolation CC2/Moonraker, reconnexion Ray5 sans rejeu, perte de réponse inconnue sur tous les connecteurs. Moonraker, OctoPrint et PrusaLink (HTTP) et CC1 (WebSocket ouvert puis fermé à chaque lecture/commande) n'ont pas de session persistante ; isolation par origine testée pour Moonraker. Recette physique à faire après déploiement : suppression et modification d'une machine connectée sans connexion résiduelle (journal diagnostic), coupure réseau puis retour sur P2S et CC2.

- MIG-02.2.1 Migrer d'abord CC2 et P2S LAN dans deux étapes séparées, avec les tests des fichiers internes et refus d'autorisation.
- MIG-02.2.2 Migrer Moonraker, OctoPrint/PrusaLink, puis les autres connecteurs et le pilote cloud sans élargir leurs capacités.
- MIG-02.2.3 Vérifier fermeture des sessions, isolation des machines, déconnexion et reconnexion sans état périmé ni rejeu.

**Sortie :** parité des tests et des contrats, tableau fabricant actualisé ; essais physiques ciblés sur les comportements touchés. **Retour arrière :** revenir au connecteur précédent par version déployée, sans deux connexions concurrentes.

## MIG-03 · Découper le backend et documenter l'API

### MIG-03.1 · Services et routes

**Socle HTTP fusionné (#110)** (première étape) : `src/http/app.ts` → `createHttpApp`, Fastify 5 en étrangleur (ADR 0002). Le serveur public reste `node:http` du POC ; il délègue à Fastify uniquement les routes migrées (méthode et chemin exacts), le reste passe par le routeur POC sans changement. Centralisé dans le socle : en-têtes de sécurité, refus d'hôte (421), gardes `signedIn`/`admin` (401 `sign-in`, 403 `forbidden`), format `{ error: code }`, erreur interne sans détail (500 `internal`), validation (400 `invalid`). Premières routes migrées, contrats inchangés : `GET /api/session` et `GET /api/diagnostics` (`src/http/routes/`), une seule implémentation. OpenAPI 3.1 générée depuis les schémas TypeBox : `GET /api/openapi.json` (session requise) et [`docs/api/openapi.json`](api/openapi.json) versionné, vérifié par `npm run check` et la CI (`npm run openapi` pour le régénérer). Dépendances ajoutées : `fastify`, `@fastify/swagger` (MIT). Prochaines étapes : routes de lecture (machines, notifications, journaux), puis écritures avec validation de corps, origine et limitation centralisées, puis commandes (MIG-03.2).

**Routes de lecture fusionnées (#111)** (deuxième étape) : `GET /api/machines` (`routes/fleet.ts`), `GET /api/notifications` (`routes/notifications.ts`), `GET /api/machines/{id}/logs` et `logs-download`, `GET /api/cloud-accounts`, `GET /api/cloud-accounts/{id}/logs` et `logs-download` (`routes/logs.ts`). Contrats inchangés, anciens blocs retirés du routeur POC. La délégation reconnaît maintenant les identifiants contraints (`:id([a-f0-9-]{36})`, même expression que le POC) : un identifiant invalide reste servi par le POC et répond comme avant. Pendant la migration, la logique métier reste dans le POC et est injectée : `listFleet` (registre de connecteurs, cache de supervision, flux caméra par session), réglages publics des notifications, journaux et module cloud (`cloudFailure` traduit `CloudError` ou `cloud-storage`). Extraction de ces services vers `src/application/` à l'étape « services ». OpenAPI : 9 chemins.

**Écritures comptes et notifications fusionnées (#113)** (troisième étape) : `POST /api/setup`, `/api/login`, `/api/logout`, `/api/observers` (`routes/accounts.ts`), `POST /api/notifications` et `/api/notifications/test` (`routes/notifications.ts`). Centralisé dans le socle et vérifié **avant la lecture du corps**, dans l'ordre du POC : droits éventuels, origine exacte (403 `origin`), `Content-Type: application/json` (415 `invalid`), installation déjà faite (409), limite de tentatives partagée avec le POC (429 `rate`), puis corps JSON objet de 4 Kio au plus (400 `invalid`). Les notifications gardent leur ordre propre (droits avant origine). Services injectés depuis le POC (`accounts`, `notificationService`) : jeton d'activation, scrypt, rotation et révocation de session, cookies, secrets jamais renvoyés. Parité démontrée par `poc/write-routes.test.mjs`, exécuté à l'identique sur l'ancien routeur et sur le nouveau. Restent servies par le POC : écritures machines (ajout, test, appairage, édition, suppression), bobine, découverte, actions cloud, fichiers, commandes et contrôles (MIG-03.2). OpenAPI : 14 chemins.

**Administration du parc en revue** (quatrième étape) : `POST /api/machines`, `/api/machines/test`, `/pair`, `/edit`, `/delete`, `POST /api/machines/{id}/spool`, `GET` et `POST /api/discovery` (`routes/machines.ts`). Ordres du POC conservés : écritures machines → origine, type de contenu, puis administrateur ; bobine et découverte → administrateur, puis origine et type de contenu ; tous avant lecture du corps. Service `machineAdmin` injecté depuis le POC, converti mécaniquement (mêmes conditions, codes et effets : sondes limitées à deux, appairage M2 exclusif, test CC2 mémorisé 60 s par session, doublons, limite de huit machines, fermeture des sessions et flux caméra à la suppression ou modification). Annulation par la fermeture de la requête conservée (`signal` lié à `close`), y compris pour la découverte. Parité démontrée par `poc/machine-writes.test.mjs` (cinq scénarios, identiques sur l'ancien et le nouveau routeur). Restent servies par le POC : actions des comptes cloud, fichiers et transferts, caméras, commandes, contrôles et terminal (MIG-03.2). OpenAPI : 20 chemins.

- MIG-03.1.1 Extraire authentification/utilisateurs, parc/connexions, télémétrie, commandes, fichiers/caméras, notifications et administration.
- MIG-03.1.2 Conserver les contrats HTTP existants pendant le remplacement progressif ; documenter REST en OpenAPI.
- MIG-03.1.3 Centraliser contrôles d'autorisation, validation, erreurs, délais et annulation des requêtes.

### MIG-03.2 · Commandes et diagnostic

- MIG-03.2.1 Maintenir confirmations, restrictions pendant fabrication, verrouillage par machine et absence de rejeu.
- MIG-03.2.2 Ajouter des identifiants de corrélation, niveaux de logs, masquage des secrets et rétention bornée ; journal par machine et compte.
- MIG-03.2.3 Tester observateur/admin, fichiers, flux, origine des requêtes, refus réseau et résultats inconnus.

**Sortie :** parité API et tests négatifs ; aucun faux succès ni secret dans les journaux. **Retour arrière :** application précédente compatible avec les données avant MIG-04.

## MIG-04 · PostgreSQL et migration des installations

### MIG-04.1 · Modèle et migrations

- MIG-04.1.1 Définir schéma versionné : utilisateurs, organisation/site/ferme, machines, connexions, comptes cloud, bobines manuelles et préférences.
- MIG-04.1.2 Préserver identifiants et liens ; poser contraintes d'unicité machine/connexion et droits d'accès.
- MIG-04.1.3 Isoler état courant, historique borné et métadonnées fichiers ; ne pas déplacer arbitrairement les gros fichiers dans SQL.

### MIG-04.2 · Import et sauvegarde

- MIG-04.2.1 Écrire un import `state.json` en simulation, puis transactionnel et idempotent, avec rapport d'anomalies sans secrets.
- MIG-04.2.2 Préserver mots de passe hachés, références de fichiers et secrets chiffrés avec leurs clés ; tester que les accès restent utilisables.
- MIG-04.2.3 Comparer comptes, machines et relations avant/après ; sauvegarder JSON, fichiers, clés et base ; répéter restauration sur copie.

**Sortie :** import reproductible sans perte et restauration prouvée ; même chemin PostgreSQL auto-hébergement/cloud. **Retour arrière :** arrêter les écritures, sauvegarder les changements intervenus, restaurer version et sauvegarde pré-migration. Aucun retour aveugle au JSON qui perdrait des changements.

## MIG-05 · Temps réel SSE

### MIG-05.1 · Événements

- MIG-05.1.1 Publier les changements d'état depuis les services, avec identifiants, horodatage et portée utilisateur/site/machine.
- MIG-05.1.2 Borne mémoire, fréquence et taille des messages ; isoler les abonnés lents.
- MIG-05.1.3 Définir reconnexion, reprise limitée et resynchronisation complète si l'historique a expiré.

### MIG-05.2 · Remplacement du polling

- MIG-05.2.1 Ajouter flux authentifié, heartbeat, nettoyage à la fermeture et tests de révocation des droits.
- MIG-05.2.2 Remplacer les interrogations navigateur périodiques ; conserver les lectures initiales et actualisations explicites utiles.
- MIG-05.2.3 Mesurer connexions, charge et fraîcheur sur un parc simulé ; ne pas ouvrir de caméra en arrière-plan.

**Sortie :** reconnexions sans fuite, parité des états et charge mesurée. **Retour arrière :** réactiver temporairement le rafraîchissement existant, sans doubler les abonnements machine.

## MIG-06 · React sans régression des parcours

### MIG-06.1 · Interface commune

- MIG-06.1.1 Reprendre identité, tokens, thèmes et catalogues FR/EN ; composants accessibles, formulaires et dialogues communs.
- MIG-06.1.2 Migrer navigation, vue d'ensemble et parc dense responsive ; toutes les machines visibles, pastilles compactes et multi-modules conservés.
- MIG-06.1.3 Migrer fiche avec six blocs stables, indisponibilités explicites, saisie préservée et contrôles selon droits/capacités.

### MIG-06.2 · Parcours complets

- MIG-06.2.1 Migrer fichiers : recherche/tri/pages, lecture, téléchargement, envoi, transfert simple/multiple et confirmations séparées de lancement.
- MIG-06.2.2 Migrer visualiseur et caméra ; libérer animations, ressources et abonnements à chaque navigation.
- MIG-06.2.3 Migrer comptes cloud/logs, diagnostics, notifications, accès et installation ; tests parcours, mobile, clavier et clair/sombre.

**Sortie :** matrice de parité complète et recette CC2/P2S sans régression ; aucune fonction pilote promue implicitement. **Retour arrière :** conserver une version antérieure complète et compatible avec le schéma, pas deux interfaces actives concurrentes sur les commandes.

## MIG-07 · Évolution et contribution

### MIG-07.1 · Contrats publiés

- MIG-07.1.1 Documenter types/versionnement, capacités, erreurs, sécurité et cycle de vie des connecteurs.
- MIG-07.1.2 Fournir un exemple de connecteur simulé et une suite de conformité ; documenter ajout d'un fabricant et recette par modèle.
- MIG-07.1.3 Mettre à jour OpenAPI, guides locaux, commandes et sources, procédures de contribution et matrice de compatibilité.

### MIG-07.2 · Limites de l'extensibilité

- MIG-07.2.1 Stabiliser les points d'extension internes ; ne pas charger de plugins tiers arbitraires.
- MIG-07.2.2 Reporter le SDK complet, l'isolation de plugins et le catalogue au développement complet.
- MIG-07.2.3 Garder production Kanban/planification dans #94 jusqu'à stabilisation du socle.

**Sortie :** un contributeur peut lancer les tests et ajouter un connecteur simulé sans lire tout le serveur. **Retour arrière :** contrats versionnés ; aucune installation de plugin utilisateur à convertir.

## MIG-08 · Bascule contrôlée

### MIG-08.1 · Packaging et exploitation

- MIG-08.1.1 Produire build reproductible, installation LXC, configuration minimale et contrôle de santé sans action machine.
- MIG-08.1.2 Ajouter sauvegarde préalable, migrations explicites, contrôle de version du schéma et procédure de restauration.
- MIG-08.1.3 Vérifier journaux bornés, rotation, secrets, expiration des sessions et limites réseau/fichiers.

### MIG-08.2 · Recette et livraison

- MIG-08.2.1 Répéter l'import sur copie puis les tests automatiques et les scénarios admin/observateur, pertes réseau et reconnexions.
- MIG-08.2.2 Effectuer une recette supervisée CC2/P2S : connexion, caméra, températures, fichiers, lancement, Pause/Stop et reprise uniquement si prise en charge.
- MIG-08.2.3 Mesurer un parc simulé, documenter les limites, répéter le rollback et préparer une release candidate.
- MIG-08.2.4 Faire valider la candidate avant fusion/déploiement demandé ; publier le bilan de parité et les réserves restantes.

**Sortie :** socle migré accepté et installation récupérable. La fin de cette migration n'équivaut pas à la livraison de toutes les fonctions commerciales du MVP.

## Préalable IA avant MIG-01

Organisation, carte et profils proposés dans [docs/ai/WORKFLOW.md](ai/WORKFLOW.md). Le [pilote Serena](ai/SERENA.md) reste facultatif et évalué séparément ; ni serveur de production ni dépendance runtime ajoutés. Valider ce préalable avant les changements techniques du MVP.

## Première action après validation du plan

Ouvrir une PR MIG-01.1 de décisions et contrats, puis MIG-01.2 pour l'outillage minimal. Ne pas commencer par réécrire les connecteurs, déplacer tout le dépôt ou changer les dépendances en bloc.
