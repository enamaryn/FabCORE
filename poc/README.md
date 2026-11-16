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

Pendant la PR #2, le POC est disponible sur la branche `poc/01-klipper`. Si le dépôt demande une authentification GitHub, utiliser un compte autorisé à lire le dépôt.

```bash
git clone --branch poc/01-klipper --single-branch https://github.com/enamaryn/FabCORE.git "$HOME/FabCORE"
cd "$HOME/FabCORE"
npm test
npm start
```

FabCore utilise les modules intégrés de Node.js. Aucun `npm install` n’est nécessaire. Laisser ce terminal ouvert et récupérer le jeton d’activation affiché au premier démarrage.

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

## Fonctionnement et limites

- L’adaptateur interroge exclusivement `GET /printer/objects/query`. Les requêtes ne suivent pas les redirections. Une indisponibilité de Klippy, un refus Moonraker et une perte de liaison sont distingués.
- Le navigateur actualise la télémétrie toutes les deux secondes pendant une session de supervision. Les requêtes concurrentes partagent un résultat par machine et les erreurs de transport sont visibles.
- Le POC prend en charge un administrateur local et jusqu’à huit origines Moonraker distinctes. Les sessions et l’activité récente sont en mémoire. Le registre et le hachage de mot de passe sont persistés.
- Le fichier `.fabcore/state.json` est créé avec les droits `0600`. Il contient les clés API Moonraker nécessaires à la reconnexion. Protéger le répertoire et ses sauvegardes comme des secrets. Exécuter une seule instance par répertoire de données.
- Le POC couvre l’ajout et la supervision Klipper. Les commandes de fabrication, les caméras, Pocket ID, SMTP et les autres constructeurs restent pour les jalons suivants.

## Paramètres d’exécution

| Variable | Valeur par défaut | Usage |
| --- | --- | --- |
| `FABCORE_HOST` | `127.0.0.1` | Adresse d’écoute |
| `FABCORE_PORT` | `3000` | Port HTTP |
| `FABCORE_ORIGIN` | `http://127.0.0.1:3000` si port par défaut | Origine exacte utilisée par le navigateur |
| `FABCORE_DATA` | `.fabcore` | Répertoire de stockage |

Une écoute hors boucle locale impose une origine HTTPS et un reverse proxy qui préserve l’en-tête `Host` et termine TLS. Pour la recette POC, le tunnel SSH garde l’écoute en local. La maquette de revue s’ouvre toujours directement avec `design/prototype.html`.

Références Moonraker pour le [suivi d’impression](https://moonraker.readthedocs.io/en/latest/external_api/introduction/#basic-print-status), les [objets Klipper](https://moonraker.readthedocs.io/en/latest/printer_objects/) et [l’autorisation API](https://moonraker.readthedocs.io/en/latest/external_api/authorization/).
