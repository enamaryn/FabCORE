# Bambu Cloud et caméra · sources et limites

Relevé documentaire du **24 novembre 2026**, depuis les dépôts GitHub primaires et leurs branches par défaut. Aucun compte Bambu sollicité, aucune lecture de lab127 ou d’une imprimante, aucun binaire propriétaire téléchargé, aucun certificat/secret récupéré. Les résultats ci-dessous décrivent du code ou les observations de ses auteurs, **pas une validation matérielle FabCore**. Complète [BAMBU-CLOUD.md](BAMBU-CLOUD.md) et son [audit](BAMBU-CLOUD-AUDIT.md).

## Décision pour le premier incrément

Conserver la **télémétrie cloud** comme connexion de supervision et proposer, séparément et explicitement, une **caméra LAN RTSPS expérimentale** lorsque le serveur FabCore peut joindre l’imprimante. L’interface doit afficher la source réelle (« caméra LAN RTSPS »), son caractère expérimental et la nécessité du réseau local ; elle ne doit pas présenter ce flux comme une caméra cloud distante. Ne pas exiger un passage en LAN-only ou Developer Mode pour ce premier essai. Ne pas modifier automatiquement le mode de l’imprimante ou ses réglages de liveview.

Une imprimante peut rester associée au cloud tout en offrant une caméra LAN selon modèle, firmware et réglage. Cela ne garantit pas que le port vidéo soit ouvert : `ipcam.rtsp_url = "disable"`, absence d’adresse ou refus de connexion doivent donner un diagnostic explicite. L’absence de vidéo ne remet pas en cause une télémétrie cloud valide. Un VPS sans route vers l’adresse privée n’acquiert pas cette route grâce au login cloud.

Contexte communiqué : lab127 utilise Bambu Studio 2.9 et le plugin officiel 2.9 ; un trafic vidéo UDP privé P2S:52092 → lab:49864 a été observé. Ces ports éphémères ne constituent ni un endpoint à coder, ni une preuve de vidéo hors LAN, ni une validation de FabCore. Une négociation P2P utilisant le cloud peut aboutir à un chemin local ; seule une recette séparée hors LAN permettrait d’établir le chemin distant.

## Dépôts vérifiés et licences

Les sept dépôts sont publics et non archivés au relevé. « Non archivé » ne garantit ni maintenance active ni compatibilité avec le firmware du laboratoire. Les empreintes ci-dessous sont celles des têtes de branche consultées ; les liens de fichiers des sections suivantes sont figés sur ces empreintes.

| Dépôt canonique | Branche / commit | Date du commit (UTC) | Licence du dépôt consultée | Apport et limite |
| --- | --- | --- | --- | --- |
| [bambulab/BambuStudio](https://github.com/bambulab/BambuStudio) | master · `8e524a39d4c4cd0541801c1c46d2f77debb0bf1d` | 2026-11-17 | [AGPL v3](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/LICENSE) | Source officielle du consommateur des plugins, pas publication de l’implémentation propriétaire réseau/vidéo. |
| [ClusterM/open-bamboo-networking](https://github.com/ClusterM/open-bamboo-networking) | master · `980581029038712672339df9d59405a89026b225` | 2026-11-22 | [AGPL v3 ou ultérieure](https://github.com/ClusterM/open-bamboo-networking/blob/980581029038712672339df9d59405a89026b225/LICENSE) | Remplacement indépendant avec transports caméra et recherche ABI. L’ancien nom `ClusterM/open-bambu-networking` redirige vers celui-ci. |
| [leolobato/bambu-gateway](https://github.com/leolobato/bambu-gateway) | main · `135d90bcaa9e08e34f89ea2703ed89203c20ac8e` | 2026-11-24 | [MIT](https://github.com/leolobato/bambu-gateway/blob/135d90bcaa9e08e34f89ea2703ed89203c20ac8e/LICENSE) | Passerelle LAN et mode cloud expérimental chargé via plugin officiel ; architecture de processus séparé intéressante, pas SDK cloud ouvert. |
| [Doridian/OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI) | main · `cc383a2c96576a9f53391c879acfb8dca5c534e4` | 2026-08-07 | [GNU FDL 1.3](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/LICENSE.md) | Documentation communautaire des protocoles LAN et cloud, pas licence MIT de code ni garantie constructeur. |
| [m1guelpf/bambulab-rs](https://github.com/m1guelpf/bambulab-rs) | main · `56ec0be96afe1fec57dba794f6bebf9beeaa4435` | 2024-04-22 | [MIT](https://github.com/m1guelpf/bambulab-rs/blob/56ec0be96afe1fec57dba794f6bebf9beeaa4435/LICENSE) | Client Rust REST limité ; ne fournit pas le transport caméra cloud. |
| [coelacant1/Bambu-Lab-Cloud-API](https://github.com/coelacant1/Bambu-Lab-Cloud-API) | main · `29458fdd5b7ef7f8f71781aadccfb917c3ebed45` | 2025-10-29 | [GPL v3](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/LICENSE) | REST/MQTT et vidéo LAN ; récupération TTCode ne constitue pas un décodeur P2P. |
| [greghesp/ha-bambulab](https://github.com/greghesp/ha-bambulab) | main · `063313b8da81caea1fe6ef278b7ce9bf9de6cdb1` | 2026-11-24 | [MIT](https://github.com/greghesp/ha-bambulab/blob/063313b8da81caea1fe6ef278b7ce9bf9de6cdb1/LICENSE) | Implémentation cloud pour supervision, caméra RTSPS/JPEG locale et gestion du liveview désactivé. |

Ces licences concernent les dépôts indiqués. Elles n’accordent pas de licence sur un plugin Bambu distribué séparément, sur un SDK ThroughTek/Agora, sur des certificats privés ou sur l’accès à un service cloud. Cette recherche n’introduit aucune dépendance et ne transplante aucun code de ces projets.

## Interface officielle visible dans BambuStudio

[NetworkAgent.hpp](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/Utils/NetworkAgent.hpp) déclare notamment :

```cpp
int get_camera_url(std::string dev_id,
                   std::function<void(std::string)> callback);
int get_camera_url_for_golive(std::string dev_id, std::string sdev_id,
                              std::function<void(std::string)> callback);
```

Le typedef du symbole dynamique ajoute le pointeur `void* agent`. La présence de cette signature décrit l’ABI consommée par Studio ; elle ne publie pas l’algorithme serveur de création des credentials et ne constitue pas une autorisation d’usage externe.

[MediaPlayCtrl.cpp](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/GUI/MediaPlayCtrl.cpp) distingue les chemins locaux `bambu:///local/…?port=6000`, `bambu:///rtsps___…/streaming/live/1?proto=rtsps`, `bambu:///rtsp___…` et les protocoles distants TUTK/Agora. Le paramètre de requête peut combiner identité de machine, version de firmware et protocoles acceptés ; un simple numéro de série n’épuise donc pas tous les appels faits par Studio. Les URLs `bambu:` sont des paramètres du consommateur propriétaire, pas des URLs HTTP/RTSP universelles.

[BambuTunnel.h](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/GUI/Printer/BambuTunnel.h) expose les structures `Bambu_StreamInfo`, `Bambu_Sample`, les retours dont `Bambu_would_block`, et les fonctions du module BambuSource. [wxMediaCtrl3.cpp](https://github.com/bambulab/BambuStudio/blob/8e524a39d4c4cd0541801c1c46d2f77debb0bf1d/src/slic3r/GUI/wxMediaCtrl3.cpp) consomme la séquence :

`Bambu_Create` → `Bambu_Open` → `Bambu_StartStream` → `Bambu_GetStreamInfo` → `Bambu_ReadSample` en boucle → `Bambu_Close` → `Bambu_Destroy`.

`Bambu_StartStream` et la lecture peuvent retourner `Bambu_would_block` ; le consommateur effectue les attentes/reprises puis décode les échantillons. Le callback d’URL n’est donc que la première étape d’un pipeline natif. Les variantes de plateforme et de version doivent être vérifiées, pas supposées identiques à partir d’une capture Studio 2.9.

## Transports : ce que les sources établissent

| Chemin | Source primaire figée | Ce qui est établi dans la source | Ce qui reste à vérifier |
| --- | --- | --- | --- |
| P2S / X1 LAN RTSPS | [OpenBambuAPI video.md](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/video.md) | `rtsps://<printer-ip>:322/streaming/live/1`, utilisateur `bblp`, code d’accès LAN. | Disponibilité exacte sur le firmware P2S du laboratoire ; réglage liveview, TLS, auth, stabilité et concurrence. |
| A1 / P1 JPEG LAN | [bambu-gateway camera_proxy.py](https://github.com/leolobato/bambu-gateway/blob/135d90bcaa9e08e34f89ea2703ed89203c20ac8e/app/camera_proxy.py) | Connexion locale port 6000 et redistribution des images ; le module annonce une seule session upstream pour plusieurs consommateurs. | Ne pas appliquer ce transport JPEG au P2S par analogie du nom P1/P2. |
| Cloud : credentials | [coelacant1 client.py](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/bambulab/client.py) | `get_camera_credentials`, `get_ttcode` et `get_cloud_video_url` aboutissent au même POST `v1/iot-service/api/user/ttcode`. | Ces noms ne garantissent pas une URL vidéo : le résultat est un objet de credentials. Aucun appel effectué ici. |
| Cloud : transport vidéo | [OpenBambuAPI cloud-video.md](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/cloud-video.md) | Décrit TUTK/Kalay P2P et Agora derrière les URLs `bambu:` ; TUTK transporte des échantillons après négociation. | Permissions du service, versions, routes NAT/relay, comportement hors LAN et intégration autorisée ; pas un flux FFmpeg directement consommable. |
| Implémentation TUTK indépendante | [ClusterM TutkCameraSource.cpp](https://github.com/ClusterM/open-bamboo-networking/blob/980581029038712672339df9d59405a89026b225/src/camera/TutkCameraSource.cpp) et [abi_camera.cpp](https://github.com/ClusterM/open-bamboo-networking/blob/980581029038712672339df9d59405a89026b225/src/abi_camera.cpp) | Code de parsing `bambu:///tutk`, ouverture de session, récupération de frames et sélection LAN/cloud. | Ne pas conclure « TTCode rend tout impossible sans SDK propriétaire » ; ce code existe. Il ne constitue toutefois pas une voie approuvée et prête à importer dans FabCore. |
| Caméra avec supervision cloud | [ha-bambulab camera.py](https://github.com/greghesp/ha-bambulab/blob/063313b8da81caea1fe6ef278b7ce9bf9de6cdb1/custom_components/bambu_lab/camera.py), [utils.py](https://github.com/greghesp/ha-bambulab/blob/063313b8da81caea1fe6ef278b7ce9bf9de6cdb1/custom_components/bambu_lab/pybambu/utils.py) | Le flux RTSPS utilise l’adresse machine et son code ; `disable`/adresse absente/code absent ne donnent aucune source. Le code utilise les timestamps d’arrivée pour les sauts DTS P2S/X1. | Pas une preuve de caméra cloud : le fait que l’intégration se connecte au cloud pour la supervision ne change pas la route de son flux caméra. |

Le [README de coelacant1](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/API_CAMERA.md) contient des déclarations générales sur la disponibilité cloud, le SDK et les FPS. Elles sont anciennes, dépassent ce que prouve son code et ne doivent pas devenir des garanties produit. Son [video.py](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/bambulab/video.py) implémente les chemins LAN ; son client TTCode ne décode pas TUTK. Le [lib.rs de m1guelpf](https://github.com/m1guelpf/bambulab-rs/blob/56ec0be96afe1fec57dba794f6bebf9beeaa4435/src/lib.rs) expose login/profil/machines/tâches, sans pipeline caméra.

Le [README actuel de bambu-gateway](https://github.com/leolobato/bambu-gateway/blob/135d90bcaa9e08e34f89ea2703ed89203c20ac8e/README.md) annonce désormais un mode cloud expérimental opt-in via plugin fermé officiel, avec contraintes de plateforme. Le réduire à une passerelle uniquement LAN serait donc inexact. Son [plugin_host.py](https://github.com/leolobato/bambu-gateway/blob/135d90bcaa9e08e34f89ea2703ed89203c20ac8e/app/cloud/plugin_host.py) montre l’isolation en sous-processus et RPC JSONL ; cela inspire une frontière d’architecture, sans autoriser redistribution ni réemploi automatique de ses mécanismes.

## Suite possible : worker natif, après qualification de l’API permise

La vidéo distante demeure un jalon distinct. Avant tout développement de transport natif, obtenir une interface/SDK partenaire ou un mode d’intégration effectivement permis pour l’identité de FabCore ; documenter conditions d’usage et de distribution, plateformes, API de session, formats de frames et compatibilité des versions. Les signatures du source Studio suffisent à poser les questions techniques, pas à résoudre ces autorisations.

Si cette voie est disponible, prévoir un worker natif séparé du processus HTTP : session caméra bornée, expiration/annulation, redémarrage après blocage, backpressure, ressources limitées et arrêt complet au logout. Le contrat devrait séparer les informations de codec des échantillons encodés, puis fournir un transport navigateur adapté. Aucun TTCode, mot de passe, jeton, URL authentifiée ou payload de session ne doit sortir dans API utilisateur, SSE ou journaux. Ne jamais substituer un accès LAN à un échec cloud sans choix explicite.

Pas de récupération de clé/certificat depuis Studio, d’imitation de son identité, de reproduction des suffixes de fingerprint pour débloquer le plugin, ni de transplantation du parcours de signature de ClusterM. Pas de redistribution du binaire propriétaire. Un refus d’autorisation reste un diagnostic ; il ne déclenche pas une tentative de contournement.

## Recette encore nécessaire

Le premier incrément doit faire l’objet d’un essai explicitement autorisé sur P2S, en relevant firmware, mode cloud conservé, réglage liveview et source affichée. Vérifier ouverture/arrêt/reconnexion, concurrence avec Studio, absence de secret et maintien de la télémétrie cloud quand le flux local échoue. Toute affirmation de vidéo distante exigera ensuite un essai depuis un réseau réellement distinct, sans route LAN/VPN masquée, et une vérification de la méthode autorisée. **Aucun de ces essais n’est réalisé par cette note.**
