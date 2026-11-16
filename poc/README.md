# POC-01 · Activation locale et supervision Klipper

## Démarrer

FabCore utilise Node.js 24 et ses modules intégrés. Depuis le dépôt :

```bash
npm test
npm start
```

Ouvrir [127.0.0.1:3000](http://127.0.0.1:3000). Le serveur écoute en local par défaut. Pour un essai dans un LXC depuis un autre poste, lorsque SSH est disponible sur le LXC, ouvrir un tunnel puis utiliser la même URL dans le navigateur.

```bash
ssh -N -L 3000:127.0.0.1:3000 utilisateur@IP_DU_LXC
```

Si le port local 3000 est déjà occupé, choisir un autre port via `FABCORE_PORT` sur le serveur et dans le tunnel. Le LXC doit pouvoir joindre Moonraker.

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
