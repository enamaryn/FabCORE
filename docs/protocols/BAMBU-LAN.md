# Bambu Lab · LAN · P2S

Relevé : 19 novembre 2026, code FabCore `7d1e6a4`. Référence intégrée : P2S. Ne pas annoncer X1/P1/A1/H2 compatibles sur cette seule base.

## Connexion et fonctions intégrées

| Fonction | Transport / implémentation | Limites |
| --- | --- | --- |
| Supervision | MQTT TLS 8883, utilisateur `bblp`, code LAN ; topics `device/<serial>/report` et `device/<serial>/request` | Série réelle ; validation TLS et identité ; fusion des rapports partiels |
| Pause / reprise / annulation | Canal `print`, `command=pause|resume|stop`, séquence corrélée | Session existante ; aucun rejeu ; accusé ≠ arrêt physique confirmé |
| Fichiers | FTPS implicite 990, utilisateur `bblp` | Stockage réellement listé par la machine ; cache/USB selon ce qu’elle expose ; pas seulement les envois FabCore |
| Lancement | Projet tranché `.3mf` ou `.gcode` selon chemin et méthode de `bambu-files.mjs` | Un plateau pour le visualiseur ; confirmation de bobine externe ; mapping AMS automatique absent |
| Caméra P2S | TLS 322 traité côté serveur, conversion vidéo | Adaptateur propre à la P2S ; ne pas substituer les exemples RTSP X1 ou JPEG P1/A1 |
| AMS | Modules et emplacements réellement remontés, couleurs, emplacement actif | Humidité en % = `humidity_raw` ; `humidity` 1–5 est un indice |
| Éclairage / ventilateurs / chauffe | `manual-controls.mjs`, fonctions effectivement annoncées | Disponibilité dépend du firmware et des permissions |

Fichiers de code : [bambu.mjs](../../poc/bambu.mjs), [bambu-files.mjs](../../poc/bambu-files.mjs), [bambu-camera.mjs](../../poc/bambu-camera.mjs), [manual-controls.mjs](../../poc/manual-controls.mjs), [connectors.mjs](../../poc/connectors.mjs).

## Recette connue et limites

Valentin confirme caméra et aperçu, suivi stable des températures, impression complète de neuf heures, téléchargement et transfert simple. Firmware exact non relevé dans ces retours. La chauffe P2S a été refusée avec LAN uniquement activé et mode développeur désactivé : ne pas la déclarer validée. Déplacements non exposés par ce connecteur. Aucun arrêt d’urgence distinct intégré à cette date ; `stop` n’en tient pas lieu (#78).

Bambu distingue mode LAN standard et mode développeur, avec des restrictions d’autorisation sur les opérations critiques. La présence de télémétrie ne prouve pas le droit de chauffer ou lancer. Un changement de mode ne doit pas être imposé silencieusement.

## Sources

- [OpenBambuAPI MQTT](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md), [G-code](https://github.com/Doridian/OpenBambuAPI/blob/main/gcode.md), [FTPS](https://github.com/Doridian/OpenBambuAPI) : rétro-ingénierie communautaire.
- [ha-bambulab](https://github.com/greghesp/ha-bambulab), code consulté au commit `d2793d837648967f631d34a5b2f468a94099bef0` : températures compactes, AMS et distinction cloud/local.
- [Bambu, intégrations tierces](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/), [contrôle d’autorisation](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/) : politique officielle, à revalider pour chaque firmware/modèle.
