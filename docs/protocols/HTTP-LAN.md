# API HTTP locales · Klipper, OctoPrint et PrusaLink

Relevé : 19 novembre 2026, base FabCore `7d1e6a4`. Ce sont des familles d’API, pas des validations de tous les modèles matériels. HTTP local privé uniquement dans le contrat actuel ; clé côté serveur, pas de redirection vers une cible arbitraire.

| Famille | Connexion | Commandes intégrées | Fichiers / contrôles |
| --- | --- | --- | --- |
| Klipper/Moonraker | Habituellement 7125, clé API si configurée | POST `/printer/print/pause`, `/resume`, `/cancel` sous `/printer/print` | Liste/lecture/envoi/lancement Moonraker, terminal, chauffe/LED/fan déclarés, jog avec homing et bornes |
| OctoPrint | Habituellement 5000 ou reverse proxy local, `X-Api-Key` | POST `/api/job` : `pause` avec action pause/resume, ou `cancel` | `/api/files`, sélection avec `print:true`, terminal `/api/printer/command`, chauffe et jog natifs |
| PrusaLink | Habituellement 80, `X-Api-Key` | Job courant `/api/v1/job` puis PUT pause/resume ou DELETE `/api/v1/job/<id>` | `/api/v1/storage` et `/api/v1/files`, lecture/envoi/lancement ; pas de nouveaux contrôles manuels génériques |

Code : [Moonraker](../../poc/moonraker.mjs), [OctoPrint](../../poc/octoprint.mjs), [PrusaLink](../../poc/prusalink.mjs), [contrôles](../../poc/manual-controls.mjs). Les noms de fichiers et chemins doivent rester confinés à la cible et au stockage autorisés.

## État matériel et urgence

L’instance OctoPrint de test est détectée sans imprimante raccordée : cela valide la détection du service, pas la fabrication ni un arrêt physique. Les tests HTTP simulés couvrent le contrat ; recette réelle par imprimante à poursuivre. Pas de recette matérielle Prusa établie dans le retour utilisateur actuel. Moonraker : lecture partiellement validée le 20 novembre 2026, voir ci-dessous.

### Lecture Moonraker validée le 20 novembre 2026

Depuis le LXC FabCore, exécution des fonctions du connecteur déployé sur deux instances du même Raspberry (7125 et 7126) :

- `/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed` : états `ready`, températures buse et plateau indépendantes et plausibles ; Klipper v0.14.0, version Moonraker non relevée (`?`).
- `/server/files/list?root=gcodes` : liste indépendante par instance.
- `/server/files/gcodes/<chemin>` : téléchargement HTTP 200, contenu vérifié pour un fichier temporaire contenant exclusivement des commentaires. Aucun G-code exécuté ; fichier de contrôle supprimé sur chaque instance après lecture. Dossiers actuellement vides.

Le connecteur permet déjà liste, lecture/téléchargement, envoi et lancement ; cet essai valide uniquement la lecture et le téléchargement depuis le connecteur, pas le parcours complet du navigateur ni la production. Les fichiers sont dans la racine `gcodes` de l’instance Moonraker ; aucune déduction sur le contenu d’une SD/USB embarquée de l’imprimante. Mise au point des sondes/axes/extrudeurs des machines de test hors périmètre FabCore. Aucune validation de chauffe, déplacement ou arrêt d’urgence par cette recette.

Moonraker documente `POST /printer/emergency_stop` : candidat natif pour #78, distinct de cancel. Pour OctoPrint, M112 est une commande d’urgence connue mais son acheminement et son effet dépendent du firmware, du parseur d’urgence et de la liaison série ; ne pas promettre une coupure instantanée universelle. PrusaLink : aucune primitive d’urgence qualifiée dans FabCore ; ne pas assimiler DELETE job à celle-ci.

Sources : [Moonraker, imprimante](https://moonraker.readthedocs.io/en/latest/external_api/printer/), [Klipper G-codes](https://www.klipper3d.org/G-Codes.html), [OctoPrint imprimante](https://docs.octoprint.org/en/main/api/printer.html), [événements OctoPrint](https://docs.octoprint.org/en/main/events/index.html), [Prusa Link Web](https://github.com/prusa3d/Prusa-Link-Web).
