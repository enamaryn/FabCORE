# BBL-CRYPTO-01 — Identité FabCore et autorisation applicative

Consultation : 2026-11-24 UTC. Recherche documentaire uniquement ; aucun accès à une imprimante, aucune extraction de secret, aucun essai de commande. Les observations communautaires ne constituent ni une API officielle ni une preuve de compatibilité générale.

## Conclusion vérifiable

Une procédure officielle d’émission d’un certificat pour une clé appartenant au développeur existe désormais **pour l’API Fleet Hub**. Le Developer Center permet l’activation de l’accès après accord contractuel ; le livre blanc Fleet Hub v1.0 du 2026-05-20, §2.2.1.2, précise : paire de clés générée par le développeur, envoi de la clé publique, émission d’un certificat client X.509 par Bambu Lab, au plus cinq certificats, RSA d’au moins 2048 bits. Le certificat sert au mTLS avec **Fleet Hub**. L’activation cloud emploie un autre identifiant ; les appels API locaux utilisent ensuite un compte et un jeton. Ce parcours ne prouve pas qu’un certificat utilisateur peut devenir une identité de signature native sur n’importe quelle imprimante.

Sources officielles : [Developer Center international](https://bambulab.com/en/fleet-hub/developer) ; [Developer Center chinois, page effectivement lisible](https://bambulab.cn/zh-cn/fleet-hub/developer) ; [Fleet Hub Technical White Paper v1.0](https://portal.bblmw.com/fleet-hub/wb76oog4i8k/files/Fleet%20Hub%20Technical%20White%20Paper%20EN%20v1.0.pdf), pp. 8–11. Le document précise aussi que les imprimantes gérées par Fleet Hub fonctionnent en LAN et sans services cloud/Handy ; ne pas promettre le maintien du mode cloud.

Dans les autres sources examinées, aucune interface publique officielle générique permettant d’enrôler librement sa propre CA/clé pour signer les commandes natives de toute imprimante en mode cloud n’a été établie. Cette conclusion porte sur les sources consultées, pas sur une preuve d’inexistence. Le canal partenaire annoncé reste `devpartner@bambulab.com`.

## Couches à maintenir séparées

| Couche | Fonction | Ce qu’elle ne démontre pas |
|---|---|---|
| TLS serveur et CA de confiance | Chiffrement du transport et authentification du serveur ; vérifier chaîne et nom attendu | Droit de commander une machine ou de signer des messages |
| Identifiants MQTT | Authentification au broker ; documentation communautaire : accès LAN par code propriétaire, cloud par jeton de compte | Autorisation automatique des opérations critiques |
| Signature applicative | Autorisation de certaines commandes, distincte de la connexion MQTT | Une CA de laboratoire n’est pas une identité Bambu autorisée |
| Certificat client Fleet Hub | Authentification mTLS à l’API officielle du Hub | Accès direct au broker natif d’une imprimante ou signature app native |
| Identités FabCORE de laboratoire | Clés propres, CA locale, ACL et signatures entre services simulés | Compatibilité ou confiance implicite avec l’écosystème constructeur |

Le [Security White Paper officiel 2025.09](https://cdn1.bambulab.com/trust-center/file/bambulab-security-whitepaper-en.pdf), §2.3.4, pp. 12–13, décrit la vérification des commandes et l’authentification des logiciels par le plugin réseau ; il présente Bambu Connect et LAN Only/Developer Mode comme parcours d’intégration. Les extraits officiels indexés étaient consultables, mais le téléchargement intégral de ce PDF a échoué (402) : ne pas prétendre l’avoir intégralement vérifié. Le [billet du 2025-01-16](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/) distingue télémétrie et opérations critiques. Le [complément du 2025-01-20](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/) documente Developer Mode, à activer manuellement, et les partenariats. La disponibilité concrète reste à vérifier selon modèle/firmware.

## Provenance des dépôts (révisions figées)

| Dépôt primaire | HEAD consulté ; date du commit UTC | Licence constatée | Fichiers pertinents |
|---|---|---|---|
| [enamaryn/bamboo-sense](https://github.com/enamaryn/bamboo-sense) | `5ecf5eb65f3c275a8d3ae165790d7e891a0497f4` ; 2026-10-21 00:20:13 | Aucune licence détectée dans l’arbre ; métadonnée GitHub `null` | `README.md`, `crypto/README.md`, `docs/CRACK.md` |
| [Snail3D/bamboo-sense](https://github.com/Snail3D/bamboo-sense) | même HEAD et date | Aucune licence détectée | même arbre au HEAD consulté ; pas une corroboration indépendante |
| [Doridian/OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI) | `cc383a2c96576a9f53391c879acfb8dca5c534e4` ; 2026-08-07 20:33:28 | GFDL-1.3, `LICENSE.md` | `mqtt.md`, `tls.md`, `cloud-x509-auth.md` |
| [greghesp/ha-bambulab](https://github.com/greghesp/ha-bambulab) | `063313b8da81caea1fe6ef278b7ce9bf9de6cdb1` ; 2026-11-24 00:42:11 | MIT, `LICENSE` | `README.md`, `custom_components/bambu_lab/pybambu/bambu_client.py` |
| [bambulab/BambuStudio](https://github.com/bambulab/BambuStudio) | `23a33758933e712c6041e1f8f135f7d6b50004aa` ; 2026-11-24 10:13:07 | AGPL-3.0 pour Studio ; plugin réseau explicitement non libre dans README | `README.md`, `src/slic3r/Utils/NetworkAgent.hpp` |

Le code public de Studio expose une façade du plugin, pas une procédure ouverte d’émission de certificats tiers. La licence de Studio ne permet pas de déduire celle du plugin. Pour bamboo-sense, visibilité publique et absence de licence explicite ne constituent pas une permission générale de reprise.

### Empreintes Git des fichiers consultés

Les liens suivants sont immuables ; les SHA ci-dessous sont des identifiants de blobs Git, pas des SHA-256 de fichiers.

| Fichier | Blob SHA |
|---|---|
| [bamboo README](https://github.com/enamaryn/bamboo-sense/blob/5ecf5eb65f3c275a8d3ae165790d7e891a0497f4/README.md) | `810f872ee2cca63780ffcad51ee25fc2d05dce0a` |
| [bamboo crypto README](https://github.com/enamaryn/bamboo-sense/blob/5ecf5eb65f3c275a8d3ae165790d7e891a0497f4/crypto/README.md) | `4663a58bc6e4ad4d8de3078032418e498afad8ec` |
| [bamboo CRACK — référence seulement](https://github.com/enamaryn/bamboo-sense/blob/5ecf5eb65f3c275a8d3ae165790d7e891a0497f4/docs/CRACK.md) | `48cc6e47b7423c6e7a232ac7ff1e63999b5f67cd` |
| [OpenBambuAPI MQTT](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/mqtt.md) | `8e1dcf66c01fbc49a8b4c0ab0f17d39f5cc92692` |
| [OpenBambuAPI TLS](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/tls.md) | `30c2f31fd7047c5554aaa875c0634f3f68ed8476` |
| [OpenBambuAPI X.509](https://github.com/Doridian/OpenBambuAPI/blob/cc383a2c96576a9f53391c879acfb8dca5c534e4/cloud-x509-auth.md) | `fb3d2ee3d97493b907fb0041f6582d34d4697476` |
| [HA README](https://github.com/greghesp/ha-bambulab/blob/063313b8da81caea1fe6ef278b7ce9bf9de6cdb1/README.md) | `4e4c7d9a8b2d496fa389e9916add207884af56d4` |
| [HA MQTT client](https://github.com/greghesp/ha-bambulab/blob/063313b8da81caea1fe6ef278b7ce9bf9de6cdb1/custom_components/bambu_lab/pybambu/bambu_client.py) | `b96ac4e24b2304b0ee23cc54ce441eb9e4d74850` |
| [Studio README](https://github.com/bambulab/BambuStudio/blob/23a33758933e712c6041e1f8f135f7d6b50004aa/README.md) | `68bc1bd632af66dd00ff1b308169404711c4739f` |
| [Studio NetworkAgent.hpp](https://github.com/bambulab/BambuStudio/blob/23a33758933e712c6041e1f8f135f7d6b50004aa/src/slic3r/Utils/NetworkAgent.hpp) | `3b4af467151464ef1817a5f287b41e8e8b8b7e5b` |

## Évaluation de CRACK.md sans recette d’exploitation

Le texte revendique une faiblesse de validation et d’installation d’identité applicative, testée par son auteur sur P2S en septembre 2026. Il mélange observations, hypothèses et corrections successives ; certaines conclusions se contredisent entre passages. Sa réussite alléguée ne fournit ni contrat d’API, ni garantie intermodèles, ni mécanisme officiel d’enrôlement. Les deux dépôts ayant le même HEAD, ils ne fournissent qu’une même revendication. Aucun secret, format d’enveloppe exploitable, procédure d’installation ou paramètre de contournement n’est repris ici. Les fichiers crypto présents ne doivent pas être importés dans FabCORE.

`OpenBambuAPI/cloud-x509-auth.md` est une rétrodocumentation communautaire, pas une approbation constructeur ; ses échanges applicatifs observés ne démontrent pas qu’un développeur peut y soumettre sa propre clé. `ha-bambulab` sépare explicitement capteurs accessibles et contrôles restreints selon mode/firmware. Ses CA servent à vérifier le serveur TLS ; ce ne sont pas des certificats d’autorisation applicative.

## Conséquence pour le laboratoire

BBL-CRYPTO-01.1 peut créer ses propres identités, vérifier TLS/mTLS, tester expiration/révocation et ACL MQTT et démontrer une signature FabCORE autonome **dans le simulateur seulement**. Aucune fonction d’extraction de clés officielles, d’usurpation de nom constructeur, d’installation native de certificat ou de validation permissive ne découle de cet audit. Une intégration réelle future doit choisir un parcours documenté (Fleet Hub, Bambu Connect, Developer Mode selon compatibilité) et faire l’objet d’une vérification séparée de ses conditions.


## Audit FabCore et architecture livrée (01.1–01.4)

Base de développement : `148b69c` (#140), Node `v24.22.3`, OpenSSL `3.5.7`, Linux. Aucun accès ni changement des LXC 119/127 pour ce jalon. Les chemins de ces environnements n’ont donc pas été revérifiés à distance et aucun essai physique n’est revendiqué.

| Responsabilité existante | Entrée autoritaire | Conclusion de l’audit |
|---|---|---|
| MQTT LAN P2S | `connectors/bambu/src/monitor.ts` → `createP2SMonitor` | MQTTs, identifiants LAN ; `mqtt message verify failed` devient déjà `bambu-authorization` après accusé corrélé. Ne pas remplacer cette erreur par une réussite TLS. |
| Certificat serveur LAN | `poc/certs/bambu-p2s.pem`, connecteur monitor et `poc/bambu-camera.mjs` | CA et identité machine pour TLS, distinctes de notre CA de laboratoire. |
| FTPS | `connectors/bambu/src/files.ts`, adaptateur `poc/bambu-files.mjs` | Chemin existant conservé. |
| Cloud HTTPS / MQTT | `connectors/bambu/src/cloud-http.ts`, `cloud-monitor.ts`, `poc/cloud-accounts.mjs` | Jetons et chiffrement existants conservés ; aucune réutilisation pour ce laboratoire. |
| Caméra hybride | `poc/bambu-cloud-camera.mjs` | Cloud pour inventaire, LAN RTSPS pour vidéo ; indépendance de l’autorisation de pilotage. |
| Commandes et capacités | `poc/manual-controls.mjs`, `src/domain/control.ts` | Aucun branchement sur ce laboratoire, aucune capacité de production nouvellement activée. |

Le nouveau code est entièrement isolé sous `connectors/bambu/src/lab/`, sans réexport depuis le connecteur utilisé en production, sans route HTTP, migration de base, dépendance npm ou service démarré automatiquement. Il n’importe ni cœur FabCore ni code de `poc/` et pourra être composé par un futur Agent sans dépendre du serveur web.

| Module | Contrat |
|---|---|
| `crypto.ts` / `BambuCryptoProvider` | RSA 3072 par défaut, minimum 2048 ; SHA-256, RSA-PSS avec sel 32 octets ; interface indépendante du transport. `node:crypto` pour clés, signatures et empreintes. |
| `certificates.ts` / `BambuCertificateManager` | CA locale X.509 365 jours, `CA:TRUE,pathlen:0`, identité 30 jours `CA:FALSE`, `digitalSignature`, `clientAuth` ; chaîne et racines explicitement fournies, révocation locale persistante, rotation et import. |
| `authorization.ts` / `BambuAuthorizationManager` | Approbation explicite d’une empreinte **dans le simulateur** après validation ; le succès MQTT ne donne aucune capacité réelle. `target: bambu` retourne toujours `applicationAuthorized: false`, `physicalCommands: false`, `interface-unqualified`. |
| `diagnostics.ts` / `BambuDiagnostics` | Événements structurés autorisés uniquement, maximum 256 ; pseudonymes HMAC salés par instance de diagnostic ; aucun payload, série, email, code LAN, jeton ou clé. |
| `simulator.ts` | Sous-ensemble MQTT 3.1.1 réel, IPv4 loopback et port éphémère imposés. Une réponse synthétique de 21 °C ; aucune commande d’imprimante. |
| `tools/bambu-crypto-lab.mjs` | Démonstration reproductible complète, stockage temporaire supprimé en fin d’exécution. N’accepte aucun argument de connexion. |

### X.509, clés et confiance

Node `X509Certificate` n’est pas une API d’émission de certificats ni un validateur PKIX complet. Pour éviter une bibliothèque ASN.1/crypto supplémentaire, l’émission et la validation de chaîne utilisent le binaire **OpenSSL >=3**, présent dans l’environnement testé. Ce prérequis concerne uniquement les tests/outils R&D ; il n’est pas ajouté silencieusement au service FabCore.

OpenSSL est appelé par `spawn` sans shell, sortie brute ignorée, délai maximal 10 secondes, secret sur stdin uniquement. La vérification utilise `-x509_strict`, `-purpose sslclient`, `-check_ss_sig`, l’heure de référence et les seules racines explicitement fournies ; aucun trust store OS implicite. Dates de la feuille/chaîne/racines, RSA minimum et liste locale de révocation sont vérifiés aussi. Les racines `CA:FALSE` et feuilles CA sont rejetées. Les bundles sont bornés à huit racines et huit intermédiaires de 16 Kio chacun. Une erreur ne devient jamais une autorisation permissive.

Une clé privée est exportée uniquement dans un PKCS#8 chiffré AES-256-CBC ; sa passphrase aléatoire de 256 bits reste dans un fichier séparé 0600. Le dossier est 0700 ; les lectures refusent fichiers à permissions excessives, liens symboliques et liens multiples. Les écritures utilisent création exclusive, `O_NOFOLLOW` et synchronisation ; les identités sont publiées par renommage d’un dossier temporaire. Les modifications sont sérialisées par verrou exclusif, sans reprise automatique d’un verrou abandonné après crash : l’opérateur doit d’abord vérifier qu’aucun laboratoire ne tourne avant de retirer ce verrou.

Le chiffrement avec passphrase sur le même disque ne protège **pas** contre la compromission du compte Unix, root ou une sauvegarde contenant les deux fichiers. Ce n’est ni un HSM, ni un coffre-fort système. Aucun export de clé via HTTP/API ; l’import reçoit uniquement les clés appartenant à l’opérateur, avec leurs certificats et racines explicitement choisis, puis rechiffre la clé. `origin: imported` indique la provenance, **pas** une certification officielle. Le profil actuel est RSA/clientAuth ; des certificats officiels d’un autre profil demanderaient un adaptateur documenté.

`rotate()` crée une nouvelle paire **de laboratoire**, révoque l’ancienne et impose une nouvelle approbation dans le simulateur. Il refuse les identités importées : leur renouvellement exige l’émetteur d’origine et un nouvel import. Le renouvellement n’est pas un service automatique. `remove()` révoque puis retire la clé chiffrée et sa passphrase ; certificat et tombstone public restent pour l’audit. Il s’agit d’une suppression logique : aucune garantie d’effacement physique sur SSD, COW ou sauvegardes ; appliquer les politiques de rétention hors de ce module. Les buffers de passphrase sont remis à zéro au mieux, sans promesse d’effacement de toutes les copies internes de Node/OpenSSL.

La révocation est locale, durable et vérifiée à chaque requête ; aucune prétention OCSP/CRL constructeur. Une version de révocation empêche une autorisation en vol si une CA/feuille est révoquée pendant la validation asynchrone. L’approbation est relue après le dernier `await` avant consommation du nonce. Le service de laboratoire utilise **un gestionnaire propriétaire par installation** ; l’API n’est pas conçue pour plusieurs processus écrivains ni pour une révocation distribuée. Les approbations et nonces ne survivent pas au redémarrage : il faut réapprouver explicitement. Le rejeu n’est donc pas durable entre redémarrages suivis d’une réapprobation de la même identité pendant la fenêtre de 30 secondes ; une future utilisation au-delà du simulateur devra ajouter un challenge de session ou un registre durable.

### Protocole du simulateur

Enveloppe **FabCore synthétique v1**, sans relation avec les formats Bambu : message à champs fixes `version`, `audience= fabcore-simulator`, `action=read-synthetic-temperature`, nonce UUID, dates en millisecondes ; certificat public, chaîne et signature détachée. Tous les champs du message sont signés sous forme d’un tableau JSON à ordre fixe. Une audience, action ou clé inconnue provoque un refus. Aucun champ G-code, aucune URL, aucune IP de machine ni topic constructeur n’est accepté.

Validité maximale 30 secondes, tolérance d’horloge future 1 seconde, nonce consommé une seule fois après vérification ; 1024 nonces et 128 approbations au maximum. La concurrence sur un même nonce n’accorde qu’une seule réussite. Le serveur MQTT accepte seulement CONNECT propre MQTT 3.1.1, une souscription QoS 0 au topic `fabcore-lab/result`, PUBLISH QoS 0 sur `fabcore-lab/request`, ping et déconnexion. Il refuse MQTT 5, wildcard, retained, QoS >0 et autres topics. Maximum quatre sockets, huit paquets en attente/socket, 128 Kio par message, tampon émission borné et inactivité 15 secondes. Il ferme les sockets et attend ses tâches en cours à l’arrêt. **Ce n’est pas un broker MQTT généraliste**, ni un remplacement de Mosquitto. MQTT non chiffré est limité à loopback ; cela ne change aucune vérification TLS de FabCore.

### Reproduire les essais

Depuis une copie de développement avec dépendances installées et Node supporté (24 ou 26) :

```sh
node --version
openssl version
node --test connectors/bambu/test/lab/crypto.test.ts
node tools/bambu-crypto-lab.mjs
npm run check
node scripts/ai-context.mjs --check
```

La démonstration ne demande aucun secret et n’accepte aucun paramètre ; elle crée une installation éphémère, démarre le simulateur uniquement sur loopback, utilise le client `mqtt` déjà présent, vérifie refus avant approbation, acceptation après approbation, rejet du rejeu, rejet après révocation et succès de la nouvelle identité après approbation, puis supprime ses clés temporaires. Elle imprime un rapport anonymisé. Les valeurs sont synthétiques ; aucun résultat ne vient d’une imprimante.

Les tests couvrent signature valide/invalide, message altéré, mauvaise clé, empreinte SHA-256, minimum RSA, certificats expirés/non encore valides, chaîne et signature CA invalides, profil CA/feuille, révocation durable, import clé/certificat discordants, isolation de deux installations, permissions/liens, rejeu concurrent, retrait d’approbation ou révocation de CA pendant une requête suspendue, suppression et rotation, bornes de rapport et absence de secrets. La revue indépendante a identifié les deux cas de concurrence désormais couverts par des tests déterministes.

## Compatibilité et préparation 01.5–01.6

État R&D transmis par le mainteneur, **non rejoué par cette PR** : P2S Cloud sans Developer Mode, MQTT LAN/monitoring, monitoring Cloud, RTSPS et listing/téléchargement/upload/suppression FTPS validés ; `M105` refusé avec `mqtt message verify failed` en 76 ms. Ce résultat prouve un refus applicatif malgré une connexion MQTT fonctionnelle ; il n’identifie pas un protocole d’inscription tiers disponible.

| Exigence | État dans cette PR |
|---|---|
| Identité propre FabCore, signatures, cycle de vie | Implémenté et exercé uniquement en laboratoire |
| Authentification MQTT vs autorisation applicative | Séparées, refus explicite et capacités réelles maintenues à false |
| Import d’un certificat émis pour notre propre clé | API locale disponible ; aucun certificat constructeur acquis ni importé pendant ce jalon |
| Enrôlement direct P2S avec notre CA | Non établi, non implémenté, aucun endpoint d’installation supposé |
| Route bamboo-sense | Aucune recette d’exploitation ou code de ce dépôt intégré ; ne satisfait pas les contraintes de ce jalon |
| Fleet Hub | Piste officielle mTLS distincte ; matériel et fonctionnement LAN exclusif ne satisfont pas ici le maintien Cloud/Handy |
| Bambu Connect / partenariat | À qualifier pour le périmètre exact des API, droits de redistribution et maintien Cloud ; aucune clé officielle utilisée |
| FTPS/MQTT/RTSPS production | Code et configuration inchangés ; tests existants rejoués, matériel non sollicité |

La qualification réelle nécessite d’abord : documentation constructeur applicable au modèle/firmware, procédure d’émission/enrôlement pour **notre** clé et preuve de droits sur les API voulues ; contrat/licence et statut Cloud/Handy/Studio/OTA explicitement vérifiés ; racines, algorithmes, dates, révocation, renouvellement et format de signature spécifiés. Un certificat auto-signé ou approuvé par notre simulateur ne remplit aucun de ces prérequis. Aucune demande partenaire ou acceptation contractuelle n’a été envoyée automatiquement.

Ensuite seulement, avec validation matérielle séparée : relever versions/modes/identités publiques et prévoir un retour arrière ; tester TLS et authentification sans commandes ; vérifier l’identité applicative et lire les capacités ; faire une lecture de température documentée ; qualifier ensuite chaque commande prise en charge avec supervision et retour machine corrélé. Conserver les tests Cloud/Handy/Studio/OTA en non-régression. Ne pas rejouer automatiquement un refus ni envoyer `M105` comme preuve de lecture non protégée : le test R&D a déjà montré qu’il passe par le canal de commandes protégé.

Références primitives : [Node Crypto](https://nodejs.org/api/crypto.html), [Node X509Certificate](https://nodejs.org/api/crypto.html#class-x509certificate), [OpenSSL : validation PKIX et options](https://docs.openssl.org/3.5/man1/openssl-verification-options/), [OpenSSL req](https://docs.openssl.org/3.5/man1/openssl-req/), [OpenSSL x509](https://docs.openssl.org/3.5/man1/openssl-x509/).


## Résultats vérifiables de la première PR

- Tests ciblés crypto/certificats/MQTT : **11 réussis, 0 échec** sous Node 24.
- Démonstration réelle sur socket MQTT loopback : six vérifications du cycle de vie réussies ; aucun ordre physique ni endpoint Cloud/printer.
- `npm run check` : **342 tests, 337 réussis, 5 PostgreSQL ignorés localement, 0 échec** ; types, lint, licences (300 paquets), OpenAPI et compilation web réussis.
- Rapport anonymisé reproductible : [bambu-authorization-results.json](bambu-authorization-results.json). Les durées sont celles d’un essai local, pas une mesure de performance de la P2S.

La suite historique comportait trois chemins réseau non injectés (découverte de webcam et lectures de contrôles Moonraker). La revue automatique a interrompu les premières vérifications sur ces adresses privées. Les ports manquants sont désormais simulés dans `poc/server.test.mjs`, `poc/routing-parity.test.mjs` et `poc/cc2-light-fan.test.mjs`. `npm test` précharge `scripts/test-network-isolation.mjs` : refus des sorties TCP/UDP, HTTP(S) et fetch vers les destinations non loopback, avant traduction par un proxy d’environnement. Un accès bloqué fait échouer le processus, même si le code testé intercepte l’erreur. Un test indépendant vérifie les refus avec un domaine `.invalid` ; les tests HTTP/MQTT locaux continuent de passer. Ce garde est limité au processus Node qui le charge ; il ne constitue pas une sandbox d’un binaire externe ou d’un autre processus arbitraire. Il n’est jamais chargé par le serveur de production.

État de livraison : code et résultats locaux prêts pour revue ; aucune installation LXC, aucun certificat envoyé à la P2S, aucun essai de homing/chauffe. La recette matérielle reste séparée du résultat de la simulation.
