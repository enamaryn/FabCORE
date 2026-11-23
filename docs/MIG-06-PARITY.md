# MIG-06 · Parité de l’interface React

Premier lot en revue, 23 novembre 2026. Branche `mig/06-react-shell`, base `d2ffde6` (#125). Migration progressive de l’ADR 0002 : aucune nouvelle fonction de pilotage, aucun déploiement pendant le développement.

## Accès et limites

Après fusion et mise à jour habituelle, ouvrir **`/app`** ou le lien **Vue atelier** de l’interface existante. La session serveur est commune ; aucune connexion aux machines depuis le navigateur. `/` conserve les parcours qui n’ont pas encore été migrés. Les liens d’une carte ouvrent la fiche exacte dans cette interface ; ajout, comptes cloud, diagnostics, notifications et observateurs y restent disponibles avec leurs droits et confirmations. Les paramètres des liens entrants sont limités aux valeurs prévues, jamais utilisés comme HTML ni chemin de fichier.

| Étape | État de ce lot | Suite |
| --- | --- | --- |
| 06.1.1 Identité, thèmes, i18n, composants | En revue : identité existante, FR/EN ICU, langues par dossier, thèmes clair/sombre/système, connexion locale avec œil à bascule, liens OIDC et installation | Dialogues et formulaires des autres parcours à porter avec leur écran |
| 06.1.2 Navigation, vue d’ensemble, parc | En revue : toutes les machines, grille dense à 1–4 colonnes selon largeur disponible, pastilles et activité reçue pendant la session | Recette navigateur et comparaison visuelle sur le parc utilisateur |
| 06.1.3 Cockpit six blocs | À faire, interface actuelle conservée | Saisies, capacités, droits et indisponibilités |
| 06.2.1 Fichiers et transferts | À faire, interface actuelle conservée | Recherche, pagination et lancements séparés |
| 06.2.2 Visualiseur et caméras | À faire, interface actuelle conservée | Ressources et abonnements à libérer |
| 06.2.3 Administration et installation | À faire, interface actuelle conservée | Comptes cloud/logs, diagnostics, notifications, accès et installation |

L’activité React est limitée aux changements d’état réellement reçus pendant la session ; elle n’est pas un journal historique persistant. Le parc n’ouvre aucune caméra. Les valeurs manquantes restent « Non communiqué ». Les modules réels priment sur une bobine manuelle ; celle-ci reste informative et sans numéro. Observateur : pas d’ajout de machine ni d’administration dans la navigation ; les contrôles serveur demeurent autoritaires.

## Architecture et mise à jour

- `web/src/App.tsx` : session, connexion/déconnexion, navigation et requêtes ; pas de nouvelle commande matérielle.
- `web/src/components/` : rendu React ; identité/CSS issus du prototype validé, styles de grille et pastilles dans `fleet.css`.
- `web/src/events.ts` : un SSE par instance de l’interface, invalidation REST regroupée à 1 s, sécurité à 30 s, secours à 2 s pendant la coupure. Relecture à la reconnexion ; arrêt des flux et timers au démontage. Les mutations de session ne sont pas rejouées automatiquement.
- `web/locales/<langue>/<namespace>.json` : i18next + ICU, repli anglais puis français ; tests de complétude FR/EN et de syntaxe ICU. Dates/nombres/unités avec `Intl`.
- `src/http/web-build.ts` : build Vite dédupliqué et ressources servies depuis une table de fichiers compilés, aucun accès à un chemin fourni par le client. Empreinte des sources, du verrouillage et de l’identité pour reconstruire après mise à jour. Cache d’un échec de build jusqu’au redémarrage, pour éviter des compilations répétées par des requêtes entrantes.
- `web/dist` est généré localement et ignoré par Git. Le premier accès à `/app` peut donc attendre la compilation. `npm run build:web` permet de la préparer ; `npm run dev:web` lance Vite sur loopback avec proxy API vers le serveur local.
- Les outils de build sont des dépendances de développement ; les scripts d’installation et de mise à jour utilisent explicitement `--include=dev`, même si `NODE_ENV=production`. Le mécanisme paresseux sert aussi le premier update exécuté par un ancien script, sans demander une deuxième commande.
- Vite **7.3.8**, branche toujours maintenue pour correctifs importants et sécurité ([éditeur](https://vite.dev/releases)). Vite 8 introduisait Lightning CSS/MPL non admis par le contrôle actuel : la politique de licences n’a pas été affaiblie pour ce lot. Aucune dépendance déjà verrouillée n’est mise à jour ; les ajouts sont limités au frontend prévu par les ADR.

## Vérifications

Tests versionnés : `web/test/api.test.ts`, `events.test.ts`, `components.test.mjs`, `poc/react-pages.test.mjs`.

Ils couvrent : refus de session/écriture sans répétition, réponses invalides et annulation, SSE regroupement/secours/reconnexion/nettoyage, parité des catalogues et syntaxe ICU, SSR des huit machines sans limite de six, droits observateur, valeurs inconnues, échappement, pastilles/compteur/priorité/couleurs, routes et fichiers compilés sans CDN, garde d’hôte, confinement et liens entrants autorisés. La revue indépendante a conduit à protéger le lien entrant par l’identité de session et à relire le parc à la reconnexion SSE.

Typage serveur + web, lint, tests, licences, OpenAPI, compilation et audit npm sont exécutés avant PR ; résultat exact dans la description. Les cinq tests PostgreSQL locaux nécessitent `FABCORE_TEST_DATABASE_URL` et sont exécutés par la CI avec PostgreSQL 16.

**Limite de validation navigateur** : lancement Chromium tenté dans l’environnement de développement, bloqué par l’interdiction des sockets Unix (`ProcessSingleton`, EPERM). Aucun succès E2E ni capture de rendu n’est annoncé. Avant clôture 06.1.2 : connexion admin/observateur, clavier et mobile, trois/quatre colonnes, absence de débordement, FR/EN et trois thèmes, retour depuis la fiche, coupure/reprise SSE et déconnexion. Aucune commande ou recette physique pendant ce lot.
