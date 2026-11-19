# Audit complémentaire Bambu Cloud · 19 novembre 2026

**Périmètre :** lecture du code, historique des dépôts, comparaison des clients et essais Python locaux simulés. Aucun login réel, accès à un compte, émission MQTT ou commande machine. Aucun résultat ci-dessous ne constitue un essai de compatibilité P2S cloud.

## Sources figées et méthode

| Projet | Révision examinée | Fichiers réellement lus |
| --- | --- | --- |
| m1guelpf/bambulab-rs | `56ec0be96afe1fec57dba794f6bebf9beeaa4435`, 22/04/2024 | `src/lib.rs`, `src/types.rs`, `Cargo.toml` |
| zhaobenny/bambulab-cloud-py | `83413ffa3d71746386000c1dbc78e67f00793bb4`, 15/07/2024 date auteur ; paquet PyPI 0.0.1 publié le 16/07/2024 | `client.py`, `models.py`, `pyproject.toml` |
| coelacant1/Bambu-Lab-Cloud-API | `29458fdd5b7ef7f8f71781aadccfb917c3ebed45`, 29/10/2025 | `bambulab/client.py`, `auth.py`, `mqtt.py`, `video.py`, tests MQTT et README |
| greghesp/ha-bambulab | `d2793d837648967f631d34a5b2f468a94099bef0` | `bambu_cloud.py`, `bambu_client.py`, `commands.py`, `models.py`, `const.py`, `config_flow.py` |

Les deux premiers projets n’ont pas reçu de commit plus récent dans la recherche GitHub effectuée : Rust deux commits, Python un commit. « Ancien » n’implique pas inutilisable ; cela impose de requalifier les parcours de connexion et les nouveaux schémas firmware. La licence MIT des deux clients permet leur étude/réutilisation avec les notices requises, pas une garantie de disponibilité du service.

## 1. Ce que font les deux nouveaux clients

| Fonction | Rust 0.1.1 | Python 0.0.1 |
| --- | --- | --- |
| Login email/mot de passe | POST login, exige `accessToken` | Même chemin et attente |
| Challenges email / TOTP | Pas de parcours implémenté | Pas de parcours implémenté |
| Profil / machines / historique | Trois méthodes GET | Portage de ces méthodes |
| Historique complet | Une requête `limit=500`, pas de boucle de pagination | Identique ; `total` non utilisé pour paginer |
| Broker MQTT | Renvoie seulement le nom d’hôte | Idem, aucune connexion MQTT |
| Vidéo | Obtient TTCode et construit `bambu:///…` | Portage ; défaut de type d’URL reproduit ci-dessous |
| Upload / lancement / pause / reprise / stop | Aucune méthode trouvée | Aucune méthode trouvée |
| Refresh de jeton | Aucun parcours trouvé | Aucun parcours trouvé |

Points d’entrée vérifiés : login `/v1/user-service/user/login`, profil `/v1/user-service/my/profile`, machines `/v1/iot-service/api/user/bind`, historique `/v1/user-service/my/tasks`. Chine utilise `.cn`, les autres régions `.com`. Champs machine : notamment `dev_id`, `online`, `print_status`, modèle, diamètre et code d’accès. La présence d’un code d’accès LAN dans une réponse ne rend pas son IP joignable depuis un VPS.

Ces deux liens ne sont pas deux confirmations indépendantes : le Python annonce explicitement être un portage du Rust. Ils éclairent surtout le contrat HTTP historique. Les modèles de réponse exigent beaucoup de champs et ont peu de tolérance aux absences : ne pas recopier leur schéma entier comme contrat obligatoire FabCore.

Sources : [Rust lib.rs figé](https://github.com/m1guelpf/bambulab-rs/blob/56ec0be96afe1fec57dba794f6bebf9beeaa4435/src/lib.rs), [types.rs](https://github.com/m1guelpf/bambulab-rs/blob/56ec0be96afe1fec57dba794f6bebf9beeaa4435/src/types.rs), [Python client.py](https://github.com/zhaobenny/bambulab-cloud-py/blob/83413ffa3d71746386000c1dbc78e67f00793bb4/bambulab_cloud/client.py), [models.py](https://github.com/zhaobenny/bambulab-cloud-py/blob/83413ffa3d71746386000c1dbc78e67f00793bb4/bambulab_cloud/models.py), [PyPI](https://pypi.org/project/bambulab-cloud/).

## 2. Caméra : identifiants de session et décodage sont deux étapes

Le Rust appelle POST `/v1/iot-service/api/user/ttcode` avec `dev_id`, Bearer et `user-id`, puis assemble un URI propriétaire contenant TTCode/authkey/passwd/région. Il ne décode aucun flux. Le Python reprend ce mécanisme ; son auteur indique en commentaire ne pas savoir utiliser cet URI. Il emploie `HttpUrl` pour un schéma `bambu`, incompatible avec la validation Pydantic examinée.

**Reproduction locale, Pydantic 2.13.4 / HTTPX 0.28.1 / PyJWT 2.13.0 :** en invoquant la vraie méthode Python `Device.get_bambu_camera_url()` avec une réponse HTTP simulée contenant les quatre champs, une `ValidationError` est levée (« URL scheme should be http or https »). Ce défaut existe même sans contacter Bambu. Résultat borné à cet environnement de dépendances ; pas de conclusion sur tous les anciens environnements Python.

Le fichier `video.py` de coelacant1 fournit, lui, des lecteurs visant l’IP locale (RTSPS X1, TCP JPEG P1/A1). Il ne prouve donc pas un relais TUTK cloud vers un navigateur. Pour FabCore : lot caméra distante séparé, session à courte durée de vie, secrets jamais dans les journaux ni les URL publiques, et décodeur/passerelle réellement qualifié avant annonce de compatibilité.

## 3. Correction importante sur coelacant1

La première recherche s’appuyait trop sur le README « non implémenté ». **Le code contredit cette mention.**

- `mqtt.py` définit `pause_print`, `resume_print`, `stop_print` et publie les payloads `print.command=pause|resume|stop`.
- `client.py` définit `start_print_job` et `start_cloud_print` ; le premier tente POST `/v1/iot-service/api/user/print`.
- Les tests de commandes MQTT examinés remplacent la connexion par un mock et vérifient le topic/payload. Le chemin de publication ne corrèle pas une réponse machine et ne confirme pas un état final.

La conclusion exacte est **méthodes implémentées, exécution cloud actuelle non démontrée**, et non « commandes inexistantes ». La présence d’un wrapper HTTP de lancement ne prouve pas que son endpoint accepte aujourd’hui les droits et paramètres d’un compte réel. Même prudence avec les payloads de chauffe non validés.

Autres limites concrètes : `get_or_create_token` recharge/vérifie le jeton puis refait un login si nécessaire, ce n’est pas un protocole refresh démontré ; le broker MQTT est configuré dans la classe et doit être adapté pour les régions ; les messages reçus remplacent `last_data`, sans fusion de rapports partiels. Pour FabCore, garder notre normaliseur de deltas et notre corrélation/absence de rejeu, pas une copie de ce client.

Sources : [mqtt.py figé](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/bambulab/mqtt.py), [client.py](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/bambulab/client.py), [tests MQTT](https://github.com/coelacant1/Bambu-Lab-Cloud-API/blob/29458fdd5b7ef7f8f71781aadccfb917c3ebed45/tests/unit/test_mqtt_commands.py).

## 4. Mise à jour officielle du 12 novembre 2026

[Annonce Bambu du 12/11/2026](https://forum.bambulab.com/t/a-postmortem-on-this-weeks-cloud-traffic-anomaly/262567) : supervision tierce maintenue dans des limites raisonnables ; lancement, vidéo et autres opérations sensibles ne sont pas conçus pour un accès tiers direct ; Bambu Connect est la voie indiquée pour le contrôle. Ce texte est plus récent que les clients de 2024/2025.

L’incident concernait des appels répétés à `my/tasks`. [Issue ha-bambulab #2244](https://github.com/greghesp/ha-bambulab/issues/2244) et [correctif #2248](https://github.com/greghesp/ha-bambulab/pull/2248), fusionné le 11 novembre : une erreur de chargement de média provoquait de nouvelles demandes à chaque rapport MQTT. Le correctif rétablit le comportement et une identité propre au projet. Ne pas reprendre une identité Orca/Bambu, et ne pas relire l’historique à chaque mise à jour de température.

## 5. Ce qui est exploitable pour FabCore

| Bloc | Base concrète | Action proposée |
| --- | --- | --- |
| Comptes et import | Auth ha-bambulab récente + schéma machines recoupé Rust/Python | Session d’auth par compte, code temporaire, réauth, liste puis sélection de machines |
| Supervision distante | Client MQTT cloud existant dans ha-bambulab ; TLS et compte distincts du LAN | Réutiliser la normalisation Bambu FabCore, une connexion bornée par compte et des topics autorisés |
| Historique | GET tasks est documenté et implémenté | Cache par compte/machine, accès à la demande ; pas de polling de cet endpoint au rythme MQTT |
| Contrôle d’impression | Payloads présents dans coelacant1/ha-bambulab | Vérifier chemin autorisé actuel Bambu Connect/partenaire ; ne pas promettre leur acceptation par un SaaS direct |
| Vidéo cloud | Identifiants TTCode seulement dans Rust/Python | Qualifier session P2P + passerelle ; agent si le chemin retenu reste LAN |
| Fichiers | Stockage cloud distinct du stockage local | Tester upload, enregistrement projet, plateau et lancement séparément ; aucun accès USB présumé |

Conception proposée pour limiter la charge, **pas quota officiel Bambu** : imports/profils à la demande, lectures historiques regroupées et mises en cache, une requête identique en vol par compte, bornes de concurrence, 429/Retry-After et backoff avec jitter, disjoncteur si échec persistant. Les statuts de température viennent du MQTT, sans appel REST à chaque push. Aucun retry automatique de commande de fabrication.

Multicomptes : indexer les caches et sessions par compte interne et série, fermer le compte révoqué sans toucher aux autres, dédupliquer l’identité physique avant ajout, maintenir LAN OU cloud actif par machine. Un login individuel fonctionnel ne valide pas à lui seul les conditions et limites d’exploitation d’un SaaS partagé.

## 6. Vérifications réalisées et inconnues restantes

- Lecture des fichiers listés, recherche des fonctions et comparaison avec README, historique GitHub et sources officielles.
- Deux réponses synthétiques `loginType=verifyCode` / `tfa` sont refusées par le modèle Python `LoginResponse`, qui exige `accessToken` : absence de parcours challenge reproduite localement.
- Un transport `httpx.MockTransport`, sans réseau, confirme une seule requête tasks `limit=500&deviceId=…`, même quand la réponse annonce `total=1000` : pas de pagination automatique.
- La méthode caméra Python échoue sur le schéma propriétaire avec une réponse simulée complète, comme décrit plus haut.
- Aucun test cloud réel ; aucun essai sur compte, modèle ou firmware. Restent à qualifier : accès actuel depuis l’hébergement retenu, auth/challenge, permissions par fonction, débit admis, vidéo P2P et intégration autorisée pour le SaaS.

**Prochaine action :** après #78, faire le pilote #79 comptes + import + supervision MQTT. Garder commandes et vidéo dans des capacités séparées ; si le contrôle direct n’est pas disponible/autorisé, qualifier Bambu Connect ou l’agent, sans masquer la limitation.

## 7. SimplyPrint : API publique de plateforme et pont vers Bambu

Vérification du lien utilisateur [API SimplyPrint FR](https://simplyprint.io/fr/features/api), puis [API Bambu SimplyPrint](https://simplyprint.io/features/api/bambu-lab-api), [guide P2S](https://simplyprint.io/setup-guide/bambu-lab/p2s) et [aide LAN/cloud](https://help.simplyprint.io/en/article/bambu-lab-integration-lan-only-vs-bambu-cloud-2eof1u/), consultés le 19/11/2026.

L’API REST existe bien : hôte `api.simplyprint.io`, compte `companyId`, clé `X-API-KEY` ou OAuth2 pour les intégrations tierces. Elle expose les fonctions de la plateforme SimplyPrint. Elle ne constitue pas une API publique Bambu ni une preuve d’accès direct aux machines depuis un VPS.

Le guide P2S impose le client SimplyPrint sur le LAN ; le pilotage complet utilise LAN-only + Developer Mode. Le mode Bambu Cloud sur firmware actuel est de la supervision ; la caméra exige aussi un accès local dans leur architecture. Ce fonctionnement est analogue au rôle envisagé pour l’agent FabCore, sans que cela interdise notre propre pilote MQTT distant de lecture seule.

Attention aux contradictions éditoriales : la page API Bambu évoque la coexistence avec Bambu Handy et un contrôle uniforme, alors que sa section connexion et les guides limitent les actions en cloud. Pour la compatibilité P2S, retenir les prérequis détaillés plutôt que généraliser les exemples REST. Aucun compte SimplyPrint connecté et aucun appel authentifié testé.

Conséquence : un connecteur FabCore → SimplyPrint serait un service tiers supplémentaire (compte, droits API, offre et OAuth à qualifier), pas une façon de supprimer leur pont local. Aucun ajout à l’architecture ni abonnement engagé ; pour FabCore indépendant, conserver cloud constructeur en lecture seule et agent pour les fonctions locales qualifiées.
