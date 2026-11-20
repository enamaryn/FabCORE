# Longer Ray5 · Wi-Fi LAN · pilote en lecture seule

Recherche du 20 novembre 2026. Implémentation : `poc/longer-ray5.mjs`. Les tests logiciels sont simulés ; la validation sur la Ray5 20 W de Valentin reste à faire. La puissance du module optique ne permet pas de déduire le firmware de la carte.

## Interfaces documentées

| Mode explicite dans FabCore | Ports proposés | Référence et fonctionnement |
| --- | --- | --- |
| GRBL TCP | TCP 8080 | Documentation officielle Longer RAY5 10W/20W, connexion LightBurn ; session TCP persistante |
| ESP3D | HTTP 8848 et WebSocket 8849 | Projet Ray5-Pilot ; WebSocket `/`, sous-protocole `arduino`, identifiant `CURRENT_ID` puis requête HTTP de statut |

Les ports restent configurables. Aucun basculement automatique entre protocoles ni scan supplémentaire n’est effectué. Les ports d’une Ray5 Mini ou d’un émulateur ne prouvent pas ceux de cette Ray5.

## Premier essai

1. Connecter la Ray5 au Wi-Fi du réseau local et relever son IPv4 sur l’écran. Le serveur FabCore doit pouvoir la joindre : son point d’accès autonome n’est pas nécessairement accessible depuis le LXC.
2. Dans FabCore : Ajouter une machine → saisie manuelle → **Longer · Ray5 Wi-Fi (lecture seule)**.
3. Renseigner le nom, l’IPv4 privée et le mode. Commencer par TCP 8080 pour le firmware décrit par Longer ; sélectionner ESP3D si le firmware expose cette interface.
4. Tester la connexion puis ajouter. Une trame GRBL valide est exigée ; un port ouvert ou HTTP 200 ne suffit pas. Une alarme est un état valide du protocole, pas une autorisation d’utilisation.
5. Vérifier l’état natif et les positions avec l’écran, puis consulter l’onglet Logs. Éteindre la machine pour vérifier la perte de liaison et l’effacement des mesures périmées. Relever le firmware et le mode réellement fonctionnel.

Une seule application doit utiliser la liaison pendant la recette : éviter une connexion LightBurn concurrente. FabCore ne modifie ni Wi-Fi ni firmware et ne collecte aucun mot de passe Wi-Fi. L’authentification ESP3D, si activée, n’est pas encore gérée.

## Contrat de lecture et limites

- TCP : `$I\n` demande l’information de version ; `?` demande le statut toutes les deux secondes.
- ESP3D : après `CURRENT_ID:<id>` (y compris zéro), GET `/command?commandText=%3F&PAGEID=<id>`. Le rapport peut arriver sur WebSocket. Les réponses isolées `ok` ou `Error` ne sont jamais des états machine.
- Interprétation bornée de `<Idle|MPos:...|FS:...>` : état natif GRBL, positions machine/travail, avance et consigne S. Les unités dépendent du contrôleur ; S n’est ni une puissance mesurée en watts ni un pourcentage garanti.
- Progression et nom de fichier seulement si un champ `SD` exploitable est effectivement reçu. `Idle` ne prouve pas qu’un travail s’est terminé. Aucun numéro de série ni modèle exact n’est inventé à partir d’un rapport GRBL générique.
- Pas de températures fictives : buse et plateau non applicables. La fiche commune conserve les emplacements indisponibles.
- Sessions partagées, réponses limitées à 8 Kio, données écartées après dix secondes sans rapport, reconnexion temporisée et fermeture des sessions inactives. Les réponses tardives d’une ancienne session sont ignorées.
- IPv4 privées uniquement, pas de redirection HTTP, pas d’URL arbitraire ni d’exécution de G-code. Les logs montrent transport, destination, statut HTTP et rapports GRBL bornés, sans paramètres Wi-Fi.

**Hors de cette première livraison** : activation/extinction laser, mouvements, homing, déverrouillage, pause/reprise/stop/urgence, inventaire et transfert SD, lancement de travail et caméra. Le connecteur n’expose aucune de ces capacités. Le visualiseur local de G-code existant reste indépendant de l’envoi à une machine.

## Sources primaires

- [Longer RAY5 10W/20W, section LightBurn Wi-Fi / TCP 8080](https://wiki.longer3d.com/en/ray5-10w-20w).
- [Ray5-Pilot](https://github.com/P0k3sm0t/Ray5-Pilot), code consulté au commit `3b88aeea6b488f142319dcb4ec69287c05b7403d` : `ray5_client.py`, `ray5_status_monitor.py` et configuration. Implémentation FabCore indépendante ; aucun programme tiers exécuté sur la machine.
- [GRBL 1.1 Interface](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface) et [Commands](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands).
- [ESP3DLib, commandes natives](https://github.com/luc-github/ESP3DLib/blob/master/docs/Commands.txt). Ne pas confondre avec les interfaces WebSocket d’autres versions ESP3D.

## Vérifications

Tests automatisés : trames fragmentées, réutilisation de session, états et progression, accès privé, réponses excessives, perte de liaison, péremption, reconnexion, refus HTTP, annulation de sonde et interface de configuration. Recette navigateur et matériel encore à effectuer ; aucune émission laser ni mouvement demandé par ces tests.
