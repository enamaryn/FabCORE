# BBL-RD-CAMERA-01 · Bambu Cloud et vidéo hybride

État au **24 novembre 2026** : premier incrément en revue sur `feature/bambu-cloud-camera`, base `5fc6322` (#138). **Non déployé dans le service FabCore.** Sonde matérielle indépendante réussie depuis le LXC 119 ; recette de l’interface après fusion encore à faire. Sources et licences : [recherche figée](BAMBU-CLOUD-CAMERA-RESEARCH.md).

## Fonctionnement livré

La machine reste `bambu-cloud` : son inventaire, ses températures, son avancement et son AMS continuent d’utiliser le compte Cloud et MQTT Cloud. La source caméra est une configuration distincte :

| Mode demandé | Comportement du premier incrément |
| --- | --- |
| Désactivée (défaut) | Aucun accès caméra ni requête de credentials |
| Automatique | LAN RTSPS si une IPv4 privée explicite est configurée ; sinon diagnostic, aucun autre transport essayé |
| LAN | IPv4 RFC1918 explicite requise ; RTSPS sur 322, CA et numéro de série vérifiés |
| Cloud | Diagnostic « vidéo distante non qualifiée » ; aucun SDK ni transport P2P/relay démarré |

La fonctionnalité nécessite **`FABCORE_EXPERIMENTAL_BAMBU_CAMERA=1`** côté serveur, puis une configuration explicite par l’administrateur. `auto` ne découvre pas l’adresse et n’essaie pas successivement différents transports. Aucun changement LAN-only/Developer Mode/firmware/liveview n’est envoyé à l’imprimante.

Le code LAN vidéo est obtenu par la requête HTTPS d’inventaire déjà utilisée, pour le compte et la série réellement associés à la machine. Il n’est pas récupéré dans Bambu Studio. La réponse publique et l’état persistant ne contiennent jamais le code. Le cache privé d’inventaire vidéo est borné à 30 secondes par compte, partagé entre aperçu et spectateurs ; les échecs sont temporisés aussi. Aucun renouvellement de login, email, code MFA ou rejeu automatique n’est déclenché. Déconnexion/fermeture libère ce cache. Une réponse inconnue ou un code absent refuse la caméra.

Le pipeline LAN existant est réutilisé : TLS vers la machine avec son identité vérifiée, relais loopback éphémère, FFmpeg isolé, MJPEG 4 images/s et largeur 960. Le secret est transmis par stdin, sans URL authentifiée dans la liste des processus. Le relais ne désactive pas la validation du certificat de l’imprimante. Les navigateurs ne reçoivent que les routes FabCore sous session, jamais le code ni l’adresse authentifiée.

Le flux est partagé entre spectateurs selon les limites existantes (8 sources/32 spectateurs ; tampon limité pour les clients lents). Le dernier spectateur ferme le pipeline ; l’aperçu ferme son abonnement après un JPEG. Les expirations/révocations de sessions FabCore restent appliquées. L’autorisation du compte, la série et sa révision de credentials sont revérifiées pendant une ouverture et toutes les secondes pendant le flux. La disparition de la machine, un changement de configuration, la déconnexion ou le refus Cloud coupe le flux sans reconnexion automatique.

## Points d’entrée

- `src/domain/camera.ts` : politique des modes et validation d’adresse, sans I/O.
- `src/application/machines.ts` → `setCameraConfig`, route `POST /api/machines/:id/camera-settings` : administrateur, origine et JSON obligatoires, persistance attendue. Les clés non prévues ne sont pas conservées.
- `connectors/bambu/src/cloud-http.ts` → `cameraCodes` : inventaire régional HTTPS, refus/timeout/réponse bornée et expurgation existants conservés.
- `poc/cloud-accounts.mjs` → `cameraConnection` : appartenance compte/série, chiffrement existant, cache privé et contrôle de révocation.
- `poc/bambu-cloud-camera.mjs` : composition du transport, garde d’autorisation et traces expurgées ; délégation à `streamBambuCamera`.
- `GET /api/machines` : descripteur public `camera` (mode, IPv4 configurée, source/transport sélectionnés, disponibilité/diagnostic et expérimental). Ce descripteur n’affirme pas qu’un flux est connecté ; le premier JPEG et les événements des logs le confirment.
- `CameraPanel.tsx` et `BambuCameraSettings.tsx` : sélection et explication FR/EN, aperçu/direct, agrandissement et pleine page existants. Réglages administrateur uniquement ; lecture vidéo autorisée à l’observateur. Une modification remonte une nouvelle instance du panneau et libère l’ancien flux.
- Logs machine : `cloud-camera-open`, `cloud-camera-result`, `cloud-camera-failed`, transport/host/mode et raison bornée ; aucune exception brute, URL signée ou credential.

Cette livraison n’intègre pas de bibliothèque tierce ni de binaire propriétaire. Elle ne met pas en œuvre les interfaces C++ du plugin officiel. Les sources montrent qu’une suite native/P2P est techniquement possible ; elle nécessite une qualification distincte des API permises, de la licence et du fonctionnement hors LAN.

## Mesures matérielles réalisées avant PR

Environnement : FabCore LXC 119, service installé sur `5fc6322`, P2S déjà importée Cloud ; FFmpeg déjà installé. Aucune modification du code installé, de l’environnement systemd, des comptes, de la base ou des modes de l’imprimante. Aucun ordre de fabrication.

| Vérification | Résultat observé | Limite |
| --- | --- | --- |
| Port RTSPS | TLS 1.2 accepté, CA valide et série correspondante | Ne prouve pas à lui seul la permission vidéo |
| Credentials de vidéo | Code obtenu depuis le compte Cloud propre à FabCore et la série associée | Aucun accès aux données privées de Studio ; pas de nouveau login |
| Vidéo RTSPS | **35 images, 397 866 octets, 9 986 ms** au total | Sonde autonome ; pas encore la route HTTP de la nouvelle version ni son navigateur |
| Restitution | MJPEG configuré à 4 FPS ; ~3,5 images/s sur la durée incluant le démarrage | Pas une mesure du FPS H.264 natif ni de la latence de bout en bout |
| Ressources de la sonde Node | 297 ms CPU ; max RSS 90 088 Kio | Ne comprend pas CPU/RAM du processus FFmpeg ; pas une mesure complète du coût service |
| Nettoyage | Aucun FFmpeg restant sur le LXC 119 après la sonde | Multi-onglets et durée longue à tester après fusion |
| Supervision | Service actif ; rapports MQTT Cloud encore reçus, 21 rapports dans le journal courant et aucun événement d’erreur MQTT relevé | Valeurs températures/AMS dans l’interface pendant la nouvelle vidéo restent à comparer |
| Mode imprimante | Aucun réglage modifié | L’état effectif du Developer Mode n’a pas été attesté par cette sonde ; ne pas conclure une compatibilité sans ce mode depuis ce seul essai |

Outil reproductible : `tools/probe-bambu-cloud-camera.mjs`. Il lit **le stockage JSON propre à FabCore** et sa clé existante dans le même processus ; ne l’utiliser que sur l’instance de laboratoire autorisée avec stockage JSON actif. Il ne convient pas à une installation PostgreSQL ou à un ancien `state.json` conservé après migration. Il ne produit aucun fichier image, code ou jeton en sortie. Les métriques imprimées sont celles du parent Node seulement. Paramètres : IPv4 privée autorisée et, si plusieurs P2S existent, identifiant FabCore explicite. Exemple opérateur :

```sh
FABCORE_CHECKOUT=/opt/fabcore FABCORE_DATA=/var/lib/fabcore \
  /opt/fabcore-node/bin/node tools/probe-bambu-cloud-camera.mjs <IPv4-locale> <id-machine>
```

## Déploiement après validation et fusion du mainteneur

Le protocole fourni impose d’attendre la fusion. **Ne pas installer la branche directement dans `/opt/fabcore` ni modifier le code du service à la main.**

1. Relever `git -C /opt/fabcore rev-parse HEAD`, l’état local et `systemctl is-active fabcore.service`. Préserver les paramètres existants.
2. Dans `/opt/fabcore`, lancer `fabcore backup --label avant-camera`. Noter et vérifier l’archive (elle contient données sensibles, à conserver hors GitHub). `fabcore restore <archive> --check` valide une restauration sans l’appliquer.
3. Déployer la version fusionnée avec `fabcore-update` ou `fabcore update` suivant le lanceur installé. Vérifier SHA, service, accès HTTP et journaux de démarrage expurgés.
4. Ajouter un **drop-in dédié**, après lecture et sauvegarde s’il existe, `/etc/systemd/system/fabcore.service.d/cloud-camera.conf` :

```ini
[Service]
Environment=FABCORE_EXPERIMENTAL_BAMBU_CAMERA=1
```

5. `systemctl daemon-reload` puis `systemctl restart fabcore.service`. Vérifier à nouveau le service et la connexion du compte Cloud. Ne pas remplacer les réglages OIDC ou ntfy.
6. Dans `/app`, ouvrir la P2S Cloud → Paramètres vidéo, choisir Automatique/LAN et l’IPv4 de la P2S. Enregistrer ; vérifier que la source affichée est bien **LAN RTSPS**, avec télémétrie Cloud. Aucun code à saisir dans le navigateur.
7. Réaliser immédiatement la recette ci-dessous. Toute correction de code passe par une nouvelle PR. L’usage du compte Cloud ne constitue pas un accès distant à son IPv4 privée.

## Retour arrière

- Revenir d’abord à Caméra désactivée dans l’interface ou mettre le flag du drop-in dédié à `0`, recharger systemd et redémarrer le service. Les paramètres des autres services et comptes restent intacts.
- Si un retour de code est requis, préparer une PR de revert de cet incrément et déployer sa fusion par la procédure habituelle. Aucune migration de schéma n’est ajoutée : le champ caméra est une métadonnée existante du magasin.
- Restaurer des données uniquement si nécessaire, depuis l’archive vérifiée et avec la procédure `fabcore restore`. Ne pas restaurer automatiquement une sauvegarde plus ancienne au détriment des machines/comptes ajoutés depuis. Ne pas réinitialiser la base.

## Matrice de recette après fusion (non encore réalisée)

| Domaine | Recette restante | Preuve attendue |
| --- | --- | --- |
| Vidéo FabCore | Aperçu, premier direct, fermeture, réouverture et plein écran/pleine page | JPEG/flux visible dans l’interface, logs ouverture/fermeture |
| Partage | Deux spectateurs, deux onglets ; fermer le dernier | Un seul FFmpeg/source, aucun processus restant |
| Monitoring | Températures, progression, AMS/humidité et fraîcheur pendant la vidéo | Comparaison avec Studio, sans dégradation de MQTT |
| Performance | FPS, latence visuelle, CPU/RAM Node + FFmpeg, bande passante entrée/sortie | Mesure sur durée stable, pas seulement pendant le démarrage |
| Mobile/PWA | Téléphone réel, mode paysage, sortie de page | Affichage, dimensions et libération de flux |
| Coupures | P2S indisponible, flux interrompu, session ou compte révoqué | Refus clair, aucune boucle de workers ni rafale Cloud |
| Non-régression | P2S LAN, CC2, Moonraker, OctoPrint, notifications, OIDC | Parcours de contrôle sans commande de fabrication implicite |
| Cloud distant | Client vidéo sans route vers la P2S | **Non qualifié et non implémenté dans cet incrément** |

Les tests automatisés couvrent modes/adresses, droits et origine HTTP, secrets absents des données/logs, cache et temporisation des échecs, révocation et aperçu, ainsi que les contrôles existants de relais. Ils ne remplacent pas cette matrice.

## Next steps (English)

This increment keeps Cloud inventory/MQTT monitoring and adds an explicitly labeled **experimental LAN RTSPS camera**. It does not implement remote Cloud/P2P/relay video. The standalone LXC 119 probe received frames with verified TLS; browser/service validation requires maintainer merge, official deployment, and the tests above. No printer mode or production command was changed. Native worker work must use verified interfaces and permitted credentials, with bounded resources and no unauthorized proprietary redistribution. Validate off-LAN video separately before claiming remote compatibility.
