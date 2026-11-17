# Ajouter un connecteur FabCore

Ajouter une définition dans [le registre](connectors.mjs). Le registre sert les métadonnées publiques au navigateur, puis charge l’adaptateur réseau au premier accès à une machine de ce type.

- `model` et `form` déterminent le nom et le formulaire. Pour une API HTTP locale, réutiliser `httpConnector`.
- `configure(data, existing)` valide l’adresse et les identifiants. Le résultat est enregistré par FabCore.
- `load(options)` renvoie au minimum `read(machine)` et `probe(machine, options)`. Mettre l’import du protocole dans cette fonction.
- `read` renvoie `status`, `issue`, `nozzle`, `bed`, `progress` en pourcentage et `file`. Les valeurs inconnues sont représentées par `null` pour les températures et par une chaîne vide pour le fichier. Le serveur filtre les identifiants privés.
- `probe` renvoie `{ ok, issue }`. Un connecteur qui doit vérifier l’identité avant enregistrement déclare `verify` et peut renvoyer un numéro de série ou une empreinte.
- Déclarer les fonctions réellement disponibles dans les métadonnées. Un connecteur peut fournir `camera`, `command`, `gcode`, `forget` et `close` selon ses besoins. La métadonnée `terminal` active le terminal G-code : `gcode(machine, script)` renvoie `{ outcome: 'executed' | 'accepted', responses }` ou `{ outcome: 'rejected', message }`, et lève une erreur si le résultat est inconnu. Les connecteurs avec `live` fournissent leur propre date de mise à jour.

Utiliser des tests de réponses simulées et vérifier le parcours d’ajout dans FabCore. [PrusaLink](prusalink.mjs) illustre un adaptateur de télémétrie HTTP en lecture seule.
