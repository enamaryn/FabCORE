# Bambu Cloud · recherche et plan d’intégration

Relevé du **19 novembre 2026**. État : recherche documentaire, **non implémenté, non connecté, non testé avec un compte utilisateur**. Suivi [#79](https://github.com/enamaryn/FabCORE/issues/79), après l’urgence [#78](https://github.com/enamaryn/FabCORE/issues/78). Le LAN existant n’est pas migré.

Audit complémentaire du code : [BAMBU-CLOUD-AUDIT.md](BAMBU-CLOUD-AUDIT.md). Ce complément corrige la conclusion initiale tirée du README de coelacant1 et intègre la position officielle du 12 novembre 2026.

## Conclusion technique

Un VPS peut accéder à la télémétrie d’une machine reliée au cloud Bambu, sans joindre son IP privée. Cela peut éviter un agent pour cette fonction. Ce constat ne prouve ni accès aux fichiers USB/cache, ni vidéo distante prête au navigateur, ni autorisation de toutes les commandes.

| Fonction | Éléments trouvés | Statut FabCore |
| --- | --- | --- |
| Authentification | HTTPS, identifiants puis challenge email ou TOTP selon réponse | À implémenter et tester |
| Machines du compte | GET `/v1/iot-service/api/user/bind` | Candidat pour import explicite |
| Supervision | MQTT TLS 8883, compte cloud et jeton | Premier pilote proposé |
| Pause/reprise/annulation | Payloads MQTT communautaires ; autorisations variables | Non validées sur P2S cloud |
| Upload et lancement | Stockage cloud/URL signée et tâche d’impression, plusieurs étapes | Jalons distincts, non validés |
| Fichiers locaux | FTPS local ne devient pas accessible depuis un VPS par un login cloud | Pas de parité présumée |
| Vidéo | TTCode/TUTK et exemples de lecture LAN dans les sources | Recherche séparée ; pas de flux distant garanti |
| Arrêt d’urgence | Aucune garantie indépendante du réseau/cloud | Ne pas substituer un stop de job |

## Authentification et transport à vérifier

Les références communautaires décrivent `https://api.bambulab.com` et `https://api.bambulab.cn`, et MQTT `us.mqtt.bambulab.com:8883` hors Chine / `cn.mqtt.bambulab.com:8883` en Chine. « us » n’implique pas qu’un compte Europe doit être configuré en région États-Unis. Ne pas accepter un hôte arbitraire fourni par un utilisateur.

Login documenté : POST `/v1/user-service/user/login`. Si `loginType=verifyCode`, envoi de code via `/v1/user-service/user/sendemail/code`, puis vérification ; si `loginType=tfa`, parcours TOTP séparé avec état temporaire. Les hôtes/chemins du portail MFA peuvent évoluer : les fixer après recoupement du code actuel et essai autorisé, pas depuis un exemple ancien.

Sur MQTT cloud, l’utilisateur est typiquement `u_<uid>` (ou la valeur username retournée/extraite du contexte d’authentification), le mot de passe est le jeton de compte. En LAN, c’est `bblp` et le code machine : ne pas mélanger. Topics par série : `device/<serial>/report` et `/request`. Le serveur doit vérifier l’appartenance réelle de la série au compte avant abonnement ou commande. Décoder un JWT n’en valide pas la signature et ne constitue pas une autorisation FabCore.

Durée/renouvellement : sources contradictoires sur refresh et expiration. Ne pas coder « 24 h » ou « 90 jours » comme garantie ; exploiter les données reçues et traiter 401/403, révocation et réauthentification. Une coupure cloud laisse les commandes non confirmées sans rejeu. Respecter 429/Retry-After, temporisation progressive des lectures et quota par compte ; ne pas multiplier les demandes de codes.

## Évaluation des sources fournies

- [coelacant1/Bambu-Lab-Cloud-API](https://github.com/coelacant1/Bambu-Lab-Cloud-API) : source de rétro-ingénierie utile, modules auth/devices/files/MQTT/camera. Son README indique jobs/pause/reprise/stop non implémentés, **mais contredit le code** : `mqtt.py` contient `pause_print/resume_print/stop_print`, et `client.py` contient `start_print_job/start_cloud_print`. Ces fonctions existent ; leurs tests examinés ne prouvent pas leur acceptation sur le cloud actuel. La première version de cette fiche concluait trop vite depuis le README ; voir l’audit source. Les credentials caméra TTCode ne prouvent pas un décodage vidéo cloud opérationnel.
- [Paquet PyPI](https://pypi.org/project/bambu-lab-cloud-api/) : distribution du même projet, pas une seconde validation indépendante. Ne pas ajouter une dépendance Python à FabCore Node simplement parce que ce paquet existe.
- [torbenconto/bambulabs_api](https://pkg.go.dev/github.com/torbenconto/bambulabs_api) : LAN, pas le cloud. Le README renvoie à [bambulabs_cloud_api](https://github.com/torbenconto/bambulabs_cloud_api), dont le README annonce une réécriture et pas de documentation. Aucune garantie de maturité cloud déduite de la bibliothèque LAN.
- [OpenBambuAPI cloud HTTP](https://github.com/Doridian/OpenBambuAPI/blob/main/cloud-http.md) et [MQTT](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md) : formats à recouper avec une implémentation actuelle.
- [ha-bambulab](https://github.com/greghesp/ha-bambulab), commit consulté `d2793d837648967f631d34a5b2f468a94099bef0` : `custom_components/bambu_lab/pybambu/bambu_cloud.py`, `bambu_client.py`, `const.py` et parcours `config_flow.py`. Confirme la séparation auth email/TOTP, comptes et paramètres MQTT LAN/cloud. Certains mécanismes de client/challenge ne sont pas à reprendre tels quels.

## Autorisations constructeur et SaaS

Position officielle récente : [Bambu, 12 novembre 2026](https://forum.bambulab.com/t/a-postmortem-on-this-weeks-cloud-traffic-anomaly/262567) distingue supervision tierce dans des limites raisonnables et opérations sensibles (lancement, vidéo notamment), en renvoyant vers Bambu Connect pour le contrôle. Ne pas promettre un pilotage SaaS direct complet depuis l’existence d’une méthode dans un ancien client.

Sources officielles : [annonce d’autorisation](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/), [intégration tierce et fermes](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/), [clarification cloud du 8 mai 2026](https://forum.bambulab.com/t/setting-the-record-straight-on-cloud-access-and-community/252164).

Bambu distingue accès au code open source et accès à son service cloud privé ; les droits d’un utilisateur ne garantissent pas une API publique pour un SaaS tiers. La voie partenaire pour logiciels de ferme est mentionnée (`devpartner@bambulab.com`). **Aucun contact envoyé.** Il faut qualifier le mode d’intégration autorisé avant de proposer les commandes critiques à des clients. Ne pas imiter l’identité d’un client officiel, reprendre des certificats privés, ni automatiser un contournement de challenge. En cas de blocage, afficher le diagnostic et conserver LAN/agent comme option.

## Modèle multicomptes et multisite proposé

Contrat à intégrer progressivement, sans réécrire les connecteurs LAN :

- Compte constructeur : identifiant interne, fabricant, région, alias, propriétaire/espace, secret chiffré, état de connexion et dates de validité.
- Machine : identité physique/série et une seule connexion active choisie `lan` OU `cloud` ; compte constructeur référencé pour cloud, site/agent pour LAN. Aucun basculement automatique sur une autre identité ou un autre compte.
- Plusieurs comptes du même fabricant dans un espace, plusieurs gestionnaires et sites. Deux CC2 ou deux P2S peuvent relever de comptes/modes distincts. Une adresse email n’est pas une clé globale d’autorisation.
- Vérifier les permissions d’espace, de compte et de machine sur chaque route ; isoler sessions, caches, flux, fichiers et diagnostics. Réutiliser le normaliseur Bambu, pas les contraintes d’origine IPv4 privée du connecteur LAN pour un broker cloud.
- Secrets uniquement côté serveur, chiffrement au repos avec clé indépendante des sauvegardes, masquage intégral des jetons/codes/mots de passe/URL signées dans API et logs. Mot de passe et code MFA uniquement transitoires. Suppression du compte = fermeture des sessions et suppression de ses secrets ; aucune commande automatique.

## Cas SimplyPrint

Son [API publique](https://simplyprint.io/fr/features/api) est celle de sa plateforme. Le [guide P2S](https://simplyprint.io/setup-guide/bambu-lab/p2s) précise le pont local et LAN-only + Developer Mode pour piloter ; ce n’est pas une preuve de commande directe Bambu Cloud sans agent. [Analyse et différences entre pages](BAMBU-CLOUD-AUDIT.md#7-simplyprint--api-publique-de-plateforme-et-pont-vers-bambu).

## Livraison et recette

1. Urgence #78 et confirmation des états ; ne pas étendre une sémantique Stop ambiguë au cloud.
2. Compte cloud, choix de région, authentification avec challenge, déconnexion/réauthentification. Tester faux code, code expiré, 401/403/429 et absence de secret dans les réponses.
3. Import des machines et lecture seule MQTT : températures, progression, AMS et fraîcheur des données. Deux comptes simultanés, y compris deux imprimantes du même modèle, sans croisement ni doublon.
4. Recette réelle sur P2S avec firmware relevé et connexion cloud choisie explicitement. Ne pas changer son mode actuel à distance sans demande.
5. Commandes autorisées avec identifiant corrélé et état final ; essais supervisés de pause/reprise/annulation, sans rejeu après délai ou reconnexion.
6. Upload cloud puis lancement avec plateau et paramètres réels, distincts du transfert LAN. Vidéo distante comme chantier séparé ; maintenir l’agent quand une fonction nécessite le réseau local.

Les tests automatisés de protocole devront simuler les refus et réponses partielles ; ils ne seront pas décrits comme une validation des serveurs Bambu ou du matériel.

## Migration du pilote TypeScript · MIG-02.2.2

En revue le 22 novembre 2026 : `connectors/bambu/src/cloud-http.ts` (`createCloudHttp`) porte les véritables requêtes d’authentification/inventaire, l’erreur typée commune et le masquage `safeCloudPayload` ; `cloud-monitor.ts` porte la supervision MQTT. `poc/cloud-accounts.mjs` garde le chiffrement, les comptes, la persistance, les journaux, l’appartenance des challenges, les verrous et limitations d’essais. `poc/bambu-cloud-monitor.mjs` injecte les projections des températures et AMS. Aucune commande, vidéo cloud, bascule LAN ou nouvelle méthode d’authentification ajoutée.

| Échange conservé | Endpoint / message | Bornes et portée |
| --- | --- | --- |
| Login et vérification email | POST `/v1/user-service/user/login` | Hôte régional api.bambulab.com/cn ; code envoyé une seule fois par la demande de login, aucun second email explicite |
| Vérification TOTP | GET portail `/api/csrf` puis POST `/api/sign-in/tfa` | Cookie CSRF + en-tête ; challenge rattaché au demandeur par l’application |
| Inventaire | GET `/v1/iot-service/api/user/bind` | 200 entrées maximum, séries filtrées et dédoublonnées ; statut d’impression distinct de l’authentification |
| Identité MQTT | JWT ou GET `/v1/design-user-service/my/preference` | Nom `u_…`, jeton jamais publié dans les logs |
| Suivi | MQTT TLS 8883 sur us.mqtt.bambulab.com ou cn.mqtt.bambulab.com | Abonnements aux seules séries inventoriées ; seuls `pushall` et `get_version` publiés, QoS 0 sans rétention, au plus une demande par 5 min |

HTTPS conserve `redirect:error`, délai 8 s, réponse bornée à 1 Mio, gestion 400/401/403/429 et annulation. MQTT conserve fusion incrémentale des rapports/plateaux AMS, modules et séries, fraîcheur 60 s, vidage à la coupure et arrêt des reconnexions après refus d’authentification. Mots de passe, codes, cookies, jetons et clés restent masqués ; les réponses inconnues utiles au diagnostic restent bornées.

Tests existants `poc/cloud-accounts.test.mjs` et `poc/bambu-cloud-monitor.test.mjs` inchangés ; tests directs `connectors/bambu/test/cloud-{http,monitor}.test.ts`. Aucun compte cloud réel sollicité ni nouveau résultat matériel revendiqué. Recette après déploiement demandé : login unique, saisie du code, inventaire, températures/AMS, journal expurgé et déconnexion.
