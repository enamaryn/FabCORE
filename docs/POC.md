# Phase 1 · POC — preuve de concept

**État : phase active, complément de pilotage manuel en revue, recette matérielle en cours.**
Objectif ([prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-poc--preuve-de-concept)) : vérifier les risques techniques sur du matériel réel avant le [MVP](MVP.md).

**Prochaine action :** dérouler la recette [POC-10](#poc-10--recette-matérielle-sur-le-lxc) sur le LXC, en commençant par le terminal (POC-10.1) et les fichiers (POC-10.2).

## Fiche machine : cockpit compact · 19 novembre 2026

**État : ouvert, branche `feat/machine-cockpit`, non déployé.** Intégration de la maquette validée par Valentin : caméra/aperçu et filaments à gauche, fabrication, températures/consignes, actions rapides et déplacements à droite. Onglets « Vue machine », « Fichiers » et « Console » (si terminal disponible), mémorisés par machine durant la session. Fichiers chargés uniquement dans leur onglet ; aperçu uniquement en vue machine ; quitter cette vue ferme l’abonnement caméra du navigateur. « Choisir un fichier » ouvre l’onglet Fichiers. Navigation clavier des onglets et menu compte compact conservent les accès aux réglages, diagnostics, langue, thème et déconnexion.

Tous les modules AMS/CANVAS réels sont affichés en grille de deux colonnes, avec bobines fines et rapprochées ; un seul module occupe une carte à sa taille. Rien n’est limité artificiellement à quatre modules. L’affichage des cartes du parc reste inchangé. Sur mobile, les colonnes s’empilent ; sur les bureaux de faible hauteur, actions rapides et déplacements se placent côte à côte pour préserver la lisibilité. Une machine sans caméra ne réserve pas de colonne vide.

Commandes et droits inchangés : lumière en bascule, consigne à côté de la mesure avec Appliquer/Couper, croix X/Y et boutons Z avec pas 0,1/1/10 mm et origine. Les contrôles P2S/CC2 de déplacement restent désactivés et explicitement indisponibles ; aucune intégration de protocole supplémentaire. Les cibles ne sont pas remplacées pendant la saisie par les actualisations de télémétrie. Aucun fichier fictif ni image de maquette dans le produit.

Vérifications : 78 tests réussis (dont onglets isolés, quatre modules et saisie préservée), syntaxe JS et diff vérifiés. Chromium ne démarre pas dans l’environnement (socket interdit) : dimensions/rendu réels et interactions caméra/formulaires à vérifier après fusion sur desktop (1366 × 768 et 1920 × 1080), mobile, thèmes clair/sombre, avec 1 et 4 modules. Aucun déploiement ni commande réelle. Prochaine action : recette visuelle puis reprise de POC-10, sans nouvelle fonctionnalité de protocole.

## Contrôles manuels · 19 novembre 2026

**État : ouvert, branche `feat/machine-controls`, non déployé.** Panneau « Contrôles » sur la fiche, après caméra/télémétrie et fabrication/filaments. Éclairage et chauffe, puis déplacements et ventilateurs, selon les capacités réellement intégrées :

| Connecteur | Éclairage | Chauffe buse/plateau | Déplacements XYZ / origine | Ventilateurs |
| --- | --- | --- | --- | --- |
| Bambu P2S | Caisson, si remonté | Consignes et coupure | Non exposés dans ce jalon | Pièce, auxiliaire et caisson si remontés |
| Klipper/Moonraker | Objets LED déclarés (led, neopixel, dotstar, pca9533, pca9632) | Chauffages présents | Oui, pas 0,1/1/10 mm ; origine requise avant jog ; limites vérifiées | fan et fan_generic déclarés |
| OctoPrint | Pas de commande universelle | Chauffages remontés | Jog et origine natifs ; contrôle des limites confié au firmware | Pas de retour standard exploité |
| Elegoo CC2 | Lecture seule | Lecture seule | Non exposés | Lecture seule, vitesse et tr/min si remontés |
| CC1, PrusaLink, xTool M2 | Aucun nouveau contrôle dans ce jalon | — | — | — |

Plafonds logiciels : buse 260 °C, plateau 100 °C, abaissés si Klipper déclare une limite inférieure. Ces plafonds ne remplacent pas les protections firmware. Les consignes et retours d’état restent distincts ; jamais d’état optimiste. Seuls les administrateurs agissent, les observateurs lisent. Déplacements/origine bloqués pendant impression et pause, confirmation d’origine dans l’interface, confirmation supplémentaire pour chauffe/ventilateur pendant fabrication. Validation serveur, verrous communs aux commandes/envois, 30 actions/minute et intervalle de 500 ms, aucun rejeu automatique après perte de réponse. Les lectures du panneau sont espacées de dix secondes ; les sessions MQTT existantes restent partagées.

Références consultées : [OpenBambuAPI MQTT](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md), [G-code Bambu](https://github.com/Doridian/OpenBambuAPI/blob/main/gcode.md), [API Moonraker](https://moonraker.readthedocs.io/en/latest/external_api/printer/), [G-code Klipper](https://www.klipper3d.org/G-Codes.html), [états Klipper](https://www.klipper3d.org/Status_Reference.html), [API OctoPrint](https://docs.octoprint.org/en/main/api/printer.html). Dans [elegoo-link ec2d226](https://github.com/elegooofficial/elegoo-link/blob/ec2d2269b588608a1b9ccb4ff9627ddb758ea482/src/lan/adapters/elegoo_fdm_cc2/elegoo_fdm_cc2_message_adapter.cpp), HOME_AXES/1026, MOVE_AXES/1027, SET_TEMPERATURE/1028, SET_LIGHT/1029 et SET_FAN_SPEED/1030 sont commentés dans la table active : pas de boutons CC2 spéculatifs. L’adaptateur CC1 a la même restriction pour ces commandes.

Vérifications : 75 tests réussis, syntaxe JS et diff vérifiés. Tests de capacités et paramètres, plafonds, homing/bornes, payloads natifs, lumière Bambu sur le canal system et corrélation sans nouvelle session, droits/origine/état/confirmation/débit, absence de rejeu et interface observateur. Aucune commande réelle, aucun déploiement ; rendu navigateur et comportement matériel restent à vérifier. Prochaine action : fusion puis recette éclairage, consignes et coupure sur une machine disponible, avant ventilateurs et pas de déplacement de 0,1 mm. Reprendre ensuite POC-10.2 ; pas d’extension filament, laser ou cloud.

## Ajustement des pastilles · 19 novembre 2026

**État : ouvert, branche `fix/fleet-filament-layout`, non déployé.** Groupe posé à cheval sur le bord supérieur de la carte, sans libellé pour un module unique. Pastilles rapprochées avec chevauchement de 3 px et liseré séparateur. Au maximum un module représenté : celui contenant le filament actif, sinon le premier. En présence de plusieurs modules, seul un compteur « 2 CANVAS » ou « 3 AMS » est ajouté ; le détail reste sur la fiche. Le compteur reste visible sur mobile.

Vérifications : 68 tests réussis et diff sans erreur. Prochaine action : après fusion et mise à jour, vérifier le rendu desktop/mobile et le débordement supérieur, ainsi que le compteur si plusieurs modules sont connectés. Aucun déploiement effectué.

## Pastilles de filaments sur les cartes · 19 novembre 2026

**État : ouvert, branche `feat/fleet-filament-dots`, non déployé.** Les cartes de la vue d’ensemble et du parc affichent au-dessus du statut un groupe compact AMS/CANVAS, avec couleurs réelles et numéros des emplacements. Le texte s’adapte au contraste, le vide est pointillé et l’emplacement actif est entouré de vert. Plusieurs modules restent séparés et identifiés ; AMS HT conserve son nombre réel d’emplacements. Sans module déclaré, une pastille non numérotée représente la bobine simple. Si les données d’équipement manquent, l’interface le précise ; aucune couleur n’est inventée. Les connecteurs ne remontant pas la couleur d’une bobine externe affichent donc une pastille hachurée « couleur inconnue ». Pas de pastille sur le laser.

Vérifications : 67 tests réussis, contrôle syntaxique et diff sans erreur. Rendu navigateur/mobile à vérifier après fusion et mise à jour ; aucun déploiement. Prochaine action : contrôler les groupes de quatre pastilles P2S/CC2 CANVAS sur le parc et la vue d’ensemble, ainsi que le cas CC2 sans CANVAS et hors ligne.

## Téléchargement et transfert entre machines · 19 novembre 2026

**État : fusionné ([PR #70](https://github.com/enamaryn/FabCORE/pull/70)) et déployé par Valentin. Téléchargement et transfert simple validés par l’utilisateur ; transfert multiple et lancement après copie restent à vérifier.** Le panneau de fichiers propose « Télécharger » (octets originaux, y compris projet `.3mf`) et « Transférer » pour une ou plusieurs destinations compatibles avec le format. Les copies sont exécutées une à une, avec une ligne par machine : en attente, animation, ✓ vert ou ✕ rouge avec raison. La copie ne lance rien. Une fois le lot terminé, le même dialogue propose de ne rien lancer, de tout lancer sur les destinations disponibles, ou de sélectionner les impressions. Seules les copies réussies sont proposées ; le chemin réellement retourné par le stockage est conservé. Le lancement reprend les confirmations et contrôles serveur existants, dont la bobine externe Bambu/Elegoo.

Limites inchangées : fichiers listés/lisibles uniquement, copies FabCore pour Elegoo, pas de transfert natif xTool M2/résine/CNC sans connecteur compatible. Le transfert ne retranche pas le fichier pour les autres modèles. Un nom présent est refusé avant copie ; le fichier peut être renommé dans le dialogue. Les envois sont temporisés et jamais renvoyés automatiquement après un résultat inconnu. Les lots de l’interface ne sont pas des tâches persistantes : garder la page ouverte jusqu’au bilan.

Vérifications : 64 tests réussis, dont téléchargement authentifié, droits observateur/admin, origine, validation des chemins/formats, copie vers le bon hôte sans lancement, conflit de nom, taille inconnue/troncature/limites/interruption/nettoyage, original 3MF distinct du G-code de prévisualisation, échec partiel, progression séquentielle et lancement de la sélection ou de toutes les destinations éligibles une seule fois. Téléchargement et transfert simple confirmés ensuite par Valentin sur son installation ; aucune impression déclenchée par l’IA. Prochaine action : vérifier le dialogue de copie multiple et le lancement explicite sur le LXC (POC-10.2).

## Visualiseur : lecture et vue 3D · 19 novembre 2026

**État : ouvert, branche `feat/viewer-playback-3d`, non déployé.** Lecture/pause/recommencer avec marqueur de buse interpolé, vitesse indicative, rotation 3D des trajectoires à leur hauteur Z, zoom et déplacement. La simulation reste locale et désactive le suivi de couche réel. Le visualiseur ajuste son cadre à la hauteur disponible, avec commandes compactes et défilement interne des commandes sur petit écran.

Vérifications : 58 tests réussis, dont hauteurs des rampes/arcs, agrandissement des buffers, interpolation, pause/reprise, arrêt en quittant la page, projection et calcul de hauteur. Le navigateur de test est bloqué par l’environnement : rendu réel et interactions à vérifier après fusion/mise à jour du LXC, notamment à 1366 × 768, sur mobile et avec un gros fichier. La vitesse de lecture ne représente pas la durée machine (chauffe, attentes et accélérations non simulées) ; les mouvements purement verticaux sans déplacement XY restent hors du tracé du parseur. Prochaine action : recette du visualiseur puis poursuite de POC-10.2.

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
- [ ] POC-09.5 Contrôles manuels · ouvert (`feat/machine-controls`), voir la matrice en tête de ce document.

## Liste des fichiers · ergonomie du 19 novembre 2026

Recherche par nom/chemin dans la liste chargée, tri récent/ancien ou A–Z, cinq fichiers affichés par défaut et choix de vingt par page, navigation précédente/suivante et compteur de résultats. Les réglages sont propres à chaque machine durant la session. Les actions Visualiser et Lancer conservent la cible d’origine après filtrage, tri ou pagination. Les dates inconnues restent en dernier, sans date inventée.

Pour Elegoo, la liste reste celle des fichiers envoyés par FabCore : son état vide ne signifie pas que la machine ne contient aucun fichier préinstallé. Le libellé est corrigé en conséquence. Recette navigateur sur le LXC à confirmer ; aucun inventaire natif CC2 ajouté par ce changement. La demande d’inventaire natif pour toutes les familles est consignée dans PRODUCT.md et MVP-09.4/09.5. Dans le SDK elegoo-link consulté, GET_FILE_LIST/1044 est commenté ; cette référence ne suffit pas à implémenter une lecture fiable des fichiers de démonstration.

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
