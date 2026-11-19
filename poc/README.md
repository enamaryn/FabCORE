# POC-01 · Activation locale et supervision Klipper

## Installer sur un serveur ou un LXC Proxmox

Dans le terminal du serveur ou du LXC Debian ou Ubuntu, suivre les [quatre commandes d’installation](../README.md#installation). Garder le terminal ouvert pour récupérer le jeton du premier démarrage. Pour démarrer FabCore sous un compte dédié, lancer le script depuis ce compte. L’installation des paquets système utilise root ou sudo.

### 4. Ouvrir l’interface

FabCore écoute par défaut uniquement dans le serveur, sur `127.0.0.1:3000`. Depuis un autre poste, ouvrir un tunnel SSH dans un second terminal en remplaçant l’utilisateur et l’adresse par ceux du LXC ou du serveur. La connexion SSH doit déjà fonctionner pour ce compte.

```bash
ssh -N -L 3000:127.0.0.1:3000 utilisateur@IP_DU_LXC
```

Ouvrir [127.0.0.1:3000](http://127.0.0.1:3000) dans le navigateur et saisir le jeton du premier démarrage. Si le port 3000 est déjà occupé sur le poste, conserver le numéro de port côté FabCore et ouvrir le tunnel avec `ssh -N -L 3001:127.0.0.1:3000 utilisateur@IP_DU_LXC`. Dans ce cas, redémarrer FabCore avec `FABCORE_ORIGIN=http://127.0.0.1:3001 bash scripts/install.sh`, puis ouvrir [127.0.0.1:3001](http://127.0.0.1:3001).

Le LXC doit pouvoir joindre Moonraker sur le réseau local. Pour vérifier l’accès, remplacer l’adresse par celle de l’imprimante et exécuter la commande depuis le LXC. Une réponse HTTP 401 ou 403 confirme que le service répond et que l’accès à ce point d’entrée est refusé.

```bash
curl -i --max-time 5 http://192.168.1.50:7125/server/info
```

## Essai sur l’Ender 3

1. Copier le jeton affiché au démarrage dans le terminal FabCore. Il est utilisable une fois pendant 15 minutes. Tant que le premier compte n’existe pas, un redémarrage permet de générer un nouveau jeton.
2. Créer l’administrateur local avec un mot de passe de 12 caractères au minimum.
3. Dans **Vue d’ensemble → Ajouter une machine**, saisir le nom et l’origine Moonraker sur une IPv4 privée, par exemple `http://192.168.1.50:7125`. Renseigner la clé API Moonraker si l’accès la requiert. La clé n’apparaît pas dans les réponses de FabCore. Utiliser un certificat approuvé par Node pour un Moonraker en HTTPS.
4. Attendre quelques secondes, puis comparer l’état, la température de buse, la température du plateau et la progression à Mainsail ou Fluidd. La progression provient de `virtual_sdcard`. Un capteur absent est affiché par un tiret.
5. Hors fabrication, rendre temporairement Moonraker inaccessible depuis FabCore, puis rétablir la liaison. Vérifier le passage **Hors ligne**, le retour de la télémétrie et la conservation de l’identifiant.
6. Se déconnecter, se reconnecter, puis redémarrer FabCore. Vérifier que l’activation n’est plus proposée et que le parc a été conservé.

Les tests reproduisent la suite activation → connexion → ajout → impression → hors ligne → reconnexion. Ils utilisent un simulateur au niveau du transport HTTP Moonraker. Les mesures sur l’Ender 3 sont à confirmer sur le matériel.

## POC-02 · Essai sur une Bambu Lab P2S

Dans **Ajouter une machine**, choisir **Bambu Lab · P2S**, saisir son IPv4 locale, son numéro de série et son code d’accès LAN. Saisir le code dans FabCore uniquement. Essayer avec les réglages actuels avant de modifier la configuration de l’imprimante. Le bouton **Tester la connexion** attend un premier rapport MQTT sans enregistrer la machine. Dans la fiche machine, **Modifier la machine** permet de corriger l’adresse ou le code LAN. Laisser le code vide conserve le code déjà enregistré.

Le LXC doit pouvoir joindre le port TCP 8883 de la P2S. FabCore ouvre une connexion MQTT chiffrée en TLS 1.2 et vérifie la chaîne Bambu ainsi que l’identité de l’imprimante à partir du numéro de série. Les certificats publics proviennent de [ha-bambulab](https://github.com/greghesp/ha-bambulab/tree/a939068e7cb32cfa555a8304ac52f968cccc95f7/custom_components/bambu_lab/pybambu/certs). Le seul message émis vers la P2S demande un rapport d’état.

Comparer l’état et les températures avec Bambu Studio. Pendant une impression, comparer la progression. Hors impression, éteindre puis rallumer la P2S, puis observer le retour de la télémétrie sur la même fiche.

Si MQTT ne répond pas ou ne renvoie aucun rapport, vérifier la version du micrologiciel et les paramètres LAN de la P2S. Le [manuel P2S](https://csm.bblcdn.cn/hub/79f028a6cf6f429b9f09ef91f41a85c3.pdf) décrit le mode LAN uniquement, qui coupe l’accès via Bambu Handy, et le réglage du mode développeur.

## POC-03 · Essai sur les Elegoo Centauri Carbon

- **Centauri Carbon (CC1).** Choisir le modèle et saisir son IPv4. FabCore recherche le MainboardID sur le réseau local en UDP 3000 et lit l’état via SDCP sur le port 3030. Si la découverte ne traverse pas le réseau, saisir le MainboardID manuellement.
- **Centauri Carbon 2 (CC2).** Choisir le modèle, saisir son IPv4 et le code LAN de l’imprimante. FabCore récupère son numéro de série sur le port 80, puis vérifie l’état via MQTT sur le port 1883. Selon le firmware, activer **LAN uniquement** pour accéder à ces interfaces. Le transport local CC2 est en clair, code LAN compris. Utiliser un réseau local de confiance.
- Cliquer sur **Tester la connexion**, puis ajouter les machines avec des noms distincts. Comparer état, températures et progression avec l’interface de l’imprimante. Hors impression, éteindre puis rallumer une seule CC2 et vérifier que l’autre fiche conserve sa télémétrie.
- Le POC interroge uniquement l’état. Références de protocole [elegoo-link](https://github.com/ELEGOO-3D/elegoo-link) et [pycentauri](https://github.com/bjan/pycentauri/blob/main/docs/PROTOCOL.md).

## POC-04 · Découverte réseau

Dans **Ajouter une machine → Détecter sur le réseau**, sélectionner un sous-réseau directement raccordé au serveur FabCore et lancer le scan. Choisir un résultat pour préremplir le protocole et l’adresse, puis saisir le code d’accès si nécessaire et tester la connexion. Les machines déjà enregistrées sont signalées.

Le scan est réservé à l’administrateur connecté et limité à une tranche IPv4 privée de 254 hôtes maximum. Il utilise les réponses Moonraker sur le port 7125, la découverte SDCP en UDP, le certificat MQTT Bambu et les métadonnées publiques du point d’entrée CC2. La détection CC2 dépend du firmware et peut être absente lorsque les informations exigent le code LAN. L’ajout manuel couvre aussi les machines hors du sous-réseau scanné et les instances Moonraker configurées sur un port non standard.

## POC-05 · Caméras Elegoo

Sur la fiche d’une **Centauri Carbon** ou d’une **Centauri Carbon 2**, cliquer sur **Ouvrir le flux**. Le serveur vérifie l’identité de l’imprimante et relaie son flux MJPEG via la session FabCore. Le LXC doit atteindre le port caméra de chaque imprimante, 3031 pour la CC1 et 8080 pour la CC2. Référence de protocole [pycentauri](https://github.com/bjan/pycentauri/blob/main/docs/PROTOCOL.md).

Ouvrir une CC2 différente dans chacun de deux onglets, vérifier les images, puis fermer le premier flux et constater que le second continue. Refaire l’essai en éteignant la première machine hors impression. Le flux est ouvert à la demande et reste réservé à la session authentifiée. Ce jalon couvre la visualisation en direct sur les deux modèles Elegoo.

## POC-06 · Pause, reprise et Observateur

Sur une imprimante Klipper enregistrée, ouvrir la fiche en administrateur pendant une impression de test et choisir **Mettre en pause**, puis **Reprendre**. La commande vise l’adresse Moonraker enregistrée. Confirmer le changement dans FabCore et dans Mainsail ou Fluidd. En cas de réponse non confirmée, vérifier l’état réel avant de réessayer.

En administrateur, créer un compte avec **Ajouter un observateur**, puis se connecter dans une fenêtre privée. Le compte peut suivre les impressions et ouvrir les caméras autorisées. La modification du parc et les commandes d’impression sont réservées à l’administrateur.

## Connexion OIDC avec Pocket ID

Créer un client OIDC **confidentiel**, avec PKCE, dans Pocket ID. Enregistrer l’URL de retour exacte `https://fabcore.example.com/api/oidc/callback`, en remplaçant le domaine par celui de FabCore. Le serveur FabCore doit pouvoir joindre l’URL HTTPS du fournisseur.

| Variable | Valeur |
| --- | --- |
| `FABCORE_OIDC_ISSUER` | URL publique HTTPS de Pocket ID, par exemple `https://id.example.com` |
| `FABCORE_OIDC_CLIENT_ID` | Identifiant du client |
| `FABCORE_OIDC_CLIENT_SECRET` | Secret du client, conservé côté serveur |
| `FABCORE_OIDC_ADMIN_GROUP` | Nom exact du groupe autorisé à administrer FabCore, facultatif |
| `FABCORE_OIDC_OBSERVER_GROUP` | Nom exact du groupe autorisé à consulter FabCore, facultatif |

Configurer au moins un groupe et des noms distincts si les deux rôles sont utilisés. Lorsqu’un utilisateur appartient aux deux groupes, le rôle Administrateur s’applique. FabCore demande la portée `groups` et lit les groupes dans la réponse UserInfo. Un membre sans groupe FabCore autorisé voit la page de connexion. Limiter également l’accès au client aux groupes concernés dans Pocket ID.

Définir ces variables dans l’environnement de FabCore, puis redémarrer le service. Le bouton **Se connecter avec Pocket ID** apparaît une fois le compte administrateur local créé et FabCore accessible en HTTPS. La connexion locale reste disponible. La déconnexion ferme la session FabCore. Les groupes sont réévalués à chaque connexion OIDC.

[Documentation des clients Pocket ID](https://pocket-id.org/docs/setup/connect-an-app)

## Notifications ntfy et SMTP

La page **Notifications** s’ouvre après la création du premier administrateur et reste accessible depuis la barre supérieure. Choisir **Serveur interne**, **Serveur existant** ou **Configurer plus tard**. SMTP peut être activé indépendamment.

Pour un **serveur interne**, lancer l’installateur sur le même serveur Debian ou Ubuntu que FabCore. Il installe le binaire depuis le dépôt APT signé de ntfy et démarre un service systemd dédié sur `127.0.0.1:8086`.

```bash
sudo bash scripts/install-ntfy.sh
```

Si FabCore s’exécute avec un autre compte ou un autre répertoire de données, préciser les deux valeurs. Exemple pour un LXC avec le service FabCore.

```bash
sudo bash scripts/install-ntfy.sh fabcore /var/lib/fabcore
```

Revenir dans **Notifications**, choisir **Serveur interne** puis enregistrer et envoyer un test. Le sujet est `fabcore`. Le compte de lecture et son mot de passe se trouvent dans `/etc/fabcore-ntfy/subscriber.txt` sur le serveur, accessible à root. Pour recevoir la notification sur un autre appareil, utiliser un tunnel vers le port 8086 ou configurer un reverse proxy HTTPS vers le service local. La publication est réservée au compte FabCore et la lecture au compte abonné.

Pour un **serveur existant**, indiquer l’URL HTTPS, le sujet et le mode d’authentification. En mode SMTP, indiquer l’hôte, le port, STARTTLS ou TLS, l’expéditeur, le destinataire et les identifiants si le relais les exige. Enregistrer puis cliquer sur **Envoyer un test**. L’interface confirme l’acceptation par le serveur. Vérifier la réception sur l’appareil ou dans la boîte mail.

[Dépôt APT ntfy](https://docs.ntfy.sh/install/) · [Accès aux sujets ntfy](https://docs.ntfy.sh/config/#access-control)

## Caméra Bambu Lab P2S

FabCore relaie la vidéo RTSPS de la P2S au navigateur sous forme de MJPEG. Vérifier que le port local TCP 322 est joignable et que la caméra est annoncée dans les réglages de diffusion locale de la P2S. L’installateur FabCore installe FFmpeg depuis les dépôts du système. Sur une installation existante faite à la main, installer le paquet `ffmpeg`. Le flux s’ouvre sur la fiche de la P2S et utilise le code d’accès LAN déjà enregistré.

## Fichiers et visualiseur G-code en direct

Sur la fiche d’une machine Klipper (Moonraker) ou OctoPrint, le panneau **Fichiers de la machine** liste les fichiers G-code présents sur la machine (dossier `gcodes` de Moonraker, stockage local d’OctoPrint).

- **Visualiser** ouvre le fichier dans le visualiseur par couches : sélection de couche, zoom à la molette ou aux boutons, déplacement par glisser. Le fichier est lu depuis la machine à travers FabCore.
- Pendant une impression, **Suivre en direct** ouvre le fichier en cours. Le visualiseur se place sur la couche en cours, colore la partie déjà imprimée et marque la position de la buse. Il s’appuie sur la position de lecture dans le fichier (`virtual_sdcard.file_position` pour Klipper, `progress.filepos` pour OctoPrint), actualisée avec la télémétrie. Choisir une autre couche suspend le suivi ; cocher **Suivre la couche en cours** le reprend.
- L’administrateur peut **envoyer un fichier** (`.gcode`, `.gco` ou `.g`, nom ASCII, 512 Mo au maximum) et **lancer l’impression** d’un fichier quand la machine est disponible ou a terminé. Le lancement demande une confirmation et n’est jamais renvoyé automatiquement si son résultat est incertain.
- L’observateur peut consulter la liste et le visualiseur, sans envoyer ni lancer.

Le visualiseur gère `G0`/`G1`, les arcs `G2`/`G3` donnés par `I`/`J`, `G90`/`G91`, `M82`/`M83`, `G92`, `G20`/`G21` et `G28`. Les autres trajectoires (`G5`, arcs `R`, plans `G18`/`G19`…) sont ignorées et listées avec leur première ligne. Les fichiers imprimés depuis la carte SD d’OctoPrint ne sont pas lisibles par FabCore.

## Terminal G-code

Sur la fiche d’une machine Klipper (Moonraker) ou OctoPrint, l’administrateur dispose d’un **Terminal G-code**. Saisir une commande sur une ligne (256 caractères ASCII au maximum), puis **Envoyer**.

- **Moonraker** : la commande est marquée **Exécutée** quand Klipper l’a traitée, avec les réponses de la machine. Une erreur Klipper apparaît comme **Refusée** avec son message.
- **OctoPrint** : l’API ne confirme que la mise en file. La commande est marquée **Acceptée** et la réponse de l’imprimante reste visible dans le terminal d’OctoPrint.
- Pendant une impression ou une pause, toute commande autre qu’une lecture d’état (`M105`, `M114`, `M115`, `M119`, `M27`, `M31`, `M503`, `STATUS`, `HELP`, `GET_POSITION`, `QUERY_ENDSTOPS`, `QUERY_PROBE`) demande une confirmation. Le serveur refuse l’envoi sans elle.
- Une machine hors ligne ne reçoit rien. Une commande à la fois par machine, deux par seconde et trente par minute au maximum.
- Si la réponse n’arrive pas, la commande est marquée **Résultat inconnu** et n’est jamais renvoyée automatiquement. Vérifier la machine avant de la renvoyer.
- Le journal garde les cinquante dernières commandes de la machine dans l’onglet du navigateur. Le journal de diagnostic note le résultat sans le texte de la commande.

## Fonctionnement et limites

- Pour la télémétrie, l’adaptateur interroge `GET /printer/objects/query`. Les requêtes ne suivent pas les redirections. Une indisponibilité de Klippy, un refus Moonraker et une perte de liaison sont distingués.
- Le navigateur actualise la télémétrie toutes les deux secondes pendant une session de supervision. Les requêtes concurrentes partagent un résultat par machine et les erreurs de transport sont visibles.
- Le POC prend en charge un administrateur local, jusqu’à seize observateurs et jusqu’à huit machines Klipper, Bambu P2S, Elegoo CC1/CC2 ou xTool M2. Les sessions et l’activité récente sont en mémoire. Le registre et le hachage de mot de passe sont persistés.
- Le fichier `.fabcore/state.json` est créé avec les droits `0600`. Il contient les clés API Moonraker et les codes d’accès LAN nécessaires à la reconnexion. Protéger le répertoire et ses sauvegardes comme des secrets. Exécuter une seule instance par répertoire de données.
- Le POC couvre l’ajout et la supervision Klipper, Bambu P2S et Elegoo CC1/CC2. Les commandes sur les autres modèles, les alertes automatiques et les autres constructeurs restent pour les jalons suivants.

## Ajouter une xTool M2

Relier la M2 au réseau local et relever son adresse IPv4 dans les paramètres Wi-Fi de xTool Studio. Dans FabCore, choisir **Ajouter une machine** → **xTool · M2**, saisir l’adresse, puis cliquer sur **Tester la connexion** et **Ajouter**. Le serveur FabCore doit pouvoir joindre le port TCP 28900 de la machine.

FabCore lit le numéro de série et l’état de la M2. À l’ajout, il mémorise l’empreinte du certificat présenté par la machine et la vérifie aux connexions suivantes. L’intégration couvre la supervision de l’état. Référence de protocole LAN : [ha-xtool](https://github.com/thecodingdad/ha-xtool).

## Paramètres d’exécution

| Variable | Valeur par défaut | Usage |
| --- | --- | --- |
| `FABCORE_HOST` | `127.0.0.1` | Adresse d’écoute |
| `FABCORE_PORT` | `3000` | Port HTTP |
| `FABCORE_ORIGIN` | `http://127.0.0.1:3000` si port par défaut | Origine exacte utilisée par le navigateur |
| `FABCORE_DATA` | `.fabcore` | Répertoire de stockage |

Une écoute hors boucle locale impose une origine HTTPS et un reverse proxy qui préserve l’en-tête `Host` et termine TLS. Pour la recette POC, le tunnel SSH garde l’écoute en local. La maquette de revue s’ouvre toujours directement avec `design/prototype.html`.

Références Moonraker pour le [suivi d’impression](https://moonraker.readthedocs.io/en/latest/external_api/introduction/#basic-print-status), les [objets Klipper](https://moonraker.readthedocs.io/en/latest/printer_objects/) et [l’autorisation API](https://moonraker.readthedocs.io/en/latest/external_api/authorization/).

## Fichiers et pilotage : extension expérimentale

Les fiches disposent d’un visualiseur G-code local (sans envoi à la machine). Le panneau de fichiers et les commandes disponibles dépendent du connecteur : voir la [matrice de recette](../docs/POC.md#extension-fichiers-et-commandes--en-développement). Lancer depuis le panneau exige un fichier préparé pour le modèle concerné et une confirmation administrateur. Pause/Reprendre et Stop s’affichent selon l’état. Stop annule la fabrication, sans remplacer l’arrêt d’urgence matériel.

Pour Bambu : accès FTPS implicite sur le port 990 avec le code LAN existant ; G-code et 3MF déjà tranché à un seul plateau. Un 3MF de modèle 3D non tranché n’est pas imprimable. Les projets multi-plateaux et BGCODE restent refusés. Le lancement est limité à une bobine externe explicitement confirmée ; la sélection des bobines AMS/CANVAS n’est pas encore implémentée. Selon le firmware et ses restrictions d’autorisation, les commandes LAN peuvent être refusées ; aucun contournement n’est tenté.

Pour Elegoo : seules les copies des fichiers envoyés avec succès par FabCore sont listées et visualisables, pas l’intégralité du stockage. Ces copies persistent sous le dossier de données FabCore (`files/`) ; prévoir leur sauvegarde avec les autres données. La limite est de 300 fichiers ou 2 Go par identité machine. Un nom déjà présent est refusé pour éviter un remplacement involontaire. La reprise CC2 reste à effectuer sur l’écran de la machine.

Pour xTool M2 : Lancer agit sur le projet déjà préparé dans la machine ; les confirmations physiques restent nécessaires. Le transfert des projets natifs M2 n’est pas implémenté. Le visualiseur local accepte du G-code laser avec M3/M4, M5 et les puissances S ; il ne lit pas les projets xTool Studio et ne tranche ni ne convertit un modèle.

### Récupérer ou transférer un fichier

Dans la liste, **Télécharger** récupère le fichier original sur votre ordinateur (le `.3mf` reste un `.3mf`). **Transférer**, réservé aux administrateurs, ouvre le choix d’une ou plusieurs destinations proposant ce format et permet de modifier le nom à destination. La progression affiche une ligne par machine, une animation pendant sa copie, puis ✓ ou ✕ avec le résultat.

À la fin, choisissez **Ne pas lancer**, **Tout lancer** sur les destinations disponibles, ou cochez des machines et **Lancer la sélection**. Les copies échouées ne sont jamais proposées. Vérifiez les plateaux, matériaux et le profil machine : FabCore copie le fichier sans le retrancher. Les restrictions AMS/CANVAS et celles des connecteurs restent applicables. Gardez la page ouverte jusqu’au bilan ; un résultat inconnu doit être vérifié sur la machine avant de recommencer.

Les fichiers accessibles dépendent du connecteur : stockage natif sur Bambu, Moonraker, OctoPrint et PrusaLink ; copies des envois FabCore pour Elegoo. Le transfert natif xTool M2, résine et CNC n’est pas ajouté par cette fonction.

## Contrôles manuels

Le panneau **Contrôles** affiche les états d’éclairage, températures actuelles/cibles et ventilateurs disponibles. Les administrateurs disposent des actions prises en charge ; les observateurs voient les mesures seules. **Couper** fixe la consigne du chauffage concerné à zéro. Les plafonds FabCore sont 260 °C pour la buse et 100 °C pour le plateau, ou moins si la configuration Klipper l’exige.

Sur Klipper/OctoPrint, les déplacements utilisent des pas de 0,1, 1 ou 10 mm ; la prise d’origine demande confirmation. Ils sont interdits pendant une impression ou une pause. Klipper exige les axes référencés et vérifie les limites remontées ; OctoPrint confie ces vérifications au firmware. Une modification de chauffe/ventilateur pendant fabrication demande une confirmation supplémentaire. Aucun état optimiste ni renvoi automatique en cas de réponse perdue : vérifier la machine avant de recommencer.

La [matrice du POC](../docs/POC.md#contrôles-manuels--19-novembre-2026) précise les capacités : P2S lumière/chauffe/ventilateurs, Klipper selon objets déclarés, OctoPrint chauffe/déplacement, CC2 chauffe buse/plateau via la commande MQTT native 1028 (recette matérielle à faire). Les CC2 proposent Appliquer et Couper séparément ; une consigne n’est confirmée qu’après son retour dans la télémétrie. Lumière, ventilateurs et déplacements CC2 restent non activés. Ce jalon n’ajoute pas de pilotage manuel xTool, CC1 ou PrusaLink.

### Agencement de la fiche machine

**Vue machine** regroupe la caméra, les filaments, la fabrication, les températures et les contrôles disponibles. Les consignes sont à côté des températures ; les actions rapides regroupent lumière et ventilateurs, puis la croix X/Y et les commandes Z si le connecteur les permet. Un contrôle grisé est explicitement indisponible. Tous les modules AMS/CANVAS remontés sont visibles, avec une représentation compacte.

**Fichiers** conserve recherche, tri, pagination, téléchargement, transfert et lancement. **Choisir un fichier** ouvre cet onglet. **Console** est disponible sur les connecteurs avec terminal. La caméra ne démarre pas automatiquement en quittant/revenant aux onglets : la vue machine charge un aperçu, puis **Voir la caméra** ouvre le flux. Sur la fiche, les réglages du compte, langue, thème, diagnostics et déconnexion sont regroupés dans le menu utilisateur en haut à droite.

## Comptes cloud constructeur

Consulter le [guide des comptes cloud et journaux](../docs/CLOUD-ACCOUNTS.md) pour le pilote Bambu, les comptes créés via Google, les logs par compte et les sauvegardes de la clé de chiffrement. Ce pilote lit la liste des machines ; il ne commande pas les imprimantes.
