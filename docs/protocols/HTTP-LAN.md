# API HTTP locales · Klipper, OctoPrint et PrusaLink

Relevé : 19 novembre 2026, base FabCore `7d1e6a4`. Ce sont des familles d’API, pas des validations de tous les modèles matériels. HTTP local privé uniquement dans le contrat actuel ; clé côté serveur, pas de redirection vers une cible arbitraire.

| Famille | Connexion | Commandes intégrées | Fichiers / contrôles |
| --- | --- | --- | --- |
| Klipper/Moonraker | Habituellement 7125, clé API si configurée | POST `/printer/print/pause`, `/resume`, `/cancel` sous `/printer/print` | Liste/lecture/envoi/lancement Moonraker, terminal, chauffe/LED/fan déclarés, jog avec homing et bornes |
| OctoPrint | Habituellement 5000 ou reverse proxy local, `X-Api-Key` | POST `/api/job` : `pause` avec action pause/resume, ou `cancel` | `/api/files`, sélection avec `print:true`, terminal `/api/printer/command`, chauffe et jog natifs |
| PrusaLink | Habituellement 80, `X-Api-Key` | Job courant `/api/v1/job` puis PUT pause/resume ou DELETE `/api/v1/job/<id>` | `/api/v1/storage` et `/api/v1/files`, lecture/envoi/lancement ; pas de nouveaux contrôles manuels génériques |

Code : [Moonraker](../../poc/moonraker.mjs), [OctoPrint](../../connectors/octoprint/src/index.ts), [PrusaLink](../../connectors/prusalink/src/index.ts), [contrôles](../../poc/manual-controls.mjs). Les noms de fichiers et chemins doivent rester confinés à la cible et au stockage autorisés.

## État matériel et urgence

L’instance OctoPrint de test est détectée sans imprimante raccordée : cela valide la détection du service, pas la fabrication ni un arrêt physique. Les tests HTTP simulés couvrent le contrat ; recette réelle par imprimante à poursuivre. Pas de recette matérielle Prusa établie dans le retour utilisateur actuel. Moonraker : lecture partiellement validée le 20 novembre 2026, voir ci-dessous.

### Lecture Moonraker validée le 20 novembre 2026

Depuis le LXC FabCore, exécution des fonctions du connecteur déployé sur deux instances du même Raspberry (7125 et 7126) :

- `/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed` : états `ready`, températures buse et plateau indépendantes et plausibles ; Klipper v0.14.0, version Moonraker non relevée (`?`).
- `/server/files/list?root=gcodes` : liste indépendante par instance.
- `/server/files/gcodes/<chemin>` : téléchargement HTTP 200, contenu vérifié pour un fichier temporaire contenant exclusivement des commentaires. Aucun G-code exécuté ; fichier de contrôle supprimé sur chaque instance après lecture. Dossiers actuellement vides.

Le connecteur permet déjà liste, lecture/téléchargement, envoi et lancement ; cet essai valide uniquement la lecture et le téléchargement depuis le connecteur, pas le parcours complet du navigateur ni la production. Les fichiers sont dans la racine `gcodes` de l’instance Moonraker ; aucune déduction sur le contenu d’une SD/USB embarquée de l’imprimante. Mise au point des sondes/axes/extrudeurs des machines de test hors périmètre FabCore. Aucune validation de chauffe, déplacement ou arrêt d’urgence par cette recette.

Moonraker documente `POST /printer/emergency_stop` : intégré comme `emergencyStop` pour #78, distinct de cancel ; confirmation logicielle uniquement sur `webhooks.state=shutdown`, recette physique toujours à faire. Pour OctoPrint, M112 est une commande d’urgence connue mais son acheminement et son effet dépendent du firmware, du parseur d’urgence et de la liaison série ; ne pas promettre une coupure instantanée universelle. PrusaLink : aucune primitive d’urgence qualifiée dans FabCore ; ne pas assimiler DELETE job à celle-ci.

Sources : [Moonraker, imprimante](https://moonraker.readthedocs.io/en/latest/external_api/printer/), [Klipper G-codes](https://www.klipper3d.org/G-Codes.html), [OctoPrint imprimante](https://docs.octoprint.org/en/main/api/printer.html), [événements OctoPrint](https://docs.octoprint.org/en/main/events/index.html), [Prusa Link Web](https://github.com/prusa3d/Prusa-Link-Web).

## Moonraker · migration TypeScript du 22 novembre 2026

Proposée sur `mig/02-2-moonraker`, non déployée. Code canonique : [connecteur typé](../../connectors/moonraker/src/index.ts), [types](../../connectors/moonraker/src/types.ts). [Adaptateur POC](../../poc/moonraker.mjs) : exports conservés et helpers HTTP/fichiers injectés, aucune seconde implémentation. Clé `X-Api-Key` côté serveur, origine privée validée par les helpers existants pour commandes/fichiers/terminal, redirections refusées ; chaque instance conserve son port et ses identifiants.

| Usage | Requête actuelle | Limite / résultat |
| --- | --- | --- |
| État | GET `/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed` | Délai 1,5 s ; JSON partagé limité à 64 Kio ; températures/progression/position et état Klippy |
| Pause/reprise/arrêt de fabrication | POST `/printer/print/pause`, `/printer/print/resume`, `/printer/print/cancel` | Délai 2,5 s ; résultat `ok` requis ; cancel n’est pas un arrêt d’urgence matériel |
| Liste | GET `/server/files/list?root=gcodes` | Délai 5 s ; dates converties en ms, taille/date inconnues à null |
| Téléchargement | GET `/server/files/gcodes/<chemin encodé>` | Signal d’annulation de l’appelant conservé ; chemin confiné par les helpers et la route existante |
| Envoi | POST `/server/files/upload` | Multipart diffusé, champ `file`, racine `gcodes`, `duplex:half` ; aucun lancement automatique |
| Lancement | POST `/printer/print/start?filename=<chemin encodé>` | Délai 5 s ; chemin de stockage retourné utilisé ; 5xx/résultat inattendu = inconnu |
| Terminal | POST `/printer/gcode/script`, puis GET `/server/gcode_store?count=50` | 60 s puis 2,5 s ; jusqu’à 30 réponses de 500 caractères après la dernière commande correspondante |

Refus de commande certain distinct d’un résultat inconnu ; aucun renvoi automatique. Le terminal ne dégrade pas une commande exécutée en échec lorsque seule la lecture du journal échoue. Les permissions, confirmations et restrictions pendant fabrication restent dans le serveur existant. Les protections et représentations POC sont conservées : le connecteur ne promet pas à lui seul de valider un firmware ou de sécuriser des appels hors composition.

Validation automatisée locale Node 24 : **164 tests**, types/lint/licences ; cinq nouveaux tests directs du module (deux instances sur la même IP, refus/inconnu sans rejeu, fichiers et chemin natif, réponses terminal bornées, erreurs JSON/réseau/Klippy). Deux tests supplémentaires de composition vérifient le vrai multipart multichunk, ses erreurs de taille sans rejeu et la limite JSON de 64 Kio. Parcours HTTP et découverte existants conservés. Aucun ordre matériel envoyé pendant ce travail. Les acquis de lecture du 20 novembre restent historiques ; ils ne valident pas une nouvelle fabrication après migration.

Après mise à jour demandée : vérifier les deux instances et leurs températures distinctes, liste et téléchargement ; envoi d’un fichier sans lancement, puis lancement/Pause/Reprise/Cancel uniquement sur une machine prête et sous supervision. Les réglages matériels personnels restent hors périmètre FabCore. OctoPrint et PrusaLink sont migrés séparément, voir ci-dessous. Sources officielles d’API : [objets imprimante](https://moonraker.readthedocs.io/en/latest/external_api/printer/), [fichiers](https://moonraker.readthedocs.io/en/latest/external_api/file_manager/), [journal G-code](https://moonraker.readthedocs.io/en/latest/external_api/server/#request-cached-gcode-responses). Les endpoints ci-dessus décrivent le code existant, pas une nouvelle qualification des versions actuelles de l’API.

## OctoPrint et PrusaLink · migration TypeScript du 22 novembre 2026

Proposée en PR, non déployée. Code canonique : [OctoPrint](../../connectors/octoprint/src/index.ts), [PrusaLink](../../connectors/prusalink/src/index.ts) ; adaptateurs [OctoPrint](../../poc/octoprint.mjs) et [PrusaLink](../../poc/prusalink.mjs) avec helpers HTTP/fichiers injectés, aucune seconde implémentation. Clé `X-Api-Key` obligatoire, origine privée validée, redirections refusées.

| Usage | OctoPrint | PrusaLink |
| --- | --- | --- |
| État | GET `/api/job` puis `/api/printer` (3 s) ; pas de lecture imprimante si déconnecté ; position de fichier seulement en fabrication sur stockage local | GET `/api/v1/status` (3 s), détails `/api/v1/job` facultatifs en fabrication |
| Commandes | POST `/api/job` `pause`/`resume`, `cancel` pour l'arrêt (5 s) | Tâche courante `/api/v1/job`, puis PUT `pause`/`resume` ou DELETE (15 s) ; pas de tâche = pas de commande |
| Fichiers | `/api/files/local?recursive=true`, téléchargement `/downloads/files/local/…`, envoi multipart sans lancement, lancement `select`+`print` | Stockages disponibles, parcours borné (6 niveaux, 40 dossiers, 300 fichiers), téléchargement limité à l'origine de la machine, envoi PUT sans lancement ni écrasement |
| Terminal | POST `/api/printer/command` : mise en file `accepted`, jamais « exécutée » ; 409 = déconnecté | Non pris en charge |

4xx = refus certain ; 5xx ou réponse perdue = inconnu, sans renvoi. Six nouveaux tests directs des modules ; tests HTTP, terminal et fichiers existants conservés. Aucun ordre matériel envoyé. Recette réelle par imprimante toujours à établir (instance OctoPrint de test sans imprimante, pas de recette Prusa) : après mise à jour demandée, vérifier lecture, liste, téléchargement, envoi sans lancement, puis Pause/Reprise/Arrêt sous supervision.

## Caméras locales · ajout du 23 novembre 2026

- **Moonraker** : `GET /server/webcams/list`, premier flux activé, services MJPEG d’abord ; URL relative résolue sur `http://<hôte>/`.
- **OctoPrint** : `GET /api/settings`, `webcam.streamUrl` si `webcamEnabled` n’est pas faux.
- Dans les deux cas le flux doit être en HTTP, sur le même hôte que la machine, sans identifiants dans l’URL ; sinon `invalid-stream`. Sans flux déclaré : `no-stream`, réponse 502 `camera-unavailable`.
- **PrusaLink** : non retenu. L’API v1 n’offre que des instantanés (`/api/v1/cameras/snap`) sur PrusaLink pour Raspberry Pi ; sur les imprimantes Buddy (MK4, XL, MINI, CORE One) la caméra publie directement vers Prusa Connect, sans point d’accès local. Un relais d’instantanés serait un autre pipeline, à envisager seulement avec une machine de recette.

## Configuration Klipper depuis FabCore

L’onglet Configuration des seules machines Klipper/Moonraker est réservé aux administrateurs. Il liste au plus 300 fichiers `.cfg` relatifs à la racine native `config`, y compris les fichiers inclus en sous-dossiers. Lecture, téléchargement, import local dans l’éditeur et enregistrement sont distincts. Un import n’envoie rien avant confirmation d’Enregistrer. Un nouveau fichier peut être créé ; remplacer un fichier existant exige sa révision SHA-256 actuelle et une copie de secours préalable. Limite : 1 Mio de texte UTF-8, chemins ASCII simples, sans remontée de dossier ni nom caché. Les inclusions sont affichées comme fichiers indépendants, sans interprétation des macros.

Le connecteur utilise l’origine et la clé API de la machine existante, sans SSH ni lecture du système de fichiers du serveur FabCore. `GET /server/files/list?root=config`, `GET /server/files/config/{path}` et `POST /server/files/upload` (`root=config`, `path`, `checksum`) suivent l’API native. Les permissions et les limites de la racine/symlinks sont celles de Moonraker ; FabCore ne désactive aucune protection native. Une racine en lecture seule peut être consultée, mais aucun succès d’écriture n’est supposé.

Avant remplacement, le fichier d’origine est copié dans `config/.fabcore-backups/{uuid}-{nom}.cfg.bak` (nom réel dérivé du fichier), puis relu pour détecter une édition concurrente. Les copies `.bak` ne correspondent pas à une inclusion `*.cfg` et restent conservées jusqu’à leur suppression explicite dans Moonraker/Mainsail. La configuration modifiée est relue après l’envoi et comparée à son empreinte. Une copie impossible bloque le remplacement ; un résultat d’envoi ou de vérification inconnu ne provoque aucun rejeu. Le contenu ne passe ni dans les journaux FabCore ni dans son état persistant. Le téléchargement renvoie une pièce jointe avec `Cache-Control: no-store`.

Le bouton « Redémarrer Klipper » appelle uniquement `POST /printer/restart` après confirmation de la machine. Il recharge Klippy et sa configuration ; il ne redémarre ni le système hôte ni les MCU et n’utilise pas `firmware_restart`. L’ACK signifie accepté, pas configuration valide. Aucune sauvegarde ne déclenche de redémarrage automatique. Les modifications non enregistrées désactivent le bouton. Une configuration en erreur peut être corrigée puis rechargée.

Le serveur vérifie directement `/printer/info` et, si Klippy est prêt, `print_stats`/`virtual_sdcard`. Impression, pause et état non vérifiable bloquent sauvegarde et restart. Les verrous commandes/transferts/urgence sont partagés avec les autres actions. L’urgence reste prioritaire ; son passage invalide aussi une sauvegarde en attente avant l’écriture suivante. Une requête native déjà envoyée ne peut pas être annulée rétroactivement. Les contrôles de session et de cible sont revalidés avant mutation.

**Limites de concurrence :** Moonraker ne fournit pas de comparaison-et-remplacement atomique pour ce téléversement. FabCore détecte les changements jusqu’à sa dernière relecture et sérialise ses propres écritures par machine ; un autre éditeur peut encore écrire dans la petite fenêtre entre dernière vérification et téléversement. Éviter l’édition simultanée par Mainsail/Fluidd et FabCore. Le texte ne fait pas l’objet d’une validation syntaxique complète Klipper avant sauvegarde.

API FabCore : `GET /api/machines/:id/klipper-config` (liste), `?path=printer.cfg` (lecture), `&download=1` (pièce jointe), `POST .../klipper-config` (`path`, `content`, `expectedRevision` ou `null` pour création, `confirm:true`), `POST .../klipper-restart` (`confirm:true`). Origine, rôle administrateur, JSON, limite de taille et débit sont contrôlés. Aucun accès pour l’observateur, même en lecture, car la configuration peut contenir des secrets.

Sources officielles consultées le 27 novembre 2026 : [gestion des fichiers](https://moonraker.readthedocs.io/en/latest/external_api/file_manager/), [redémarrage Klippy](https://moonraker.readthedocs.io/en/latest/external_api/printer/#host-restart). Tests simulés de protocole, HTTP et rendu React ; recette navigateur et matériel restant à effectuer. Aucun fichier réel d’imprimante ni redémarrage matériel n’a été exécuté pendant ce développement.
