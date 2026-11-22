# Ajouter un connecteur FabCore

Références par fabricant et modèle : [dossier des protocoles](../docs/protocols/README.md), dont la [recherche Bambu Cloud](../docs/protocols/BAMBU-CLOUD.md).

Ajouter une définition dans [le registre](connectors.mjs). Le registre sert les métadonnées publiques au navigateur, puis charge l’adaptateur réseau au premier accès à une machine de ce type.

- `model` et `form` déterminent le nom et le formulaire. Pour une API HTTP locale, réutiliser `httpConnector`.
- `configure(data, existing)` valide l’adresse et les identifiants. Le résultat est enregistré par FabCore.
- `load(options)` renvoie au minimum `read(machine)` et `probe(machine, options)`. Mettre l’import du protocole dans cette fonction.
- `read` renvoie `status`, `issue`, `nozzle`, `bed`, `progress` en pourcentage et `file`. Les valeurs inconnues sont représentées par `null` pour les températures et par une chaîne vide pour le fichier. Le serveur filtre les identifiants privés.
- `probe` renvoie `{ ok, issue }`. Un connecteur qui doit vérifier l’identité avant enregistrement déclare `verify` et peut renvoyer un numéro de série ou une empreinte.
- Déclarer les fonctions réellement disponibles dans les métadonnées. Un connecteur peut fournir `camera`, `command`, `gcode`, `forget` et `close` selon ses besoins. La métadonnée `terminal` active le terminal G-code : `gcode(machine, script)` renvoie `{ outcome: 'executed' | 'accepted', responses }` ou `{ outcome: 'rejected', message }`, et lève une erreur si le résultat est inconnu. La métadonnée `files` active le panneau de fichiers : le connecteur fournit alors `files` avec `list(machine)`, `download(machine, path, signal)`, `upload(machine, name, flux, taille)` et `start(machine, path)`. Pour le suivi en direct, `read` renvoie `filePath` et `filePosition` (en octets) pendant une impression. Les connecteurs avec `live` fournissent leur propre date de mise à jour.

Contrat typé (MIG-02) : chaque définition doit produire un manifeste valide (`connectorManifest` dans `src/application/connectors.ts`) ; `src/application/connectors.test.ts` échoue sinon. Les lectures sont normalisées vers le domaine : statut inconnu → `unknown`, fichier vide ou progression hors ligne → `null`, `issue` sous forme de code. Une commande vaut au mieux `accepted` ; la confirmation vient de la supervision.

Utiliser des tests de réponses simulées et vérifier le parcours d’ajout dans FabCore. [PrusaLink](prusalink.mjs) illustre un adaptateur HTTP avec des capacités explicites.

`files.download` fournit le contenu pour la prévisualisation. Lorsqu’un connecteur transforme un conteneur (extraction du G-code d’un 3MF), il doit aussi fournir `downloadOriginal(machine, path, signal)` pour restituer ses octets originaux au téléchargement et au transfert. Sans cette méthode, le contenu de `download` est utilisé tel quel. Un transfert appelle uniquement `upload` ; le lancement reste une action séparée et confirmée via `start`. Le chemin retourné par `upload` est la cible réelle du lancement, pas nécessairement le nom envoyé.

### Fichiers et commandes de production

`commandActions` énumère les commandes réellement implémentées (`pause`, `resume`, `stop` et, pour un projet déjà préparé sur la M2, `start`). La route serveur vérifie cette liste, les droits administrateur, l’état de la machine et la confirmation d’un arrêt ou lancement. `stop` annule la fabrication ; ce n’est pas un arrêt d’urgence matériel. Une réponse perdue reste non confirmée, sans rejeu automatique.

Les commandes Bambu et CC2 utilisent la session MQTT existante, avec identifiants de transaction et sans mise en file hors connexion. La CC2 n’expose pas de reprise : elegoo-link laisse la correspondance 1023 commentée, sans implémentation utilisable. Ne pas la déclarer fonctionnelle sur cette seule base.

Les fichiers Elegoo accessibles ici sont les copies des fichiers transférés avec succès par FabCore, conservées dans le dossier de données et isolées par identité machine. Le SDK ne fournit pas de liste locale complète utilisable : `retainedOnly` l’indique au navigateur. Les copies ne prouvent pas que le stockage de la machine n’a pas été modifié par un autre logiciel. Bambu utilise FTPS implicite et PrusaLink son API v1. Un `projects` Bambu accepte les `.3mf` tranchés à un seul plateau ; le visualiseur extrait le G-code sans extraire de chemins sur disque (CRC et tailles vérifiés, 128 Mo décompressés maximum). Les archives non tranchées, multi-plateaux ou BGCODE ne sont pas prises en charge. Les lancements Bambu/Elegoo nécessitent une confirmation explicite de bobine externe ; aucun mapping automatique AMS/CANVAS n’est inventé.

La M2 dispose d’un visualiseur G-code local et de commandes sur le projet déjà préparé dans la machine. Le transfert natif M2 (projet `xf`, configuration et tâche) reste non implémenté : ne pas réutiliser le transfert G-code générique d’un autre modèle xTool. Pour JS002, les commandes de fabrication vont à `POST /v1/project/device/control` avec `params.action=START|PAUSE|RESUME|CANCEL`. `/v1/processing/state?action=stop` concerne le cadrage, pas l’annulation d’une fabrication.

## Règles de protocole

Règles tirées des essais sur le matériel :

- Avant une intégration incertaine, consulter la documentation du constructeur et les projets de référence ci-dessous.
- Privilégier le maintien des fonctions cloud du constructeur lorsque c’est possible. Ne pas imposer le mode LAN exclusif sans nécessité vérifiée.
- Maintenir une session persistante lorsque le protocole le prévoit. Éviter les authentifications répétées, la multiplication des clients MQTT et les reconnexions qui provoquent des bips.
- Gérer reconnexions et délais sans jamais rejouer automatiquement une commande de fabrication.
- Utiliser l’identité et le numéro de série réellement renvoyés par la machine. Les afficher en lecture seule dans le formulaire, ou indiquer une valeur indisponible quand le protocole ne la fournit pas.
- Distinguer une réponse de découverte, une connexion authentifiée et une supervision opérationnelle.
- Après un test de connexion réussi, permettre l’ajout sans provoquer de conflit de session.
- Une machine déjà ajoutée reste détectable avec la mention correspondante. Une machine supprimée doit pouvoir être redécouverte.
- Prévoir l’appairage matériel lorsqu’il est requis, et conserver les jetons uniquement côté serveur.

Références :

- Elegoo : [elegooofficial/elegoo-link](https://github.com/elegooofficial/elegoo-link)
- Bambu Lab : [Doridian/OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI)
- xTool : [thecodingdad/ha-xtool](https://github.com/thecodingdad/ha-xtool) et sa [description du protocole](https://github.com/thecodingdad/ha-xtool/blob/main/docs/PROTOCOL.md)

## Contrôles manuels

La métadonnée `controls` active le panneau. Le registre charge `control.read(machine)` et `control.execute(machine, command, snapshot)` depuis `manual-controls.mjs`. Les listes `lights`, `heaters`, `fans` et `motion` décrivent les équipements disponibles ; `writable` distingue les retours seuls. `validateControl` autorise uniquement les actions et valeurs présentes/bornées dans le dernier état relu côté serveur. `execute` renvoie `executed`, `accepted`, `confirmed` ou `rejected` ; une perte de réponse reste inconnue. Les commandes ne doivent pas créer une nouvelle session MQTT, être mises en file hors ligne ou être rejouées. Bambu utilise `system` pour `ledctrl`, `print` pour le G-code, avec corrélation par canal et séquence. Une chauffe Bambu ne renvoie `confirmed` qu’après lecture de la consigne demandée (cinq secondes maximum, lecture du cache de supervision, aucun rejeu). Sinon `heater-unconfirmed` distingue un accusé sans consigne confirmée. Les températures compactes des firmwares récents sont prises en compte : valeur courante sur les 16 bits bas, consigne sur les 16 bits hauts. Référence : [ha-bambulab, températures et commandes](https://github.com/greghesp/ha-bambulab/blob/main/custom_components/bambu_lab/pybambu/models.py).

### Humidité des modules filament

Chaque module normalisé peut fournir `humidity` : pourcentage réel numérique entre 0 et 100, ou `null`/absent. Le rendu de la fiche est commun aux marques. Bambu lit exclusivement `ams.ams[].humidity_raw` ; le champ `humidity` du protocole est un indice 1–5, pas un pourcentage. Référence : [ha-bambulab, modèles AMS](https://github.com/greghesp/ha-bambulab/blob/main/custom_components/bambu_lab/pybambu/models.py). Pas de conversion d’indice ou de moyenne artificielle entre modules/zones.

### Chauffe CC2

`elegoo` désigne la CC2. Le registre transmet `request` du moniteur à `createManualControls`, qui envoie `1028` avec uniquement `{extruder: value}` ou `{heater_bed: value}`. Les chauffages sont réglables pour les états natifs 1 (idle) et 2 (printing, incluant pause), avec plafonds 260/100 °C. Les autres contrôles restent en lecture seule. La méthode est documentée dans [pycentauri](https://github.com/bjan/pycentauri/blob/main/docs/PROTOCOL.md#centauri-carbon-2-cc2-protocol-notes) et utilisée par [elegoo-web](https://github.com/runnane/elegoo-web/blob/main/src/ui/controls.ts), en complément du constructeur de paramètres de `elegoo-link` ; elle n’est pas déduite du seul mapping commenté.

`error_code: 0` est un accusé, pas une mesure : l’exécuteur exige aussi la cible remontée par la supervision (jusqu’à cinq secondes). Refus et résultat inconnu restent distincts ; aucun rejeu. `controlState` ne renvoie pas les anciennes consignes après fermeture ou après 30 secondes sans rapport. L’intégration ne nécessite ni firmware communautaire ni console SSH. Recette sur le firmware matériel installé requise avant de déclarer cette chauffe validée.

## Longer Ray5 Wi-Fi

[Recherche et recette](../docs/protocols/LONGER-RAY5-LAN.md). Les contrôles TCP partagent le moniteur ; le registre conserve un `control` natif au lieu de le remplacer par le contrôleur HTTP générique. ACK séquentiels, résultats inconnus sans rejeu, état frais pour Pause/Reprise/Reset. Lecture `$$` limitée aux champs utiles ; aucune modification de configuration. Contrôles et lancement laser réservés à l’administrateur ; présence opérateur explicite pour impulsion et lancement. Le mode ESP3D reste sans contrôle manuel tant que ses acquittements ne sont pas qualifiés.

`fileFamily` distingue laser/FDM et est vérifié pour les transferts côté serveur et navigateur. Ray5 utilise ses chemins `.gc/.nc` confinés, `/upload` SD et `/SD` pour les originaux ; pas `/files` (flash) ni ESP221 (lignes reformattées). Les lectures du connecteur peuvent être asynchrones après instrumentation : l’adaptateur fichiers attend leur résultat. Un upload compare les octets relus, ne lance jamais le fichier et ne remplace pas intentionnellement un nom existant.

## Mise à jour CC2 / P2S du 22 novembre 2026

CC2 : inventaire interne MQTT 1044 sur la session existante, résultat natif conservé ; `retainedOnly` retiré pour cette famille seulement. HTTP `/download` confiné au nom local et au serveur configuré ; lancement 1020 vérifié contre la liste native. Les anciennes copies sur disque restent présentes mais ne constituent pas un inventaire. CC1 reste en copies FabCore. Voir [les paramètres et les sources](../docs/protocols/ELEGOO-LAN.md).

P2S : le motif constructeur `mqtt message verify failed` devient `bambu-authorization`, distinct des refus génériques et des résultats inconnus, pour commande, chauffe et lancement. Aucun rejeu ni changement automatique de mode. [Diagnostic et prérequis développeur](../docs/protocols/BAMBU-LAN.md).

## Migration CC2 TypeScript · MIG-02.2.1

Session et sondes : `connectors/elegoo/src/monitor.ts` ; fichiers natifs : `connectors/elegoo/src/files.ts`. `poc/elegoo.mjs` ne porte plus le protocole : il injecte les projections communes et réexporte les fonctions existantes. `poc/elegoo-files.mjs` compose le transfert segmenté partagé et conserve la branche CC1. Pas de deuxième client ni d’implémentation CC2 parallèle. Les ports internes initiaux du SDK n’importent aucune couche du cœur ; helpers encore partagés injectés par composition.

Topics, identifiant déterministe, méthodes 1002/2005/1044/1020/1021/1022/1028, limites de tailles, délais, jeton HTTP, absence de reprise et absence de rejeu inchangés. Le serveur POC utilise les adaptateurs ; la migration des routes vers le nouveau registre relève de MIG-03. Le SDK public et les manifestes autonomes ne sont pas déclarés terminés. Référence protocole et limites : [Elegoo LAN](../docs/protocols/ELEGOO-LAN.md).

## Migration P2S LAN TypeScript · MIG-02.2.1

Session MQTT/TLS, corrélation des accusés et sondes : `connectors/bambu/src/monitor.ts` ; fichiers FTPS implicites (racine et `cache/`), téléchargement, envoi et lancement `gcode_file`/`project_file` : `connectors/bambu/src/files.ts`. `poc/bambu.mjs` et `poc/bambu-files.mjs` injectent le certificat `poc/certs/bambu-p2s.pem` (partagé avec la caméra et la découverte), la projection des contrôles et des AMS, puis réexportent les fonctions existantes. Topics, identifiants, QoS 0 sans rétention, délais (8 s rapport, 6 s accusé, 60 s fraîcheur, 14 s sonde), refus `bambu-authorization`, absence de mapping AMS et absence de rejeu inchangés. Caméra, découverte et pilote cloud Bambu ne sont pas migrés ici.
