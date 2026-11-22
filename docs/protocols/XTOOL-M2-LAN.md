# xTool · M2 JS002 · LAN WS-V2

Relevé : 19 novembre 2026, code FabCore `7d1e6a4`. Pas d’extrapolation aux S1/D1 ni aux anciennes API REST.

## Découverte et connexion

Découverte UDP V2 sur le port 20000, avec identifiant de requête et validation du modèle, de l’adresse et du sous-réseau. Une identité reçue ne prouve pas une autorisation de contrôle.

Transport M2 : `wss://IP:28900`. Certificat autosigné : empreinte relevée et vérifiée aux connexions suivantes, pas d’acceptation silencieuse d’une nouvelle identité. Canal `function=instruction` pour requêtes et événements ; appairage physique lorsqu’il est demandé, puis jeton conservé côté serveur. Une session de supervision persistante est partagée : les reconnexions/authentifications répétées provoquaient des bips. Aucun nouvel appairage automatique à chaque lecture.

## Caméras

| Vue produit | Nom protocole |
| --- | --- |
| Angle, vue par défaut | `side` |
| Centrale | `far` |
| Outil | `near` |

Les identifiants numériques viennent de `GET /v1/platform/camera/list`, jamais d’une numérotation supposée. Démarrage/arrêt via `POST /v1/platform/camera/live` avec nom et action. Canal partagé `function=media_stream`, démultiplexage par identifiant réel et traitement des trames binaires ; transitions sérialisées pour pouvoir rouvrir/changer de caméra.

L’aperçu est une capture ponctuelle à l’ouverture : `/v1/platform/camera/snap`, puis téléchargement authentifié via `file_stream`. Le bouton « Voir la caméra » ouvre un vrai flux vidéo ; aucune boucle de captures à sa place. Fermer le dernier spectateur ferme son flux, sans interrompre la supervision.

Valentin confirme appairage et trois caméras fonctionnels après corrections. Version firmware exacte non relevée ; aucune preuve de compatibilité de toutes les versions WS-V2.

## Fabrication et limites

Projet déjà préparé : `POST /v1/project/device/control`, `params.action=START|PAUSE|RESUME|CANCEL`. `/v1/processing/state?action=stop` est un arrêt de cadrage et ne doit pas servir d’annulation de fabrication.

Transfert natif de projet M2 non implémenté dans FabCore. Un G-code générique ne remplace pas un projet `xf` et sa configuration. Visualiseur local possible sans transfert. Aucun contrôle de mouvement/laser ni arrêt d’urgence distinct qualifié ; `CANCEL` n’est pas annoncé comme une coupure de sécurité (#78).

Code : [xtool.mjs](../../poc/xtool.mjs), [découverte](../../poc/xtool-discovery.mjs), [média](../../poc/xtool-media.mjs), [caméras](../../poc/xtool-camera.mjs).

Sources : [ha-xtool](https://github.com/thecodingdad/ha-xtool), [PROTOCOL.md](https://github.com/thecodingdad/ha-xtool/blob/main/docs/PROTOCOL.md), recoupés avec les essais FabCore. Les ports REST historiques de ce dépôt concernent d’autres familles : ne pas les appliquer à JS002 V2 par défaut.

## Migration TypeScript · MIG-02.2.2

En revue le 22 novembre 2026 : `connectors/xtool/src/monitor.ts` (`createXToolServices`), `camera.ts` (`createXToolCamera`), `media.ts` (`subscribeXToolVideo`) et `discovery.ts` (`discoverXTool`) portent les protocoles auparavant dans `poc/xtool*.mjs`. Les quatre adaptateurs POC injectent transport WebSocket, validation IPv4 et observation d’images ; aucune dépendance au cœur depuis le connecteur. Les sources de protocole et commandes ci-dessus restent la référence ; il ne s’agit pas d’une nouvelle intégration firmware.

Identité/empreinte TLS, appairage, jeton, décodage et CRC, session instruction persistante, heartbeat et reconnexion différée sont conservés. Fabrication : `POST /v1/project/device/control`, actions `START`, `PAUSE`, `RESUME`, `CANCEL`, sans utilisation de l’arrêt de cadrage pour annuler un travail. Les accusés de refus restent distincts d’un résultat inconnu ; aucune commande rejouée. Caméra : même capture authentifiée vérifiée par MD5, partage/démultiplexage média par identifiant réel, contrôle de l’empreinte sur chaque canal et libération des abonnements. UDP : corrélation requestId, modèle JS002 et hôtes ciblés exigés, délai 1,7 s. Aucun transfert natif M2 ajouté.

Tests existants `poc/xtool{,-camera,-media}.test.mjs` et découverte conservés ; tests directs dans `connectors/xtool/test/`. Pas de commande matérielle ni déploiement pendant cette migration. Recette supervisée après mise à jour demandée : identité/session, aperçu et flux, puis commandes du projet déjà préparé sur machine disponible. Les succès simulés ne prouvent pas les effets physiques.
