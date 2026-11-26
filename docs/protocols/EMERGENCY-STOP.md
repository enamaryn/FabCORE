# Arrêt d’urgence logiciel · #78

Relevé documentaire du 26 novembre 2026. Implémentation et tests simulés ; aucune commande matérielle, qualification physique ou mesure de chauffe dans ce jalon. L’issue #78 reste ouverte pour la recette supervisée. `stop` reste une annulation contrôlée, sans escalade automatique.

| Fabricant / modèle / transport | Primitive et périmètre firmware | Décision FabCore |
| --- | --- | --- |
| Klipper / instance Moonraker / HTTP local authentifié | API native `POST /printer/emergency_stop`, réponse `result=ok`, état logiciel `webhooks.state=shutdown`. Version minimale non établie ; disponibilité dépend de l’instance. | Intégrée, distincte de `/printer/print/cancel`. Réponse HTTP conservée. ACK = accepté ; état shutdown relu = confirmé logiciel. Aucune qualification physique par modèle. |
| OctoPrint / imprimante série / HTTP local | API `/api/printer/command` asynchrone ; M112 dépend du firmware, du parseur d’urgence et du transport série. Marlin indique qu’il peut attendre dans une file sans `EMERGENCY_PARSER`. Versions et modèles non qualifiés ici. | Indisponible. Ne pas transformer le terminal générique en promesse d’urgence immédiate. |
| Prusa / PrusaLink / HTTP local | API de job intégrée pour pause, reprise et annulation. Aucune primitive d’urgence native et portée firmware établies dans les références consultées. | Indisponible. Pas de DELETE job ni de M112 inventé comme substitution. |
| Bambu / P2S LAN MQTT signé et compte Cloud | Stop de fabrication intégré. Aucune primitive distincte d’urgence prouvée par constructeur/modèle/firmware dans ce jalon. | Indisponible ; aucun nouveau message MQTT ou repli cloud/LAN. |
| Elegoo / CC1 / SDCP WebSocket | SDK officiel : pause/stop/resume, aucune primitive d’urgence distincte établie. Firmware non relevé. | Indisponible ; ne pas transposer 1007 CC2. |
| Elegoo / CC2 CANVAS / MQTT LAN | SDK officiel : pause1021, stop1022. Incident utilisateur : méthode1007 ACK0 puis état14/exception803 ; paramètres complets et firmware exact non relevés. SDK officiel ne fournit pas une commande emergencyStop exploitable. | Indisponible explicitement ; 1007 n’est pas envoyé. État14=`EMERGENCY_STOP`, sous-états2501/2503 transitoires,2504 final et exceptions conservés. |
| xTool / M2 JS002 / session WS-V2 | CANCEL du projet préparé ; aucune primitive d’urgence distincte et portée firmware prouvées. | Indisponible ; CANCEL n’est pas une coupure matérielle. |
| Longer / Ray5 / GRBL TCP ou ESP3D | Stop/reset existant ; aucune nouvelle primitive d’urgence qualifiée. | Indisponible pour cette nouvelle action. |

« Indisponible » décrit la capacité intégrée et prouvée de FabCore, pas l’absence absolue d’une fonction constructeur. Les sources communautaires et observations restent des pistes à qualifier, pas une autorisation de fabriquer des paquets réseau.

## Parcours et preuves

Bouton administrateur distinct dans la fiche, également hors impression (préparation, pause, erreur). Confirmation courte avec nom de la machine cible. Une capacité absente produit un bouton désactivé et sa limite explicite. Autorisation, origine, cible et confirmation sont revalidées côté serveur. Les requêtes réutilisent l’origine et la clé existantes ; aucune nouvelle session MQTT. Les résultats inconnus restent inconnus ; reconnexion et lectures suivantes ne rejouent jamais la requête. L’urgence possède son propre verrou par machine et sa propre clé de débit (huit demandes par minute) : elle passe même si un Stop, contrôle ou transfert ordinaire reste en attente. Un doublon d’urgence est refusé ; pendant son traitement les nouvelles commandes, contrôles, écritures terminal, lancements, transferts et éditions sont bloqués. La fin d’une urgence ne libère jamais le verrou de l’opération ordinaire déjà engagée. Le bouton React garde également un verrou indépendant et son résultat ne peut pas être écrasé par la réponse tardive d’un ordre ordinaire. La supervision relit l’état quatre fois au maximum, sans nouvelle commande. Un ACK reste accepté si l’observation échoue. Un refus conserve son code HTTP. L’état shutdown prouve uniquement l’état logiciel, sans promesse de coupure physique ou de consigne mesurée.

CC2 conserve `nativeStatus`, `nativeSubStatus` et les codes d’exception des deux formes du SDK (`machine_status.exception_status`, `exception.exception_code`). 2501 n’est pas une pause confirmée et 2503 n’est pas une annulation terminée. 14 garde la mention d’urgence ; 803 est affiché sans traduction hasardeuse.

## Sources primaires et limites

- [Moonraker : Emergency Stop et états Klippy](https://moonraker.readthedocs.io/en/latest/external_api/printer/) ; [source de l’API](https://github.com/Arksine/moonraker/blob/master/docs/external_api/printer.md).
- [OctoPrint : API imprimante et réponses asynchrones](https://docs.octoprint.org/en/main/api/printer.html), [événement EStop](https://docs.octoprint.org/en/main/events/index.html), [Marlin M112 et parseur d’urgence](https://marlinfw.org/docs/gcode/M112.html).
- [Prusa Link Web officiel](https://github.com/prusa3d/Prusa-Link-Web) ; [Prusa : M112 via liaison série](https://help.prusa3d.com/article/emergency-stop-17510-xl_400104) ne prouve pas une API PrusaLink.
- [Elegoo SDK CC2, révision consultée ec2d2269](https://github.com/elegooofficial/elegoo-link/blob/ec2d2269b588608a1b9ccb4ff9627ddb758ea482/src/lan/adapters/elegoo_fdm_cc2/elegoo_fdm_cc2_message_adapter.cpp), notamment états14,2501,2503,2504. Le nombre1007 dans sa table d’erreurs de fichiers n’est pas la méthode1007 observée lors de l’incident : ne pas les confondre.
- [Firmware CC2 officiel](https://github.com/elegooofficial/CentauriCarbon2). Observation utilisateur et pistes communautaires déjà tracées dans [ELEGOO-LAN](ELEGOO-LAN.md). Aucun schéma de commande d’urgence constructeur complet établi ici.
- Bambu et xTool : limites de preuve et transport existant dans [BAMBU-LAN](BAMBU-LAN.md), [BAMBU-CLOUD](BAMBU-CLOUD.md), [XTOOL-M2-LAN](XTOOL-M2-LAN.md). Pas de nouvelle revendication de primitive constructeur.

## Recette supervisée restante

Pour chaque modèle/firmware/transport : relever versions exactes, session, commande et réponse corrélée ; exercer préparation/nivellement, impression, pause et erreur sous surveillance. Relever état final, axes, consignes et températures mesurées séparément. Tester refus, déconnexion et absence de réponse sans renvoi. Pour CC2 : retrouver le paquet1007 exact et sa portée firmware, recouper une primitive supportée avant activation. Conserver ACK, état14 et803 sans conclure à une coupure de chauffe. Ne marquer une ligne matériellement validée qu’après cette recette, sans extrapoler aux autres modèles.
