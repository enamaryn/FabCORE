# Phase 2 · MVP — produit utilisable au quotidien

**État : planifié.** Démarre après la clôture du [POC](POC.md#poc-11--clôture-du-poc-et-passage-au-mvp).
Objectif ([prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-mvp--produit-utilisable)) : un produit assez fiable pour un usage réel, sans repousser la sécurité ni les autorisations.

Le découpage suit la même convention que le [POC](POC.md#lire-ce-plan) : étapes `MVP-xx`, sous-étapes `MVP-xx.y`, états `À faire` · `En cours` · `Ouvert` · `Fusionné` · `Déployé` · `Testé matériel` · `Reporté`. L’ordre des étapes est l’ordre de travail recommandé. MVP-00 est un préalable bloquant.

## Vue d’ensemble

| Étape | Contenu | État |
| --- | --- | --- |
| MVP-00 | Cadrage et décisions d’architecture | À faire |
| MVP-01 | Socle technique | À faire |
| MVP-02 | Installation, mise à jour et administration | À faire |
| MVP-03 | Comptes, rôles et permissions | À faire |
| MVP-04 | Connecteurs P0 validés modèle par modèle | À faire |
| MVP-05 | Supervision et pilotage | À faire |
| MVP-06 | Caméras | À faire |
| MVP-07 | Notifications et alertes | À faire |
| MVP-08 | Historique et fichiers | À faire |
| MVP-09 | Agent local et FabCore Cloud | À faire |
| MVP-10 | Sécurité, accessibilité et qualité | À faire |
| MVP-11 | Open source et documentation | À faire |
| MVP-12 | Bêta et recette de sortie | À faire |

## MVP-00 · Cadrage

À faire. Décisions à prendre avec le porteur du projet, consignées dans `docs/DECISIONS.md` (à créer à ce moment).

- [ ] MVP-00.1 Bilan du POC ([POC-11](POC.md#poc-11--clôture-du-poc-et-passage-au-mvp)) : ce qui est conservé, réécrit ou abandonné.
- [ ] MVP-00.2 Architecture cible. Le POC est en JavaScript sans framework avec un fichier `state.json`. Le prompt d’origine oriente vers TypeScript strict, React, PostgreSQL et un monolithe modulaire. Choisir entre une migration progressive et un nouveau socle.
- [ ] MVP-00.3 Persistance : PostgreSQL ou SQLite, avec reprise des données du POC.
- [ ] MVP-00.4 Temps réel : remplacer l’interrogation toutes les deux secondes par SSE ou WebSocket.
- [ ] MVP-00.5 Modèle d’hébergement. Le prompt d’origine impose l’auto-hébergement sans compte cloud obligatoire. Le [prompt consolidé](../MASTER_PROMPT.md#poc-mvp-et-suite) vise aussi un SaaS avec agent local. Confirmer que les deux coexistent et que l’auto-hébergement reste complet.
- [ ] MVP-00.6 Priorité des connecteurs P0 et liste du matériel de recette disponible.

## MVP-01 · Socle technique

À faire. Dépend de MVP-00.

- [ ] MVP-01.1 Structure du monolithe modulaire : présentation, authentification, utilisateurs, registre des machines, connecteurs, commandes, télémétrie, événements, notifications, fichiers, administration.
- [ ] MVP-01.2 Persistance et migrations versionnées, avec migration des installations POC.
- [ ] MVP-01.3 API REST documentée (OpenAPI).
- [ ] MVP-01.4 Temps réel (SSE ou WebSocket) sécurisé.
- [ ] MVP-01.5 Isolation des connecteurs : délais, reconnexions et erreurs indépendants par machine.
- [ ] MVP-01.6 i18n centralisée FR/EN : catalogues de traductions, dates et unités localisées, test de complétude.
- [ ] MVP-01.7 Design system en tokens repris de [design/](../design/README.md), thèmes sombre, clair et système, préférence par utilisateur.
- [ ] MVP-01.8 Intégration continue : tests, lint, typecheck et vérification des licences à chaque PR.

## MVP-02 · Installation, mise à jour et administration

À faire.

- [ ] MVP-02.1 Assistant de première installation complet, avec reprise après interruption :
  - [ ] Bienvenue, langue et jeton.
  - [ ] Administrateur et récupération d’accès.
  - [ ] Authentification locale, OIDC ou hybride.
  - [ ] Notifications (Web Push, ntfy) et SMTP.
  - [ ] Découverte et configuration des machines.
  - [ ] Récapitulatif, tests des services et verrouillage du bootstrap.
- [ ] MVP-02.2 CLI d’administration : `fabcore setup-token rotate`, récupération locale, diagnostic.
- [ ] MVP-02.3 Sauvegarde et restauration.
- [ ] MVP-02.4 Mise à jour avec migrations et procédure de retour arrière documentée.
- [ ] MVP-02.5 Healthchecks, journaux et diagnostics système.
- [ ] MVP-02.6 HTTPS derrière reverse proxy (dont Zoraxy) documenté.
- [ ] MVP-02.7 Docker Compose en cible secondaire, en plus du LXC Debian.

## MVP-03 · Comptes, rôles et permissions

À faire.

- [ ] MVP-03.1 Rôle Opérateur : pilotage, transfert et lancement sur les machines autorisées.
- [ ] MVP-03.2 Permissions par machine, groupe de machines, type de commande et utilisateur.
- [ ] MVP-03.3 Correspondance des groupes OIDC, assistant Pocket ID (découverte, test, association de l’administrateur).
- [ ] MVP-03.4 Gestion des utilisateurs : invitation par e-mail, désactivation, réinitialisation.
- [ ] MVP-03.5 Journal d’audit des opérations sensibles.
- [ ] MVP-03.6 Tests de permissions sur toutes les routes, flux vidéo et fichiers.

## MVP-04 · Connecteurs P0 validés modèle par modèle

À faire. Chaque connecteur déclare constructeur, modèles, firmware validé, protocole, authentification, capacités, limites et maturité (`Expérimental`, `Partiellement compatible`, `Validé`, `Non compatible`).

- [ ] MVP-04.1 Matrice de compatibilité `docs/COMPATIBILITY.md`, alimentée par la recette.
- [ ] MVP-04.2 Contrat des connecteurs stabilisé (capacités : découverte, état, événements, caméras, fichiers, lancement, pause, reprise, annulation, actions).
- [ ] MVP-04.3 Klipper/Moonraker : validé.
- [ ] MVP-04.4 Bambu Lab : P2S validée, puis A1, P1, X1. Fichiers et lancement.
- [ ] MVP-04.5 Elegoo CC1 et CC2 : commandes et fichiers selon le protocole.
- [ ] MVP-04.6 OctoPrint : événements, caméras, commandes.
- [ ] MVP-04.7 PrusaLink : fichiers et commandes.
- [ ] MVP-04.8 Creality : K1, K1C, K1 Max, K2, K2 Plus, Ender selon firmware.
- [ ] MVP-04.9 Anycubic, QIDI Tech, Sovol, Flashforge : étude, simulateurs, puis connecteurs selon le matériel disponible.

## MVP-05 · Supervision et pilotage

À faire.

- [ ] MVP-05.1 Durée écoulée, temps restant et travail en cours pour tous les connecteurs qui les fournissent.
- [ ] MVP-05.2 Annulation d’une fabrication avec confirmation.
- [ ] MVP-05.3 Températures, ventilateurs et déplacements d’axes selon capacités, avec confirmations.
- [ ] MVP-05.4 Terminal G-code étendu aux autres connecteurs compatibles après validation.
- [ ] MVP-05.5 Vues grille et liste du parc.

## MVP-06 · Caméras

À faire.

- [ ] MVP-06.1 Vue globale de toutes les caméras.
- [ ] MVP-06.2 Plein écran et reconnexion automatique du flux.
- [ ] MVP-06.3 Permissions par caméra.
- [ ] MVP-06.4 Étude WebRTC pour réduire la latence et éviter le transcodage.

## MVP-07 · Notifications et alertes

À faire.

- [ ] MVP-07.1 Alertes automatiques : fabrication terminée ou en erreur, machine déconnectée ou reconnectée, température anormale, intervention requise.
- [ ] MVP-07.2 Centre de notifications dans l’interface.
- [ ] MVP-07.3 Préférences par utilisateur et par machine.
- [ ] MVP-07.4 PWA et Web Push (service worker, VAPID, gestion des abonnements, test).
- [ ] MVP-07.5 ntfy : surveillance de l’état, désactivation et reconfiguration depuis l’interface.
- [ ] MVP-07.6 Modèles d’e-mails FR/EN : invitations, alertes, sécurité.

## MVP-08 · Historique et fichiers

À faire.

- [ ] MVP-08.1 Historique persistant des fabrications et événements, filtrable.
- [ ] MVP-08.2 Bibliothèque de fichiers FabCore et transfert vers plusieurs machines.
- [ ] MVP-08.3 Visualiseur : fichiers de la carte SD et des autres connecteurs lorsque leur contenu est lisible.

## MVP-09 · Agent local et FabCore Cloud

À faire · [Ticket #30](https://github.com/enamaryn/FabCORE/issues/30). Un agent par atelier, sur Raspberry Pi ou LXC, découvre les machines et remonte leur télémétrie par une connexion sortante authentifiée.

- [ ] MVP-09.1 Architecture agent / serveur et protocole de liaison.
- [ ] MVP-09.2 Appairage de l’agent avec un atelier.
- [ ] MVP-09.3 Découverte et supervision par l’agent.
- [ ] MVP-09.4 Suivi navigateur fermé et commandes relayées sans renvoi automatique.
- [ ] MVP-09.5 Reconnexion après coupure.
- [ ] MVP-09.6 Isolation entre deux ateliers qui utilisent les mêmes adresses privées.
- [ ] MVP-09.7 Pilote sur un atelier réel.

## MVP-10 · Sécurité, accessibilité et qualité

À faire.

- [ ] MVP-10.1 Audit sécurité : CSRF, SSRF, WebSocket, flux vidéo, secrets, limitation des tentatives.
- [ ] MVP-10.2 Tests de non-régression des parcours principaux.
- [ ] MVP-10.3 Tests responsive (desktop, tablette, mobile) et i18n.
- [ ] MVP-10.4 Accessibilité WCAG 2.2 AA dans les deux thèmes.

## MVP-11 · Open source et documentation

À faire.

- [ ] MVP-11.1 Licence GPL-3.0 confirmée après vérification des licences des dépendances.
- [ ] MVP-11.2 `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- [ ] MVP-11.3 Modèles d’issues et de PR.
- [ ] MVP-11.4 Documentation utilisateur et guide d’installation FR/EN.
- [ ] MVP-11.5 Documentation développeur et guide des connecteurs.
- [ ] MVP-11.6 Vérification du nom (dépôts, domaines, marques), sans valeur juridique.

## MVP-12 · Bêta et recette de sortie

À faire.

- [ ] MVP-12.1 Bêta sur au moins un atelier réel en auto-hébergement et un via l’agent.
- [ ] MVP-12.2 Critères de sortie : parcours du [résultat recherché](../MASTER_PROMPT_ORIGIN.md#21-résultat-recherché) réalisable de bout en bout.
- [ ] MVP-12.3 Bilan et cadrage du [développement complet](FULL-DEVELOPPEMENT.md).
