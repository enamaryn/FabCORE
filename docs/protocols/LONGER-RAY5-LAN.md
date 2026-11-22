# Longer Ray5 · Wi-Fi LAN · recherche et intégration

Relevé du **22 novembre 2026**. Remplace le premier pilote en lecture seule du 20 novembre. Le code de cette évolution est préparé pour une PR ; **non déployé, commandes non testées physiquement**. La puissance optique du module (5/10/20 W) ne permet pas d’identifier le firmware de la carte. Une Ray5 modifiée ne devient pas un autre modèle de contrôleur par le seul changement du module.

## Sources primaires et méthode

- [Longer : connexion LightBurn Wi-Fi](https://eu.longer.net/blogs/products-tutorial/lightburn-wifi-bridge-longer-ray5), carte MKS DLC32 et connexion GRBL réseau.
- [Longer : RAY5 10W/20W](https://wiki.longer3d.com/en/ray5-10w-20w), TCP 8080 ; [MKSLaser et SD](https://www.longer.net/blogs/software/mkslaser-longer-ray5-smartphone-app).
- [Ray5-Pilot](https://github.com/P0k3sm0t/Ray5-Pilot), commit consulté `3b88aeea6b488f142319dcb4ec69287c05b7403d`, version annoncée 2.0.2. Fichiers examinés : `ray5_client.py`, `ray5_status_monitor.py`, configuration et README. Référence des interfaces HTTP/WS, mouvements, contrôles et limites ; aucune dépendance Python ajoutée et aucun code tiers exécuté pour piloter la machine. Implémentation JavaScript indépendante.
- [MKS-DLC32-FIRMWARE](https://github.com/makerbase-mks/MKS-DLC32-FIRMWARE), commit `e3edf9292f511ee44223021b2b8853e31b1aabe7` : `Firmware/Grbl_Esp32/src/WebUI/WebServer.cpp`, `WebSettings.cpp`, `Protocol.cpp`, `GCode.cpp`. Endpoints SD, paramètres multipart, ESP220/221 et abandon SD lors du reset étudiés dans le code.
- GRBL 1.1 : [Commandes](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands), [interface et rapports](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface), [jog](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Jogging), [mode laser](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Laser-Mode).

Lire le code des références est nécessaire : Ray5-Pilot possède un Stop configurable (`hold_only` est une pause, pas une annulation), un mode soft-reset et des tolérances à certaines réponses HTTP `Error`. FabCore ne transforme pas ces réponses ambiguës en preuve d’exécution. Les commandes ESP3D d’autres générations, les ports de Ray5 Mini et les ports d’émulateurs ne sont pas généralisés à cette Ray5.

## Retour utilisateur du 22 novembre

Valentin confirme le homing réussi depuis FabCore sur sa Ray5 : prise d’origine validée sur matériel. Firmware exact non relevé ; les autres commandes et le parcours SD restent à tester. Le périmètre de clôture du POC reste CC2/P2S à sa demande.

## Observations matérielles en lecture seule

Depuis le LXC, sur la Ray5 de recette : ports 80 et 8080 ouverts ; 8848/8849 refusés. Requête TCP `?` : `<Idle|MPos:0.000,0.000,0.000|FS:0,0>` ; aucun mouvement ni tir.

- GET `/files?path=/` renvoie **la mémoire flash de l’interface**, notamment `index.html.gz` ; ce n’est pas la carte SD.
- GET `/upload` renvoie **la carte SD**, ses G-code `.gc` et ses dossiers ; statut `Ok` et tailles lisibles approximatives, dates absentes.
- Un fichier existant annoncé à 523 octets a été lu : `/SD/<fichier>` retourne 523 octets, UTF-8/G-code, sans octet nul. Sa lecture par `[ESP221]` retourne 572 octets : cette commande reformate les lignes. **Elle n’est donc pas utilisée pour restituer un original ni vérifier un transfert.**
- Des requêtes HTTP de lecture `$I`, `$$`, `$G` n’ont pas donné de lignes exploitables dans leurs corps : HTTP 200 ne prouve pas un accusé GRBL. La lecture des paramètres de contrôle est prévue sur la session TCP existante.
- Version exacte du firmware : **non relevée**. Upload, lancement, impulsion, déplacements et commandes de fabrication : **non essayés**, laissés à la recette utilisateur après fusion.

Aucun fichier personnel ou contenu de G-code n’est publié dans le dépôt.

## Transports et configuration

| Mode | Supervision | Contrôles manuels | Fichiers SD |
| --- | --- | --- | --- |
| GRBL TCP (8080 proposé) | Session persistante, `$I` puis `?` | Oui, expérimental, sur cette même session | HTTP 80 proposé, port séparé configurable |
| ESP3D HTTP 8848 + WS 8849 | WS `/`, sous-protocole `arduino`, `CURRENT_ID`/`PAGEID` puis requête de statut | Non exposés par cette implémentation ; pas de faux contrôle sur HTTP ambigu | Endpoints MKS `/upload` et `/SD` à qualifier sur le firmware concerné |

La Ray5 doit être sur un réseau Wi-Fi accessible depuis le serveur/agent. Le navigateur n’effectue aucun scan LAN. IPv4 privée seulement ; ports bornés ; pas de redirection HTTP. Aucune modification de firmware, Wi-Fi ou mot de passe.

Une seule application de pilotage doit utiliser le contrôleur pendant la recette. Les réponses GRBL n’ont pas d’identifiant de transaction : l’accusé `ok` correspond à la prochaine ligne attendue. Un deuxième LightBurn/LaserGRBL peut perturber cette corrélation.

## Découverte automatique

Le scan conserve son /24 privé, sa concurrence bornée et son annulation. Sur une IP inconnue, sonde GRBL TCP 8080 puis variante ESP3D 8848/8849, délais courts ; fermeture systématique des sessions temporaires. Une trame GRBL valide est exigée. Port ouvert, page web, HTTP 200 ou texte `ok` ne suffisent pas.

Une réponse GRBL générique est affichée comme **« GRBL Wi-Fi · Ray5 à confirmer »**, pas comme une preuve du fabricant, d’un numéro de série ou de la puissance optique. Le nom peut être confirmé à l’ajout. Une machine déjà enregistrée réutilise la supervision du registre pour éviter une deuxième connexion TCP ; la réconciliation affiche « Déjà ajoutée » ou, sans rapport frais, « non détectée ». Les ports personnalisés sont interrogés pour les machines déjà enregistrées ; aucun scan des 65 535 ports.

## Contrôles TCP implémentés

| Action | Commande | Conditions et résultat |
| --- | --- | --- |
| Lecture des réglages utiles | `$$` | Au repos, liste blanche `$13`, `$22`, `$30`, `$31`, `$32`, `$130`, `$131`. Pas d’écriture de réglage ni collecte Wi-Fi |
| Jog X/Y | `M5`, puis `$J=G91 G21 X… F600` ou Y | Au repos, pas ±0,1 / 1 / 10 mm, avance 600 mm/min. Refus M5 : aucun mouvement ensuite. Pas de Z motorisé déduit du seul MPos |
| Zéro de travail XY | `M5`, puis `G10 L20 P1 X0 Y0` | Au repos, confirmation. Décalage de travail G54, potentiellement conservé par le firmware ; ne déplace pas les axes. Utiliser G54 pour le travail |
| Prise d’origine | `M5`, puis `$H` | Uniquement si `$22=1` effectivement lu ; présence de capteurs à vérifier physiquement. Aucun `$22=1` envoyé par FabCore |
| Annuler un jog | octet `0x85` | Attend un nouveau rapport Idle avec S=0 |
| Couper le laser | `M5` | ACK signifie accepté, pas preuve optique. Pendant une fabrication, cette commande ne remplace pas le Reset |
| Impulsion de test | bloc unique `M5`, `G1 M3 S…`, `G4 P…`, `M5` | Au repos, présence opérateur confirmée, `$32=1` et `$30` valides. 1–5 % de la consigne maximale, 100/250/500 ms ; aucune activation continue. Le bloc est envoyé une seule fois avec ses quatre ACK comptés ; dwell et M5 sont dans le même envoi. Une coupure réseau peut empêcher de prouver sa réception : contrôle matériel toujours nécessaire |
| Pause | `!` | Depuis Run ; attendre un nouveau Hold:0 avec S=0. Hold:1 est une décélération, pas une autorisation de reprise |
| Reprise | `~` | Seulement depuis Hold:0 ; attendre un nouveau Run. Pas de reprise automatique ni depuis Door |
| Stop / Reset GRBL | `0x18` | Abandon du travail selon le firmware MKS ; attendre un nouveau Idle ou Alarm avec avance et S à zéro. Alarm reste visible, pas présenté comme « prêt ». Pas de déverrouillage, reprise ou référencement automatiques |
| Déverrouillage | `$X` | Action séparée et confirmée, seulement sur Alarm. Ne prouve ni le référencement ni l’absence d’obstacle |

Les coordonnées et valeurs FS affichées utilisent les unités et données réellement rapportées ; les jogs demandent explicitement G21. La consigne S n’est pas une puissance optique mesurée. Les boutons sont réservés à l’administrateur et protégés aussi côté serveur. Impossible de déplacer, faire l’origine, définir zéro ou tirer une impulsion pendant Run/Hold. Une commande refusée ou sans réponse n’est jamais renvoyée automatiquement. Une réponse inconnue peut fermer la session pour éviter d’attribuer un ancien ACK à une nouvelle action.

**Stop/Reset est un arrêt logiciel dépendant du réseau et du firmware, pas un arrêt d’urgence matériel.** La perte du Wi-Fi n’arrête pas nécessairement un travail SD. Un timeout d’origine ne signifie pas que les axes se sont arrêtés.

## Carte SD et fichiers

- GET `/upload?path=/…` : liste native, y compris fichiers déjà présents, récursion limitée à trois sous-niveaux, 24 dossiers et 300 fichiers. Tailles humaines et dates non fiables affichées inconnues. Lecture uniquement au repos ; pas de rafraîchissement agressif pendant une fabrication.
- GET `/SD/<chemin encodé>` : téléchargement des octets originaux ; contrôle UTF-8/G-code, absence de page HTML ou réponse de console ; 16 Mio maximum.
- POST `/upload?path=/` : multipart `path`, champ `<nom>S` pour la taille native, et `file`. Fichier limité à 16 Mio, nom simple, pas de collision connue ; aucune suppression ou écrasement intentionnel. Vérification par relecture et comparaison exacte des octets. Si doute ou refus, pas de rejeu et pas de lancement. Un autre client peut malgré tout créer un fichier entre le contrôle et l’envoi : usage exclusif requis, le firmware ne fournit pas de création atomique sans écrasement.
- GET `/command?plain=[ESP220]/<fichier>` : lancement séparé après confirmation utilisateur de sa présence et de la préparation de la zone laser et vérification de l’inventaire ; le serveur attend ensuite Run. Aucun lancement lors de l’upload.
- Extensions : `.gc`, `.nc`, `.gcode`, `.gco`, `.g`. Les `.lbrn` / `.lbrn2` sont des projets LightBurn à exporter, pas des G-code lançables. Chemins confinés, caractères ASCII simples, aucun `[ESP…]` injectable.
- Visualiseur et téléchargement existants réutilisés. Le suivi par octet n’est pas inventé ; progression seulement si rapport SD réel reçu.
- Transfert simple/multiple limité à la famille laser côté interface **et serveur**. Aucun transfert laser ↔ FDM. Même entre lasers, l’opérateur doit vérifier le profil machine, les dimensions, les unités, la matière et la puissance avant lancement.

## Périmètre non activé

Aucune caméra native n’a été observée : la fonction caméra de Ray5-Pilot utilise une caméra externe et une calibration, pas un flux fourni automatiquement par la Ray5. Air assist M8/M9, ventilateurs, relais, axe Z, cadrage automatique du fichier, modification des paramètres GRBL/ESP32, écriture flash et firmware ne sont pas déclarés fonctionnels sans qualification de l’équipement réel. Console G-code arbitraire non exposée ; les contrôles utilisent une liste fermée.

« Connexion complète » désigne ici supervision + découverte + contrôles TCP + chaîne SD implémentés pour recette. Cela ne transforme pas chaque option du logiciel de référence en équipement présent ni en fonction matériellement validée.

## Recette après fusion et mise à jour

1. Vérifier scan → ligne GRBL → ajout ; puis rescan « Déjà ajoutée », sans deuxième session. Conserver TCP 8080 et HTTP 80 pour le firmware relevé.
2. Comparer état, coordonnées, mode laser et `$30` réellement lus. Sans paramètres/ACK fiables, conserver les contrôles désactivés.
3. Vérifier droits observateur, axe Z absent et contrôles bloqués hors ligne. Confirmer zone dégagée et protections avant les essais suivants.
4. Tester un jog de 0,1 mm, zéro G54, annulation de jog et origine uniquement si équipée/configurée. Vérifier déplacement réel et limites.
5. Tester l’impulsion minimale (1 %, 100 ms), puis M5 ; observer l’extinction réelle. Ne pas confondre accusé et mesure optique.
6. Lister, télécharger et visualiser un G-code laser existant ; envoyer un fichier de test sous un nom inédit et vérifier qu’il ne démarre pas.
7. Sur un travail court supervisé : lancer, Pause, attendre Hold:0, Reprendre, Stop/Reset. Vérifier arrêt physique, S/avance, état final et absence de reprise automatique. Requalifier après changement de firmware.
8. Tester perte de liaison en lecture seule et reconnexion ; relever les logs, le firmware et les résultats. Aucun test logiciel ne remplace cette recette.

## Migration TypeScript · MIG-02.2.2

En revue le 22 novembre 2026 : `connectors/longer/src/monitor.ts` (`createRay5Services`) porte les transports GRBL TCP/ESP3D, parsing et contrôles ; `files.ts` (`createRay5FileServices`) porte l’inventaire et les échanges SD. `poc/longer-ray5*.mjs` ne contient plus de protocole et compose ces services avec la validation IPv4, le transport WS et le lecteur JSON partagé. Sources, commandes, plafonds, bornes et recette détaillés plus haut sont conservés.

Même clé de session par origine + port WS, mêmes ACK séquentiels, fraîcheur 10 s et reconnexion différée sans rejeu ; fermeture d’une commande en attente = résultat inconnu. Les contrôles restent TCP seulement, l’impulsion bornée exige toujours présence opérateur et paramètres lus ; `M5` précède le jog. Carte SD : état Idle exigé, `/upload` et `/SD`, limite 16 Mio, comparaison exacte après envoi, jamais de lancement implicite. Aucun changement de scan ou de capacités matériel par cette extraction.

Tests POC conservés ; `connectors/longer/test/connector.test.ts` vérifie notamment perte de session pendant M5, reconnexion sans anciennes consignes/rejeu et échec de vérification d’upload sans lancement. Aucun essai laser, mouvement ou déploiement ici. La recette physique ci-dessus reste distincte des tests automatiques.
