# POC-01 · Activation locale et supervision Klipper

## Installer sur un serveur ou un LXC Proxmox

### 1. Préparer le serveur

Sur Proxmox, utiliser un LXC Debian ou Ubuntu. Depuis la console du conteneur, ou après avoir exécuté `pct enter ID_DU_LXC` sur l’hôte Proxmox en remplaçant l’identifiant, installer les paquets suivants en root. Sur un serveur Debian ou Ubuntu, les mêmes commandes s’exécutent dans le terminal du serveur.

```bash
apt update
apt install -y git curl ca-certificates
```

Utiliser ensuite un compte non root dans le LXC ou sur le serveur. Pour créer un compte dédié depuis la session root, si nécessaire :

```bash
adduser fabcore
su - fabcore
```

### 2. Installer Node.js 24

Dans la session du compte qui exécutera FabCore, installer Node.js 24 avec [nvm](https://nodejs.org/fr/download). Si Node.js 24 et npm sont déjà disponibles pour ce compte, passer directement au clonage.

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.6/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install 24
node --version
npm --version
```

### 3. Télécharger et démarrer FabCore

Cloner la branche principale depuis GitHub.

```bash
git clone https://github.com/enamaryn/FabCORE.git "$HOME/FabCORE"
cd "$HOME/FabCORE"
npm ci
npm test
npm start
```

Laisser ce terminal ouvert et récupérer le jeton d’activation affiché au premier démarrage.

### 4. Ouvrir l’interface

FabCore écoute par défaut uniquement dans le serveur, sur `127.0.0.1:3000`. Depuis un autre poste, ouvrir un tunnel SSH dans un second terminal en remplaçant l’utilisateur et l’adresse par ceux du LXC ou du serveur. La connexion SSH doit déjà fonctionner pour ce compte.

```bash
ssh -N -L 3000:127.0.0.1:3000 utilisateur@IP_DU_LXC
```

Ouvrir [127.0.0.1:3000](http://127.0.0.1:3000) dans le navigateur et saisir le jeton du premier démarrage. Si le port 3000 est déjà occupé sur le poste, conserver le numéro de port côté FabCore et ouvrir le tunnel avec `ssh -N -L 3001:127.0.0.1:3000 utilisateur@IP_DU_LXC`. Dans ce cas, redémarrer FabCore avec `FABCORE_ORIGIN=http://127.0.0.1:3001 npm start`, puis ouvrir [127.0.0.1:3001](http://127.0.0.1:3001).

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

## Fonctionnement et limites

- L’adaptateur interroge exclusivement `GET /printer/objects/query`. Les requêtes ne suivent pas les redirections. Une indisponibilité de Klippy, un refus Moonraker et une perte de liaison sont distingués.
- Le navigateur actualise la télémétrie toutes les deux secondes pendant une session de supervision. Les requêtes concurrentes partagent un résultat par machine et les erreurs de transport sont visibles.
- Le POC prend en charge un administrateur local et jusqu’à huit machines Klipper, Bambu P2S ou Elegoo CC1/CC2. Les sessions et l’activité récente sont en mémoire. Le registre et le hachage de mot de passe sont persistés.
- Le fichier `.fabcore/state.json` est créé avec les droits `0600`. Il contient les clés API Moonraker et les codes d’accès LAN nécessaires à la reconnexion. Protéger le répertoire et ses sauvegardes comme des secrets. Exécuter une seule instance par répertoire de données.
- Le POC couvre l’ajout et la supervision Klipper, Bambu P2S et Elegoo CC1/CC2. Les commandes de fabrication, la caméra Bambu, Pocket ID, SMTP et les autres constructeurs restent pour les jalons suivants.

## Paramètres d’exécution

| Variable | Valeur par défaut | Usage |
| --- | --- | --- |
| `FABCORE_HOST` | `127.0.0.1` | Adresse d’écoute |
| `FABCORE_PORT` | `3000` | Port HTTP |
| `FABCORE_ORIGIN` | `http://127.0.0.1:3000` si port par défaut | Origine exacte utilisée par le navigateur |
| `FABCORE_DATA` | `.fabcore` | Répertoire de stockage |

Une écoute hors boucle locale impose une origine HTTPS et un reverse proxy qui préserve l’en-tête `Host` et termine TLS. Pour la recette POC, le tunnel SSH garde l’écoute en local. La maquette de revue s’ouvre toujours directement avec `design/prototype.html`.

Références Moonraker pour le [suivi d’impression](https://moonraker.readthedocs.io/en/latest/external_api/introduction/#basic-print-status), les [objets Klipper](https://moonraker.readthedocs.io/en/latest/printer_objects/) et [l’autorisation API](https://moonraker.readthedocs.io/en/latest/external_api/authorization/).
