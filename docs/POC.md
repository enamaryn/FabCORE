# Phase 1 · POC — preuve de concept

**État : phase active, développement terminé, recette matérielle en cours.**
Objectif ([prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-poc--preuve-de-concept)) : vérifier les risques techniques sur du matériel réel avant le [MVP](MVP.md).

**Prochaine action :** dérouler la recette [POC-10](#poc-10--recette-matérielle-sur-le-lxc) sur le LXC, en commençant par le terminal (POC-10.1) et les fichiers (POC-10.2).

## Correctif de dépendance FTP · 19 novembre 2026

Mise à jour proposée de `basic-ftp` 5.3.1 vers `^6.2.6`, verrouillée en 6.2.6, à la suite du signalement utilisateur. Avis concernés : [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r), [GHSA-5pm8-86m8-9m6r](https://github.com/advisories/GHSA-5pm8-86m8-9m6r) et [GHSA-r4jh-29pc-gfqr](https://github.com/advisories/GHSA-r4jh-29pc-gfqr).

Vérifications locales : 54 tests réussis, `npm audit` sans vulnérabilité signalée, constructeur et parseur MLSD réels vérifiés, y compris un champ `__proto__` sans exception. Aucun transfert matériel effectué. Valentin rapporte avoir installé cette version et passé les 54 tests sur son LXC ; l’IA n’a pas modifié le LXC. Le transfert réel P2S reste dans la recette POC-10. Prochaine action : fusionner le correctif pour aligner les installations et l’installateur sur la dépendance corrigée.

## Lire ce plan

- **Phase** : POC, puis [MVP](MVP.md), puis [développement complet](FULL-DEVELOPPEMENT.md).
- **Étape** : un jalon identifié `POC-xx`, livré par une ou plusieurs PR.
- **Sous-étape** : `POC-xx.y`, un résultat vérifiable.
- **États** : `À faire` · `En cours` · `Ouvert` (PR en revue) · `Fusionné` · `Déployé` · `Testé matériel` · `Reporté`. Une sous-étape cochée est fusionnée. Elle n’est **testée** que si la mention `Testé matériel` figure.

## Vue d’ensemble

| Étape | Contenu | État |
| --- | --- | --- |
| POC-00 | Design UX/UI et identité | Fusionné |
| POC-01 | Activation et Klipper | Fusionné |
| POC-02 | Bambu Lab P2S | Fusionné |
| POC-03 | Elegoo CC1 et CC2 | Fusionné |
| POC-04 | Découverte réseau | Fusionné · recette en cours |
| POC-05 | Caméras | Fusionné · M2 testée matériel |
| POC-06 | Pause, reprise et rôles | Fusionné |
| POC-07 | Pocket ID et OIDC | Fusionné |
| POC-08 | ntfy et SMTP | Fusionné |
| POC-08b | Connecteurs supplémentaires et parc | Fusionné · recette en cours |
| POC-09 | Fichiers, visualiseur et terminal G-code | Fusionné · recette à faire |
| POC-10 | Recette matérielle sur le LXC | En cours |
| POC-11 | Clôture du POC et passage au MVP | À faire |

## POC-00 · Design UX/UI et identité

Référence : [design/](../design/README.md) · PR [#1](https://github.com/enamaryn/FabCORE/pull/1) · Fusionné.

- [x] POC-00.1 Benchmark, parcours et navigation (UX-0).
- [x] POC-00.2 Identité visuelle : trois concepts de logo, palette sombre et claire, déclinaisons favicon, PWA et avatar (UX-1, [design/brand](../design/brand)).
- [x] POC-00.3 Prototype interactif FR/EN, desktop et mobile (UX-2, [design/prototype.html](../design/prototype.html)).

## POC-01 · Activation et Klipper

PR [#2](https://github.com/enamaryn/FabCORE/pull/2), [#3](https://github.com/enamaryn/FabCORE/pull/3) · Fusionné.

- [x] POC-01.1 Jeton d’activation affiché dans le terminal, usage unique, expiration de 15 minutes.
- [x] POC-01.2 Création atomique du premier administrateur, sessions sécurisées.
- [x] POC-01.3 Adaptateur Moonraker : télémétrie, états Klippy, erreurs distinguées.
- [x] POC-01.4 Installation Debian/LXC, `fabcore-update` (PR [#16](https://github.com/enamaryn/FabCORE/pull/16), [#26](https://github.com/enamaryn/FabCORE/pull/26), [#33](https://github.com/enamaryn/FabCORE/pull/33)).

## POC-02 · Bambu Lab P2S

PR [#4](https://github.com/enamaryn/FabCORE/pull/4) · Fusionné.

- [x] POC-02.1 MQTT local avec code LAN, état et progression.
- [x] POC-02.2 Travail terminé ou effacé correctement affiché (PR [#18](https://github.com/enamaryn/FabCORE/pull/18)).
- [x] POC-02.3 AMS : emplacements, matière, couleur, emplacement actif (PR [#20](https://github.com/enamaryn/FabCORE/pull/20), [#22](https://github.com/enamaryn/FabCORE/pull/22)).
- [x] POC-02.4 Stabilité de la réponse P2S sur la durée · **Testé matériel** : suivi d’une impression complète de 9 heures et des températures confirmé par Valentin le 18 novembre 2026.

## POC-03 · Elegoo Centauri Carbon 1 et 2

PR [#5](https://github.com/enamaryn/FabCORE/pull/5) · Fusionné.

- [x] POC-03.1 CC2 en MQTT avec session persistante (PR [#12](https://github.com/enamaryn/FabCORE/pull/12), [#13](https://github.com/enamaryn/FabCORE/pull/13)).
- [x] POC-03.2 CC1 en WebSocket.
- [x] POC-03.3 Deux CC2 distinctes identifiées par numéro de série.
- [x] POC-03.4 CANVAS : emplacements et matière.
- [x] POC-03.5 Ajout d’une CC2 sans reconnexion après un test réussi : le test est réutilisé pendant une minute si l’adresse et le code LAN correspondent (PR [#43](https://github.com/enamaryn/FabCORE/pull/43)).

## POC-04 · Découverte réseau

PR [#6](https://github.com/enamaryn/FabCORE/pull/6), [#29](https://github.com/enamaryn/FabCORE/pull/29), [#38](https://github.com/enamaryn/FabCORE/pull/38), [#41](https://github.com/enamaryn/FabCORE/pull/41), [#45](https://github.com/enamaryn/FabCORE/pull/45) · Fusionné · recette en cours.

- [x] POC-04.1 Scan limité aux réseaux privés, sur action de l’administrateur, annulable.
- [x] POC-04.2 Machines déjà ajoutées signalées, machine supprimée redécouvrable.
- [x] POC-04.3 « Ajouter une machine » ouvre la découverte, avec le choix entre scan et saisie manuelle.
- [x] POC-04.4 Numéro de série affiché en lecture seule quand le scan ou le test le fournit (PR [#39](https://github.com/enamaryn/FabCORE/pull/39), [#40](https://github.com/enamaryn/FabCORE/pull/40)).
- [x] POC-04.5 Découverte UDP V2 de la xTool M2 : modèle et numéro de série avant la connexion de suivi.
- [x] POC-04.6 OctoPrint trouvé sur le réseau réel · **Testé matériel**.

## POC-05 · Caméras

PR [#7](https://github.com/enamaryn/FabCORE/pull/7), [#14](https://github.com/enamaryn/FabCORE/pull/14), [#17](https://github.com/enamaryn/FabCORE/pull/17), [#49](https://github.com/enamaryn/FabCORE/pull/49), [#51](https://github.com/enamaryn/FabCORE/pull/51), [#52](https://github.com/enamaryn/FabCORE/pull/52), [#53](https://github.com/enamaryn/FabCORE/pull/53) · Fusionné.

- [x] POC-05.1 Elegoo : flux MJPEG relayé.
- [x] POC-05.2 Bambu P2S : RTSPS relayé en MJPEG via FFmpeg (port TCP 322).
- [x] POC-05.3 Aperçu unique à l’ouverture de la fiche, vidéo sur « Voir la caméra », relais partagé entre spectateurs.
- [x] POC-05.4 xTool M2 : vues angle (`side`, par défaut), centrale (`far`) et outil (`near`), vidéo H.264 sur `media_stream` · **Testé matériel** (confirmé le 17 novembre 2026).
- [x] POC-05.5 Réouverture des caméras M2 : start/stop ordonnés et acquittés, horodatages reconstruits par FFmpeg.

Notes de recette M2 :
- Le firmware testé refuse le port 8089 et fournit le H.264 sur `media_stream`, protocole 34, avec l’identifiant de la session instruction.
- `camera/list` associe `side` à 2, `near` à 1 et `far` à 0. Le lecteur utilise l’identifiant renvoyé par cette liste. Un échec de `filetransfer/finish` ne rejette plus un aperçu dont le transfert et le MD5 sont validés.
- Une cadence estimée erronée (1 200 000 images/s) bloquait le filtre fps. FFmpeg reçoit désormais explicitement du H.264 à la cadence de `camera/list`.

## POC-06 · Pause, reprise et rôles

PR [#9](https://github.com/enamaryn/FabCORE/pull/9) · Fusionné.

- [x] POC-06.1 Pause et reprise Moonraker, état vérifié après la commande, jamais de renvoi automatique.
- [x] POC-06.2 Rôles Administrateur et Observateur, droits vérifiés côté serveur.
- [x] POC-06.3 Journal de diagnostic global et par machine (PR [#19](https://github.com/enamaryn/FabCORE/pull/19)).

## POC-07 · Pocket ID et OIDC

PR [#10](https://github.com/enamaryn/FabCORE/pull/10) · Fusionné.

- [x] POC-07.1 Authorization Code Flow avec PKCE, state, nonce, issuer et audience.
- [x] POC-07.2 Identité liée à `issuer + subject`, compte local de secours conservé.

## POC-08 · ntfy et SMTP

PR [#11](https://github.com/enamaryn/FabCORE/pull/11) · Fusionné.

- [x] POC-08.1 ntfy interne (installé avec FabCore) ou externe.
- [x] POC-08.2 SMTP avec STARTTLS ou TLS.
- [x] POC-08.3 Notification de test. Les alertes automatiques de fabrication relèvent du MVP ([MVP-08](MVP.md#mvp-08--notifications-et-alertes)).

## POC-08b · Connecteurs supplémentaires et gestion du parc

Fusionné · recette en cours.

- [x] POC-08b.1 OctoPrint et PrusaLink en lecture, registre des connecteurs chargés à la demande (PR [#25](https://github.com/enamaryn/FabCORE/pull/25), [#29](https://github.com/enamaryn/FabCORE/pull/29), [contrat](../poc/CONNECTORS.md)).
- [x] POC-08b.2 xTool M2 : appairage par confirmation physique, jeton conservé côté serveur (PR [#15](https://github.com/enamaryn/FabCORE/pull/15), [#44](https://github.com/enamaryn/FabCORE/pull/44)). La confirmation sur la M2 a renvoyé `TOKEN_AUTHORIZED` et son identité · **Testé matériel**.
- [x] POC-08b.3 xTool M2 : session WebSocket persistante, heartbeat `user/ping`, état reçu en push au format `{mode: "Idle"}` (PR [#46](https://github.com/enamaryn/FabCORE/pull/46) à [#48](https://github.com/enamaryn/FabCORE/pull/48)). L’ancienne reconnexion toutes les 15 secondes provoquait des bips. Sans appairage, le firmware testé refuse l’identification WebSocket (code 406). Après appairage, il émet l’état en push puis acquitte `state/sync` avec une réponse vide. Référence : [ha-xtool](https://github.com/thecodingdad/ha-xtool/blob/main/docs/PROTOCOL.md).
- [x] POC-08b.4 Suppression d’une machine et réajout (PR [#35](https://github.com/enamaryn/FabCORE/pull/35)).
- [x] POC-08b.5 « Modifier la machine » dans l’en-tête de la fiche, suppression depuis la fenêtre de modification (PR [#37](https://github.com/enamaryn/FabCORE/pull/37)).

## POC-09 · Fichiers, visualiseur et terminal G-code

Tickets [#31](https://github.com/enamaryn/FabCORE/issues/31) et [#32](https://github.com/enamaryn/FabCORE/issues/32) · PR [#42](https://github.com/enamaryn/FabCORE/pull/42) et [#54](https://github.com/enamaryn/FabCORE/pull/54) · Fusionné · recette à faire.

- [x] POC-09.1 Fichiers de la machine (Moonraker, OctoPrint) : liste, envoi, lancement d’impression confirmé.
- [x] POC-09.2 Visualiseur par couches depuis la fiche machine : extrusions, déplacements à vide, zoom, déplacement.
- [x] POC-09.3 Suivi en direct : couche en cours, partie imprimée et position de la buse.
- [x] POC-09.4 Terminal G-code administrateur : réponses Moonraker, statut « Acceptée » OctoPrint, confirmation pendant une impression, débit borné, aucun renvoi automatique.

## POC-10 · Recette matérielle sur le LXC

### Extension fichiers et commandes · en développement

Demande du 18 novembre 2026 : étendre les fichiers, le visualiseur et les boutons Lancer, Pause/Reprendre et Stop au-delà de Moonraker/OctoPrint.

| Connecteur | Fichiers et lancement | Pause / reprise / stop |
| --- | --- | --- |
| Moonraker et OctoPrint | Liste, transfert, visualiseur, lancement | Les trois commandes |
| PrusaLink API v1 | Liste du stockage, transfert, lecture et lancement | Les trois commandes |
| Bambu P2S | FTPS, G-code et 3MF tranché à un plateau ; bobine externe confirmée | Les trois commandes via la session MQTT |
| Elegoo CC1 | Transfert HTTP, copies FabCore pour l’aperçu, lancement | Les trois commandes SDCP |
| Elegoo CC2 | Transfert HTTP, copies FabCore pour l’aperçu, lancement | Pause et stop via la session MQTT ; reprise sur l’écran machine |
| xTool M2 | Visualiseur G-code local ; lancement du projet déjà préparé sur la M2. Transfert natif `xf` non implémenté | Les trois commandes du protocole JS002 |

Ces ajouts sont expérimentaux tant que leur parcours n’est pas testé sur matériel réel. La supervision, les caméras et leur recette déjà acquise ne valident pas ces nouvelles commandes. Aucun essai d’envoi, de lancement, de pause ou d’arrêt n’est effectué sur le matériel pendant le développement. Les commandes restent administrateur, avec confirmation et sans renvoi automatique. Les limites de format et d’AMS/CANVAS sont détaillées dans le [contrat des connecteurs](../poc/CONNECTORS.md#fichiers-et-commandes-de-production).

En cours. Chaque sous-étape passe à `Testé matériel` une fois vérifiée sur la machine réelle, après déploiement de `main` sur le LXC.

- [ ] POC-10.1 Terminal (POC-09.4) :
  - [ ] Ender 3 (Moonraker) : `M105` affiche la réponse, `G28` est « Exécutée », une commande inconnue est « Refusée ».
  - [ ] OctoPrint : `M105` est « Acceptée ».
- [ ] POC-10.2 Fichiers et visualiseur (POC-09.1 à 09.3) :
  - [ ] Envoi, visualisation, lancement et suivi en direct sur l’Ender 3.
  - [ ] Même parcours sur OctoPrint. Vérifier que `/downloads/files/local/…` accepte la clé API.
  - [ ] Fichiers réels PrusaSlicer, Cura, Orca et Bambu Studio.
- [ ] POC-10.3 Découverte : CC2 avec et sans code LAN enregistré, P2S et deux Elegoo signalées comme déjà ajoutées.
- [x] POC-10.4 xTool M2 : appairage et trois caméras fonctionnels · **Testé matériel**, confirmé par Valentin le 18 novembre 2026.
- [ ] POC-10.5 Parc : suppression et réajout d’une CC2 **testés sur matériel**, confirmés par Valentin le 18 novembre 2026. Reste à vérifier explicitement l’ajout immédiatement après un test de connexion réussi.
- [x] POC-10.6 P2S : suivi stable des températures et d’une impression complète de 9 heures · **Testé matériel**, confirmé par Valentin le 18 novembre 2026 (POC-02.4).
- [ ] POC-10.7 Formulaire d’ajout dans le navigateur : numéro de série affiché, champs Bambu et CC1 disponibles.

## POC-11 · Clôture du POC et passage au MVP

À faire. Critères du [prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-poc--preuve-de-concept) :

- [x] POC-11.1 Une Bambu P2S connectée · **Testé matériel** : impression de 9 heures suivie dans FabCore, confirmation utilisateur du 18 novembre 2026.
- [ ] POC-11.2 Deux Elegoo CC2 distinctes, sans confusion entre machines.
- [ ] POC-11.3 Une machine Klipper.
- [ ] POC-11.4 Permissions vérifiées (administrateur, observateur, routes et flux). Séparation de l’interface constatée fonctionnelle à priori par Valentin le 18 novembre 2026 ; contrôles directs des autorisations serveur et des flux encore à vérifier.
- [ ] POC-11.5 Commandes fiables : pause, reprise, terminal, lancement, sans renvoi automatique.
- [ ] POC-11.6 Erreurs détectables : état hors ligne **testé sur matériel** en éteignant les deux CC2 (confirmation utilisateur du 18 novembre 2026). Restent l’accès refusé et le firmware en erreur.
- [x] POC-11.7 Authentification locale et Pocket ID/OIDC fonctionnelles · **Testé matériel** : les deux parcours ont été essayés et confirmés par Valentin le 18 novembre 2026.
- [ ] POC-11.8 Limites documentées dans le [guide](../poc/README.md) et la [matrice de compatibilité](MVP.md#mvp-05--connecteurs-p0-validés-modèle-par-modèle).
- [x] POC-11.9 Simulateurs et connecteurs des autres marques : **décidé**, reportés au [MVP-05](MVP.md#mvp-05--connecteurs-p0-validés-modèle-par-modèle) (17 novembre 2026).
- [ ] POC-11.10 Bilan technique et décisions d’architecture pour [MVP-00](MVP.md#mvp-00--cadrage).

[Guide d’exploitation et de configuration](../poc/README.md)
