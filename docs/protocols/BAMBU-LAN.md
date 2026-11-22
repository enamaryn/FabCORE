# Bambu Lab · LAN · P2S

Relevé : 19 novembre 2026, code FabCore `7d1e6a4`. Référence intégrée : P2S. Ne pas annoncer X1/P1/A1/H2 compatibles sur cette seule base.

## Incident de vérification des commandes · 22 novembre 2026

Retour utilisateur : Pause et Stop refusés sur la P2S pendant un essai, alors que la supervision fonctionne. Lecture seule du journal du LXC : réponses MQTT corrélées aux commandes Pause et Stop avec `result="failed"`, `reason="mqtt message verify failed"`. Le même motif apparaît pour `project_file`. Ce sont des refus explicites, pas un timeout, une panne réseau ni une preuve d’arrêt.

Le manuel officiel P2S, section **7.3.2, page imprimée 68**, indique que le contrôle direct par des logiciels tiers passe par **Settings → LAN Only → Developer Mode** après activation du LAN uniquement : [manuel P2S V1.0 2026.05](https://csm.bblcdn.com/hub/9425242c00344b0e801b6179f9a243aa.pdf). Voir aussi [l’explication officielle des modes standard et développeur](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/). La disponibilité de la télémétrie ne prouve pas l’autorisation d’écriture.

Valentin confirme avoir **activé le mode développeur le 22 novembre**. Les nouveaux essais auront lieu après la mise à jour du correctif ; **Pause/Stop, chauffe et lancement ne sont pas validés par ce seul changement de réglage**. Aucun mode modifié à distance, firmware changé ou commande matérielle rejouée pendant ce diagnostic. Le LAN uniquement désactive les fonctions cloud de la machine selon le manuel ; il ne constitue pas un accès simultané LAN/cloud dans FabCore.

### Messages et commandes concernés

- Transport : session MQTTS existante ; topic `device/<serial>/request` ; canal `print`.
- Pause/Reprise/Stop : `{ "print": { "command":"pause|resume|stop", "param":"", "sequence_id":"<transaction>" } }`.
- Lancement : `command="project_file"`, paramètres construits par [connectors/bambu/src/files.ts](../../connectors/bambu/src/files.ts) pour le chemin réel du G-code/plateau.
- Chauffe : `command="gcode_line"`, `M104 S<consigne>` pour la buse, `M140 S<consigne>` pour le plateau ; attente de la consigne réellement remontée, pas seulement d’un ACK.
- Un refus de vérification connu produit désormais `bambu-authorization` et HTTP 403, avec aide localisée dans l’interface. L’état réel de fabrication reste affiché ; ce refus ne met pas artificiellement la machine hors ligne. Les autres refus restent distincts.
- Aucun rejeu automatique, aucune signature fabriquée ni usurpation du logiciel officiel. Une commande critique réussie ultérieure peut effacer l’avertissement ; elle ne prouve pas que toutes les autres fonctions sont autorisées.

Après fusion/mise à jour : confirmer LAN + mode développeur sur l’écran, puis sur un travail court supervisé tester Pause, reprise et Stop ; comparer état réel et retour FabCore. Tester ensuite chauffe/coupure puis lancement séparément. En cas de nouvel échec, conserver réponse native et firmware exact. Le panneau ne doit jamais annoncer un arrêt sur la seule publication MQTT.

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

Fichiers de code : [bambu.mjs](../../poc/bambu.mjs), [connectors/bambu/src/files.ts](../../connectors/bambu/src/files.ts), [bambu-camera.mjs](../../poc/bambu-camera.mjs), [manual-controls.mjs](../../poc/manual-controls.mjs), [connectors.mjs](../../poc/connectors.mjs).

## Recette connue et limites

Valentin confirme caméra et aperçu, suivi stable des températures, impression complète de neuf heures, téléchargement et transfert simple. Firmware exact non relevé dans ces retours. La chauffe P2S a été refusée avec LAN uniquement activé et mode développeur désactivé : ne pas la déclarer validée. Déplacements non exposés par ce connecteur. Aucun arrêt d’urgence distinct intégré à cette date ; `stop` n’en tient pas lieu (#78).

Bambu distingue mode LAN standard et mode développeur, avec des restrictions d’autorisation sur les opérations critiques. La présence de télémétrie ne prouve pas le droit de chauffer ou lancer. Un changement de mode ne doit pas être imposé silencieusement.

## Sources

- [OpenBambuAPI MQTT](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md), [G-code](https://github.com/Doridian/OpenBambuAPI/blob/main/gcode.md), [FTPS](https://github.com/Doridian/OpenBambuAPI) : rétro-ingénierie communautaire.
- [ha-bambulab](https://github.com/greghesp/ha-bambulab), code consulté au commit `d2793d837648967f631d34a5b2f468a94099bef0` : températures compactes, AMS et distinction cloud/local.
- [Bambu, intégrations tierces](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/), [contrôle d’autorisation](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/) : politique officielle, à revalider pour chaque firmware/modèle.

## Implémentation TypeScript · migration P2S LAN du 22 novembre 2026

Proposée en PR, non déployée : session MQTT, accusés corrélés et sondes dans `connectors/bambu/src/monitor.ts` ; FTPS dans `files.ts`. Adaptateurs de compatibilité `poc/bambu.mjs` et `poc/bambu-files.mjs`, sans duplication du protocole. Tests du module typé : refus d'autorisation effacé au premier succès, autres refus distincts, aucune publication sans rapport frais, fermeture sans rejeu, inventaire et lancement. Aucun ordre physique pendant le développement. Après mise à jour demandée : vérifier télémétrie/AMS, liste et téléchargement FTPS, pause/reprise/arrêt sur une fabrication supervisée, et le refus explicite hors mode développeur.
