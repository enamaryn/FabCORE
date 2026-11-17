# Phase 2 · MVP — produit utilisable au quotidien

**État : planifié.** Démarre après la clôture du [POC](POC.md#poc-11--clôture-du-poc-et-passage-au-mvp).
Objectif ([prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-mvp--produit-utilisable)) : un produit assez fiable pour un usage réel, sans repousser la sécurité ni les autorisations.

Le découpage suit la même convention que le [POC](POC.md#lire-ce-plan) : étapes `MVP-xx`, sous-étapes `MVP-xx.y`, états `À faire` · `En cours` · `Ouvert` · `Fusionné` · `Déployé` · `Testé matériel` · `Reporté`. L’ordre des étapes est l’ordre de travail recommandé. MVP-00 est un préalable bloquant.

## Vue d’ensemble

| Étape | Contenu | État |
| --- | --- | --- |
| MVP-00 | Cadrage et décisions d’architecture | En cours |
| MVP-01 | Socle technique et migration TypeScript | À faire |
| MVP-02 | Interface complète de la maquette UX/UI | À faire |
| MVP-03 | Installation, mise à jour et administration | À faire |
| MVP-04 | Comptes, rôles et permissions | À faire |
| MVP-05 | Connecteurs P0 validés modèle par modèle | À faire |
| MVP-06 | Supervision et pilotage | À faire |
| MVP-07 | Caméras | À faire |
| MVP-08 | Notifications et alertes | À faire |
| MVP-09 | Historique et fichiers | À faire |
| MVP-10 | Agent local et FabCore Cloud | À faire |
| MVP-11 | Offre professionnelle et tarification | À faire |
| MVP-12 | Sécurité, accessibilité et qualité | À faire |
| MVP-13 | Open source et documentation | À faire |
| MVP-14 | Bêta et recette de sortie | À faire |

## MVP-00 · Cadrage

En cours. Décisions prises le 17 novembre 2026, à consigner dans `docs/DECISIONS.md` lors de la création du socle. Restent le bilan du POC et la liste du matériel de recette.

- [ ] MVP-00.1 Bilan du POC ([POC-11](POC.md#poc-11--clôture-du-poc-et-passage-au-mvp)) : ce qui est conservé, réécrit ou abandonné.
- [x] MVP-00.2 Architecture · **décidé** : TypeScript strict sur Node.js LTS, monolithe modulaire, migration progressive module par module depuis le POC (pas de réécriture), tests verts à chaque étape. Les connecteurs du POC sont repris, pas réécrits.
- [x] MVP-00.3 Persistance · **décidé** : PostgreSQL en auto-hébergement comme en cloud (un seul chemin de code), installé par l’installateur, avec reprise du `state.json` du POC.
- [x] MVP-00.4 Interface et temps réel · **décidé** : React pour l’interface définitive ([MVP-02](#mvp-02--interface-complète-de-la-maquette-uxui)), SSE à la place de l’interrogation toutes les deux secondes.
- [x] MVP-00.5 Modèle d’hébergement · **décidé** :
  - Auto-hébergement gratuit, sans compte cloud, limité à **10 machines**.
  - Au-delà : **offre professionnelle** avec compte FabCore Cloud, agent local relié au compte et abonnement ([MVP-11](#mvp-11--offre-professionnelle-et-tarification)).
- [ ] MVP-00.6 Priorité des connecteurs et liste du matériel de recette disponible.
- [x] MVP-00.7 Licence et modèle économique · **décidé** : le code reste sous GPL-3.0. L’offre professionnelle vend le service FabCore Cloud et tout ce qui l’accompagne (hébergement, agent relié au compte, accès à distance, multi-ateliers, sauvegardes, support). La limite de 10 machines est le réglage de l’édition auto-hébergée, pas une protection technique.

## MVP-01 · Socle technique et migration TypeScript

À faire. Dépend de MVP-00. Le POC reste fonctionnel pendant toute la migration.

- [ ] MVP-01.0 Migration vers TypeScript :
  - [ ] Outillage : Node.js LTS, `tsconfig` strict, lint, formatage limité aux fichiers migrés.
  - [ ] Types partagés : machine, télémétrie, capacités, événements, erreurs.
  - [ ] Connecteurs du POC migrés un par un, tests existants conservés et verts.
  - [ ] Serveur HTTP et routes migrés, comportement inchangé.
- [ ] MVP-01.1 Structure du monolithe modulaire : présentation, authentification, utilisateurs, registre des machines, connecteurs, commandes, télémétrie, événements, notifications, fichiers, administration.
- [ ] MVP-01.2 Persistance et migrations versionnées, avec migration des installations POC.
- [ ] MVP-01.3 API REST documentée (OpenAPI).
- [ ] MVP-01.4 Temps réel (SSE ou WebSocket) sécurisé.
- [ ] MVP-01.5 Isolation des connecteurs : délais, reconnexions et erreurs indépendants par machine.
- [ ] MVP-01.6 i18n centralisée FR/EN : catalogues de traductions, dates et unités localisées, test de complétude.
- [ ] MVP-01.7 Application React : design system en tokens repris de [design/](../design/README.md), composants de base, thèmes sombre, clair et système, préférence par utilisateur.
- [ ] MVP-01.8 Intégration continue : tests, lint, typecheck et vérification des licences à chaque PR.

## MVP-02 · Interface complète de la maquette UX/UI

À faire. Dépend de MVP-01.7. Reconstruire en React tous les écrans, états et parcours du [prototype](../design/prototype.html) ([revue](../design/README.md)), reliés aux données réelles, en respectant les [règles produit et interface](PRODUCT.md). Chaque écran est livré quand sa fonction serveur existe (étapes suivantes). En attendant, il affiche clairement que la fonction n’est pas disponible, sans donnée fictive présentée comme réelle. Chaque écran est vérifié en FR/EN, en thème sombre et clair, sur desktop, tablette et mobile.

- [ ] MVP-02.1 Navigation : barre latérale desktop, barre mobile (Atelier, Machines, Alertes, Plus), page « Plus ».
- [ ] MVP-02.2 Connexion : compte local et Pocket ID / OIDC.
- [ ] MVP-02.3 Assistant d’installation en huit étapes (Activation, Administrateur, Connexion, Notifications, SMTP, Découverte, Machines, Vérification) :
  - [ ] États du jeton : saisie, expiré, refusé.
  - [ ] Pocket ID / OIDC, ntfy intégré ou externe, SMTP avec authentification.
  - [ ] Scan en cours, scan sans résultat, ajout manuel, nommage de deux machines identiques.
  - [ ] Installation terminée et bootstrap verrouillé.
- [ ] MVP-02.4 Vue d’ensemble de l’atelier : indicateurs, machines, activité récente.
- [ ] MVP-02.5 Parc : grille, liste, filtres, parc vide, filtre sans résultat, chargement, erreur de chargement.
- [ ] MVP-02.6 Fiche machine :
  - [ ] États disponible, en fabrication, en pause, en connexion, hors ligne, en erreur, terminée.
  - [ ] Pilotage en lecture seule pour l’observateur.
  - [ ] Confirmation d’annulation et des commandes sensibles.
- [ ] MVP-02.7 Ajout manuel et découverte depuis le parc.
- [ ] MVP-02.8 Caméras : galerie, caméra agrandie, caméra indisponible.
- [ ] MVP-02.9 Fabrications : en cours, en file, terminées.
- [ ] MVP-02.10 Bibliothèque de fichiers : liste, bibliothèque vide, ajout, transfert vers une machine admissible.
- [ ] MVP-02.11 Alertes et préférences, alertes lues.
- [ ] MVP-02.12 Historique, historique vide, accès à la machine concernée.
- [ ] MVP-02.13 Utilisateurs : liste, ajout, vue en lecture seule.
- [ ] MVP-02.14 Rôles et permissions.
- [ ] MVP-02.15 Paramètres généraux (langue, thème) et paramètres des services (OIDC, ntfy, SMTP).
- [ ] MVP-02.16 Catalogue de connecteurs et association à une machine.
- [ ] MVP-02.17 Fiches par famille : résine, laser et CNC, avec vocabulaire et commandes adaptés.
- [ ] MVP-02.18 États transverses : vides, chargement, erreurs, déconnexion, permissions insuffisantes, installation incomplète.
- [ ] MVP-02.19 Écrans du POC absents de la maquette : diagnostics, AMS et CANVAS, graphique des températures, fichiers de la machine, visualiseur G-code en direct, terminal, appairage xTool et vues caméra M2.
- [ ] MVP-02.20 Recette : les quatre scénarios de revue du [design](../design/README.md#scénarios-de-revue) (première installation, incident et contrôle, fichiers et rôles, mobile et préférences) sur données réelles.

## MVP-03 · Installation, mise à jour et administration

À faire.

- [ ] MVP-03.1 Logique de l’assistant de première installation (écrans en [MVP-02.3](#mvp-02--interface-complète-de-la-maquette-uxui)) : reprise après interruption, authentification locale, OIDC ou hybride, récupération d’accès, tests des services et verrouillage du bootstrap.
- [ ] MVP-03.2 CLI d’administration : `fabcore setup-token rotate`, récupération locale, diagnostic.
- [ ] MVP-03.3 Sauvegarde et restauration.
- [ ] MVP-03.4 Mise à jour avec migrations et procédure de retour arrière documentée.
- [ ] MVP-03.5 Healthchecks, journaux et diagnostics système.
- [ ] MVP-03.6 HTTPS derrière reverse proxy (dont Zoraxy) documenté.
- [ ] MVP-03.7 Docker Compose en cible secondaire, en plus du LXC Debian.

## MVP-04 · Comptes, rôles et permissions

À faire.

- [ ] MVP-04.1 Rôle Opérateur : pilotage, transfert et lancement sur les machines autorisées.
- [ ] MVP-04.2 Permissions par machine, groupe de machines, type de commande et utilisateur.
- [ ] MVP-04.3 Correspondance des groupes OIDC, assistant Pocket ID (découverte, test, association de l’administrateur).
- [ ] MVP-04.4 Gestion des utilisateurs : invitation par e-mail, désactivation, réinitialisation.
- [ ] MVP-04.5 Journal d’audit des opérations sensibles.
- [ ] MVP-04.6 Tests de permissions sur toutes les routes, flux vidéo et fichiers.

## MVP-05 · Connecteurs P0 validés modèle par modèle

À faire. Chaque connecteur déclare constructeur, modèles, firmware validé, protocole, authentification, capacités, limites et maturité (`Expérimental`, `Partiellement compatible`, `Validé`, `Non compatible`).

- [ ] MVP-05.1 Matrice de compatibilité `docs/COMPATIBILITY.md`, alimentée par la recette.
- [ ] MVP-05.2 Contrat des connecteurs stabilisé (capacités : découverte, état, événements, caméras, fichiers, lancement, pause, reprise, annulation, actions).
- [ ] MVP-05.3 Klipper/Moonraker : validé.
- [ ] MVP-05.4 Bambu Lab : P2S validée, puis A1, P1, X1. Fichiers et lancement.
- [ ] MVP-05.5 Elegoo CC1 et CC2 : commandes et fichiers selon le protocole.
- [ ] MVP-05.6 OctoPrint : événements, caméras, commandes.
- [ ] MVP-05.7 PrusaLink : fichiers et commandes.
- [ ] MVP-05.8 Creality : K1, K1C, K1 Max, K2, K2 Plus, Ender selon firmware.
- [ ] MVP-05.9 Anycubic, QIDI Tech, Sovol, Flashforge : étude des protocoles, puis connecteurs.
- [ ] MVP-05.10 Longer (laser) : supervision, sans lancement à distance.
- [ ] MVP-05.11 Simulateurs de toutes les marques visées (Bambu Lab, Elegoo, Creality, Prusa, Anycubic, QIDI Tech, Sovol, Flashforge, Longer, xTool, Klipper, OctoPrint) pour développer et tester sans matériel. Décidé le 17 novembre 2026 ([POC-11.9](POC.md#poc-11--clôture-du-poc-et-passage-au-mvp)).
- [ ] MVP-05.12 Recette sur matériel réel pour chaque connecteur avant le statut `Validé`. Un connecteur testé seulement sur simulateur reste `Expérimental`.

## MVP-06 · Supervision et pilotage

À faire.

- [ ] MVP-06.1 Durée écoulée, temps restant et travail en cours pour tous les connecteurs qui les fournissent.
- [ ] MVP-06.2 Annulation d’une fabrication avec confirmation.
- [ ] MVP-06.3 Températures, ventilateurs et déplacements d’axes selon capacités, avec confirmations.
- [ ] MVP-06.4 Terminal G-code étendu aux autres connecteurs compatibles après validation.
- [ ] MVP-06.5 Vues grille et liste du parc.

## MVP-07 · Caméras

À faire.

- [ ] MVP-07.1 Vue globale de toutes les caméras.
- [ ] MVP-07.2 Plein écran et reconnexion automatique du flux.
- [ ] MVP-07.3 Permissions par caméra.
- [ ] MVP-07.4 Étude WebRTC pour réduire la latence et éviter le transcodage.

## MVP-08 · Notifications et alertes

À faire.

- [ ] MVP-08.1 Alertes automatiques : fabrication terminée ou en erreur, machine déconnectée ou reconnectée, température anormale, intervention requise.
- [ ] MVP-08.2 Centre de notifications dans l’interface.
- [ ] MVP-08.3 Préférences par utilisateur et par machine.
- [ ] MVP-08.4 PWA et Web Push (service worker, VAPID, gestion des abonnements, test).
- [ ] MVP-08.5 ntfy : surveillance de l’état, désactivation et reconfiguration depuis l’interface.
- [ ] MVP-08.6 Modèles d’e-mails FR/EN : invitations, alertes, sécurité.

## MVP-09 · Historique et fichiers

À faire.

- [ ] MVP-09.1 Historique persistant des fabrications et événements, filtrable.
- [ ] MVP-09.2 Bibliothèque de fichiers FabCore et transfert vers plusieurs machines.
- [ ] MVP-09.3 Visualiseur : fichiers de la carte SD et des autres connecteurs lorsque leur contenu est lisible.

## MVP-10 · Agent local et FabCore Cloud

À faire · [Ticket #30](https://github.com/enamaryn/FabCORE/issues/30). Un agent par atelier, sur Raspberry Pi ou LXC, découvre les machines et remonte leur télémétrie par une connexion sortante authentifiée.

- [ ] MVP-10.1 Architecture agent / serveur et protocole de liaison.
- [ ] MVP-10.2 Appairage de l’agent avec un atelier.
- [ ] MVP-10.3 Découverte et supervision par l’agent.
- [ ] MVP-10.4 Suivi navigateur fermé et commandes relayées sans renvoi automatique.
- [ ] MVP-10.5 Reconnexion après coupure.
- [ ] MVP-10.6 Isolation entre deux ateliers qui utilisent les mêmes adresses privées.
- [ ] MVP-10.7 Pilote sur un atelier réel.

## MVP-11 · Offre professionnelle et tarification

À faire. Dépend de MVP-00.5, MVP-00.7 et MVP-10.

- [ ] MVP-11.1 Limite de 10 machines en auto-hébergement : comptage côté serveur, message clair à l’ajout de la 11e machine, aucune machine existante désactivée.
- [ ] MVP-11.2 Comptes FabCore Cloud : inscription, organisation, ateliers.
- [ ] MVP-11.3 Passage de l’auto-hébergement à l’offre professionnelle : appairage de l’agent, reprise des machines et des réglages.
- [ ] MVP-11.0 Positionnement face à la concurrence :
  - [ ] Étude des offres cloud existantes : [SimplyPrint](../design/README.md#benchmark) (relevé initial), OctoEverywhere, Obico et autres acteurs pertinents. Fonctions, matériel pris en charge, auto-hébergement, prix.
  - [ ] Différences de FabCore à mettre en avant (open source, auto-hébergement gratuit, lasers et CNC) et fonctions attendues absentes du plan (par exemple tranchage dans le cloud, file d’impression).
  - [ ] Décisions reportées dans le plan (MVP ou [développement complet](FULL-DEVELOPPEMENT.md)).
- [ ] MVP-11.4 Grille tarifaire (par machine, par atelier ou par paliers) et période d’essai, en s’appuyant sur MVP-11.0.
- [ ] MVP-11.5 Abonnement et paiement via un prestataire, factures.
- [ ] MVP-11.6 Isolation des données entre clients, sauvegardes du cloud.
- [ ] MVP-11.7 Conditions d’utilisation, politique de confidentialité et conformité RGPD.

## MVP-12 · Sécurité, accessibilité et qualité

À faire.

- [ ] MVP-12.1 Audit sécurité : CSRF, SSRF, WebSocket, flux vidéo, secrets, limitation des tentatives.
- [ ] MVP-12.2 Tests de non-régression des parcours principaux.
- [ ] MVP-12.3 Tests responsive (desktop, tablette, mobile) et i18n.
- [ ] MVP-12.4 Accessibilité WCAG 2.2 AA dans les deux thèmes.

## MVP-13 · Open source et documentation

À faire.

- [ ] MVP-13.1 Licence confirmée selon MVP-00.7, après vérification des licences des dépendances.
- [ ] MVP-13.2 `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- [ ] MVP-13.3 Modèles d’issues et de PR.
- [ ] MVP-13.4 Documentation utilisateur et guide d’installation FR/EN.
- [ ] MVP-13.5 Documentation développeur et guide des connecteurs.
- [ ] MVP-13.6 Vérification du nom (dépôts, domaines, marques), sans valeur juridique.

## MVP-14 · Bêta et recette de sortie

À faire.

- [ ] MVP-14.1 Bêta sur au moins un atelier réel en auto-hébergement et un en offre professionnelle via l’agent.
- [ ] MVP-14.2 Critères de sortie : parcours du [résultat recherché](../MASTER_PROMPT_ORIGIN.md#21-résultat-recherché) réalisable de bout en bout.
- [ ] MVP-14.3 Bilan et cadrage du [développement complet](FULL-DEVELOPPEMENT.md).
