# Elegoo · Centauri Carbon / Centauri Carbon 2

Relevé : 19 novembre 2026, base FabCore `7d1e6a4`. CC1 et CC2 utilisent des protocoles distincts.

| Fonction | CC1 | CC2 avec/sans CANVAS |
| --- | --- | --- |
| Connexion | SDCP WebSocket `ws://IP:3030/websocket` | MQTT TCP 1883, code LAN, identité HTTP locale |
| Identification | Série/MainboardID SDCP ; réponses étrangères ignorées | Identité réelle puis enregistrement du client MQTT |
| Commandes | Cmd 129 pause, 130 annulation, 131 reprise | Méthode 1021 pause, 1022 annulation, paramètres `{}` |
| Chauffe | Non exposée dans FabCore | 1028, un champ par action : `extruder` OU `heater_bed`, zéro pour couper |
| Caméra | MJPEG 3031 | MJPEG 8080 |
| Fichiers | Copies des transferts FabCore réussis | Inventaire interne natif 1044 proposé, téléchargement HTTP et lancement 1020 ; recette à faire |
| Filaments | Pas de CANVAS validé ici | CANVAS par lecture 2005 ; aucun % d’humidité inventé |

CC2 : racine `elegoo/<serial>` ; enregistrement sur `api_register`, réponse sur `<request_id>/register_response` ; requêtes `<client_id>/api_request`, réponses `<client_id>/api_response`, statuts `api_status`. FabCore utilise un identifiant MQTT stable par série et une session partagée. Un second client portant le même identifiant peut expulser le premier : ne pas dépanner avec un clone concurrent de cette identité.

Commandes CC2 : messages JSON `{ "id": <transaction>, "method": 1021|1022, "params": {} }`. La table active du SDK officiel confirme ces méthodes. La reprise 1023 est commentée dans cette table ; elle n’est pas exposée dans FabCore. Ne pas l’activer sur une simple correspondance documentaire.

## Retour matériel du 22 novembre 2026

**Confirmé par Valentin : Pause et Stop CC2 fonctionnent parfaitement lors de ses essais.** L’absence d’ajout en double d’une machine déjà connectée est également confirmée. Version exacte du firmware et phases exactes d’exécution non relevées ; ce retour ne valide pas par extension la reprise, l’urgence 1007, ni chaque état de préparation. L’incident antérieur reste décrit ci-dessous pour traçabilité, sans annuler ce nouveau résultat positif.

## Validation et incident Pause/Stop

Valentin confirme ajout/suppression/redécouverte CC2, hors ligne après extinction, chauffe buse et plateau puis coupure des deux. Firmware exact non relevé. Chauffe : plafonds logiciels 260/100 °C ; cible relue après ACK, sans commande répétée. Déplacements, éclairage et ventilateurs CC2 restent non activés en écriture.

Incident réel : pendant préparation/nivellement (status 2, sub_status 2901), le Stop normal n’a pas été confirmé. Lors de l’intervention, 1022 n’a pas eu de réponse corrélée ; cela ne prouve pas un refus constructeur. Les tentatives avec un identifiant MQTT concurrent ont perturbé la session et limitent l’interprétation. Avec une nouvelle session enregistrée, méthode 1007 : réponse `error_code=0`, exception 803 et état 14 reçus. Les cibles de chauffe après urgence n’ont pas été relues avec succès : ne pas affirmer leur valeur.

À corriger dans #78 : conserver le code natif, différencier 2501 (pause en cours) de pause effective, 2503 (annulation en cours) de 2504 (terminée), gérer état 14 et exception 803. Actuellement l’ACK est réduit à un booléen et le délai RPC est six secondes. Ni l’ACK seul ni un délai expiré ne prouvent le résultat physique.

1007 constitue une piste d’urgence CC2 corroborée par cette intervention et le client elegoo-web ; ne pas la transposer à CC1. Elle ne doit pas remplacer automatiquement 1022. Aucune garantie matérielle générale déduite d’un seul essai. La couche MQTT propriétaire n’est pas entièrement décrite par les sources du firmware publiées.

## Stockage interne CC2 · correctif proposé le 22 novembre

Le premier pilote utilisait `retainedOnly` : uniquement les copies transférées par FabCore. Il masquait donc les démos et fichiers envoyés par le slicer. Ce n’est pas une restriction démontrée du firmware : les sources et captures récentes décrivent une liste native exploitable.

### Commandes et routes intégrées

| Fonction | Requête | Réponse / contrôle |
| --- | --- | --- |
| Inventaire interne | MQTT `1044`, `params={"storage_media":"local","path":"/"}` | `result.error_code=0`, `result.file_list[]` avec `filename`, `size`, `create_time`, `type` ; réponse entière conservée au lieu d’un booléen |
| Télécharger / visualiser | HTTP `GET /download?file_name=<nom>&X-Token=<code LAN>` | Origine IPv4 privée fixe, aucun suivi de redirection ; refus HTTP ou page HTML/JSON signalé comme indisponible. Le code LAN n’est jamais affiché dans les logs |
| Envoyer | HTTP `PUT /upload`, tranches de 1 Mio, `X-Token`, `X-File-Name`, `X-File-MD5`, `Content-Range` | Chemin existant de FabCore conservé ; collision avec l’inventaire natif refusée. Aucun lancement à l’envoi |
| Lancer un fichier existant | MQTT `1020`, `storage_media="local"`, `filename=<nom natif>`, `config={delay_video:false,printer_check:true,print_layout:"A",bedlevel_force:false,slot_map:[]}` | Nom vérifié dans l’inventaire ; confirmation et bobine externe obligatoires dans ce jalon, pas de choix CANVAS implicite ; attente d’un état printing côté serveur |
| Pause / Stop | MQTT `1021` / `1022`, `params={}` | Résultats matériels positifs confirmés le 22 novembre ; session enregistrée conservée, pas de renvoi automatique |
| Chauffe / coupure | MQTT `1028`, un seul champ `extruder` OU `heater_bed` | Zéro pour couper ; validation de consigne par la télémétrie, déjà confirmée par Valentin |

Le listing réutilise la session MQTT et les transactions corrélées du moniteur ; pas de second identifiant concurrent. Taille maximale des enveloppes bornée à 512 Kio ; affichage limité aux 300 premières entrées de la réponse. Aucun balayage spéculatif de numéros de méthodes. `1044` sans pagination est rapporté comme renvoyant tous les fichiers sur un firmware testé par la source ; cette implémentation n’invente pas de pagination distante non vérifiée.

`file_list` n’est pas une liste de copies FabCore. La réponse native est autoritaire : si elle échoue, FabCore signale une indisponibilité au lieu de montrer un faux stockage vide ou des fichiers supprimés. Une liste vide explicite reste vide. Les copies historiques sur disque ne sont pas supprimées par la migration, mais ne servent plus à prétendre qu’un fichier existe encore. Les fichiers ASCII G-code simples du stockage **local** sont couverts ; SD/USB et leurs valeurs `storage_media` ne sont pas généralisés sans recette. Les créations nulles et tailles invalides restent inconnues.

La méthode 1046 et ses métadonnées sont documentées dans les sources, sans être requises pour ce correctif. Aucune suppression 1047, récupération distante 1057 ni reprise 1023 ajoutée. `1057` n’est pas un téléchargement du fichier vers FabCore.

### Preuves, firmware et prochaine recette

Sources primaires de développement : [elegoo-homeassistant, CC2_PROTOCOL.md](https://github.com/danielcherubini/elegoo-homeassistant/blob/main/docs/CC2_PROTOCOL.md), sections File List et Downloading a file ; [captures handslice](https://github.com/MrHaku81/handslice/blob/main/docs/networking-cc2.md) ; [transfert HTTP officiel](https://github.com/elegooofficial/elegoo-link/blob/main/src/lan/adapters/elegoo_fdm_cc2/elegoo_fdm_cc2_http_transfer.cpp). La liste est rapportée sur 02.01.00.00 et le téléchargement par nom nu sur 02.01.01.07. Ce sont des observations de ces projets, **pas une preuve sur le firmware personnel de Valentin**.

Correctif validé par tests simulés : réponse 1044 conservée, session unique, mauvais identifiant ignoré, refus explicite, chemins traversants rejetés, liste native mise à jour, téléchargement confiné et lancement d’un fichier non envoyé via FabCore. Aucun ordre de fabrication ni nouvel enregistrement MQTT matériel déclenché pour cette modification.

Après fusion/mise à jour : ouvrir Fichiers → Actualiser ; comparer avec l’écran, sélectionner une démo interne jamais envoyée par FabCore, essayer téléchargement/visualiseur si le firmware le permet, puis lancer un fichier adapté en confirmant la bobine externe. Si refus, conserver le code natif et le firmware exact. Ne pas annoncer les fonctions validées avant ce retour.

Code : [elegoo.mjs](../../poc/elegoo.mjs), [elegoo-files.mjs](../../poc/elegoo-files.mjs), [connectors.mjs](../../poc/connectors.mjs).

## Sources et portée

- [SDK Elegoo CC2](https://github.com/elegooofficial/elegoo-link/blob/main/src/lan/adapters/elegoo_fdm_cc2/elegoo_fdm_cc2_message_adapter.cpp), blob consulté `d543b8716d1bae84d07269f951b0ffbcdfa69fc6` : mapping actif et paramètres.
- [Firmware officiel CC2](https://github.com/elegooofficial/CentauriCarbon2), `elegoo/extras/pause_resume.cpp` : étapes internes PAUSE/CANCEL_PRINT, pas preuve complète de leur routage MQTT.
- [pycentauri](https://github.com/bjan/pycentauri/blob/main/docs/PROTOCOL.md) : essais 01.03.02.51 ; Pause/Stop CC2 explicitement non testés dans ce relevé, malgré leur présence au tableau.
- [elegoo-web](https://github.com/runnane/elegoo-web/blob/main/src/ui/controls.ts) : 1021, 1022 et urgence 1007 ; certains autres documents du dépôt sont incohérents, privilégier le code et recouper.
- [Documentation CC2 Home Assistant](https://github.com/danielcherubini/elegoo-homeassistant/blob/main/docs/CC2_PROTOCOL.md).
- [Firmware communautaire, changelog](https://github.com/Neme77/centauri-carbon-2-community/blob/develop/CHANGELOG.md) : urgence pendant commandes longues. Il s’agit d’un autre chemin d’exécution ; ce n’est pas la preuve de la cause du défaut 1022 sur le firmware stock.

## Implémentation TypeScript · migration CC2 du 22 novembre 2026

Proposée sur `mig/02-2-cc2`, non déployée : logique MQTT/identité/lecture ponctuelle et sessions dans `connectors/elegoo/src/monitor.ts` ; inventaire natif, téléchargement et lancement dans `files.ts`. Adaptateurs de compatibilité `poc/elegoo.mjs` et `poc/elegoo-files.mjs`, sans duplication du protocole. Chauffe/CANVAS et transfert segmenté restent des helpers communs injectés. CC1 et P2S non migrées par ce changement. Les commandes, paramètres, sources et acquis matériels ci-dessus restent la référence ; aucune nouvelle commande ou capacité firmware n’est déduite du typage.

154 tests automatisés passent, dont tests du module typé (identité, sessions isolées, corrélation 1044, refus et fermeture de RPC en attente) et recette simulée existante des fichiers internes/chauffes. Aucun ordre physique ni déploiement pendant le développement. Après mise à jour demandée : vérifier une session par CC2, températures/CANVAS, lecture des fichiers et téléchargement, puis Pause/Stop sur un essai supervisé.
