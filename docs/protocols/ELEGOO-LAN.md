# Elegoo · Centauri Carbon / Centauri Carbon 2

Relevé : 19 novembre 2026, base FabCore `7d1e6a4`. CC1 et CC2 utilisent des protocoles distincts.

| Fonction | CC1 | CC2 avec/sans CANVAS |
| --- | --- | --- |
| Connexion | SDCP WebSocket `ws://IP:3030/websocket` | MQTT TCP 1883, code LAN, identité HTTP locale |
| Identification | Série/MainboardID SDCP ; réponses étrangères ignorées | Identité réelle puis enregistrement du client MQTT |
| Commandes | Cmd 129 pause, 130 annulation, 131 reprise | Méthode 1021 pause, 1022 annulation, paramètres `{}` |
| Chauffe | Non exposée dans FabCore | 1028, un champ par action : `extruder` OU `heater_bed`, zéro pour couper |
| Caméra | MJPEG 3031 | MJPEG 8080 |
| Fichiers | Copies des transferts FabCore réussis | Copies des transferts FabCore réussis |
| Filaments | Pas de CANVAS validé ici | CANVAS par lecture 2005 ; aucun % d’humidité inventé |

CC2 : racine `elegoo/<serial>` ; enregistrement sur `api_register`, réponse sur `<request_id>/register_response` ; requêtes `<client_id>/api_request`, réponses `<client_id>/api_response`, statuts `api_status`. FabCore utilise un identifiant MQTT stable par série et une session partagée. Un second client portant le même identifiant peut expulser le premier : ne pas dépanner avec un clone concurrent de cette identité.

Commandes CC2 : messages JSON `{ "id": <transaction>, "method": 1021|1022, "params": {} }`. La table active du SDK officiel confirme ces méthodes. La reprise 1023 est commentée dans cette table ; elle n’est pas exposée dans FabCore. Ne pas l’activer sur une simple correspondance documentaire.

## Validation et incident Pause/Stop

Valentin confirme ajout/suppression/redécouverte CC2, hors ligne après extinction, chauffe buse et plateau puis coupure des deux. Firmware exact non relevé. Chauffe : plafonds logiciels 260/100 °C ; cible relue après ACK, sans commande répétée. Déplacements, éclairage et ventilateurs CC2 restent non activés en écriture.

Incident réel : pendant préparation/nivellement (status 2, sub_status 2901), le Stop normal n’a pas été confirmé. Lors de l’intervention, 1022 n’a pas eu de réponse corrélée ; cela ne prouve pas un refus constructeur. Les tentatives avec un identifiant MQTT concurrent ont perturbé la session et limitent l’interprétation. Avec une nouvelle session enregistrée, méthode 1007 : réponse `error_code=0`, exception 803 et état 14 reçus. Les cibles de chauffe après urgence n’ont pas été relues avec succès : ne pas affirmer leur valeur.

À corriger dans #78 : conserver le code natif, différencier 2501 (pause en cours) de pause effective, 2503 (annulation en cours) de 2504 (terminée), gérer état 14 et exception 803. Actuellement l’ACK est réduit à un booléen et le délai RPC est six secondes. Ni l’ACK seul ni un délai expiré ne prouvent le résultat physique.

1007 constitue une piste d’urgence CC2 corroborée par cette intervention et le client elegoo-web ; ne pas la transposer à CC1. Elle ne doit pas remplacer automatiquement 1022. Aucune garantie matérielle générale déduite d’un seul essai. La couche MQTT propriétaire n’est pas entièrement décrite par les sources du firmware publiées.

## Stockage

L’absence des fichiers de démonstration dans FabCore ne démontre pas un stockage vide. Les listes sont signalées `retainedOnly` : seules les copies dont le transfert FabCore a réussi sont conservées. Contrairement à Bambu FTPS, ce n’est pas un inventaire complet du stockage. Ne pas essayer des codes de listing spéculatifs pendant une impression.

Code : [elegoo.mjs](../../poc/elegoo.mjs), [elegoo-cc1.mjs](../../poc/elegoo-cc1.mjs), [elegoo-files.mjs](../../poc/elegoo-files.mjs).

## Sources et portée

- [SDK Elegoo CC2](https://github.com/elegooofficial/elegoo-link/blob/main/src/lan/adapters/elegoo_fdm_cc2/elegoo_fdm_cc2_message_adapter.cpp), blob consulté `d543b8716d1bae84d07269f951b0ffbcdfa69fc6` : mapping actif et paramètres.
- [Firmware officiel CC2](https://github.com/elegooofficial/CentauriCarbon2), `elegoo/extras/pause_resume.cpp` : étapes internes PAUSE/CANCEL_PRINT, pas preuve complète de leur routage MQTT.
- [pycentauri](https://github.com/bjan/pycentauri/blob/main/docs/PROTOCOL.md) : essais 01.03.02.51 ; Pause/Stop CC2 explicitement non testés dans ce relevé, malgré leur présence au tableau.
- [elegoo-web](https://github.com/runnane/elegoo-web/blob/main/src/ui/controls.ts) : 1021, 1022 et urgence 1007 ; certains autres documents du dépôt sont incohérents, privilégier le code et recouper.
- [Documentation CC2 Home Assistant](https://github.com/danielcherubini/elegoo-homeassistant/blob/main/docs/CC2_PROTOCOL.md).
- [Firmware communautaire, changelog](https://github.com/Neme77/centauri-carbon-2-community/blob/develop/CHANGELOG.md) : urgence pendant commandes longues. Il s’agit d’un autre chemin d’exécution ; ce n’est pas la preuve de la cause du défaut 1022 sur le firmware stock.
