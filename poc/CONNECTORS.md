# Ajouter un connecteur FabCore

Ajouter une définition dans [le registre](connectors.mjs). Le registre sert les métadonnées publiques au navigateur, puis charge l’adaptateur réseau au premier accès à une machine de ce type.

- `model` et `form` déterminent le nom et le formulaire. Pour une API HTTP locale, réutiliser `httpConnector`.
- `configure(data, existing)` valide l’adresse et les identifiants. Le résultat est enregistré par FabCore.
- `load(options)` renvoie au minimum `read(machine)` et `probe(machine, options)`. Mettre l’import du protocole dans cette fonction.
- `read` renvoie `status`, `issue`, `nozzle`, `bed`, `progress` en pourcentage et `file`. Les valeurs inconnues sont représentées par `null` pour les températures et par une chaîne vide pour le fichier. Le serveur filtre les identifiants privés.
- `probe` renvoie `{ ok, issue }`. Un connecteur qui doit vérifier l’identité avant enregistrement déclare `verify` et peut renvoyer un numéro de série ou une empreinte.
- Déclarer les fonctions réellement disponibles dans les métadonnées. Un connecteur peut fournir `camera`, `command`, `gcode`, `forget` et `close` selon ses besoins. La métadonnée `terminal` active le terminal G-code : `gcode(machine, script)` renvoie `{ outcome: 'executed' | 'accepted', responses }` ou `{ outcome: 'rejected', message }`, et lève une erreur si le résultat est inconnu. La métadonnée `files` active le panneau de fichiers : le connecteur fournit alors `files` avec `list(machine)`, `download(machine, path, signal)`, `upload(machine, name, flux, taille)` et `start(machine, path)`. Pour le suivi en direct, `read` renvoie `filePath` et `filePosition` (en octets) pendant une impression. Les connecteurs avec `live` fournissent leur propre date de mise à jour.

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
