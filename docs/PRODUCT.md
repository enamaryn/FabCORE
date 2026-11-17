# Règles produit et interface

Règles durables tirées des essais du POC. Elles s’appliquent à toute nouvelle interface, notamment à la reconstruction React du MVP. L’intention d’origine est dans le [prompt d’origine](../MASTER_PROMPT_ORIGIN.md), le plan et les décisions dans les [fichiers de phase](POC.md), les règles des connecteurs dans le [contrat des connecteurs](../poc/CONNECTORS.md).

## Données affichées

- N’afficher que des mesures réelles. Aucune donnée de démonstration présentée comme une mesure.
- Afficher les informations utiles, jamais les identifiants techniques internes à leur place.
- Montrer honnêtement les interruptions de données (graphique, dernière mise à jour, état « connexion »).
- N’afficher un bouton que si le connecteur de la machine dispose de la capacité correspondante.

## Vue d’ensemble et fiche machine

- La vue d’ensemble montre l’état du parc : état, fabrication, progression, températures, activité récente et accès à chaque machine.
- Sur la fiche machine, la caméra et la télémétrie sont côte à côte. La fabrication et le système multimatériau sont en dessous lorsqu’il existe. La disposition s’adapte aux petits écrans et aux capacités réelles.
- Un graphique commun affiche les températures de buse et de plateau.
- AMS et CANVAS sont représentés de façon compacte : bobines étroites et rapprochées, emplacements vides, matière, couleur et emplacement actif lorsque ces informations sont reçues.
- « Ajouter une machine » ouvre d’abord la découverte, avec le choix entre scan du réseau et saisie manuelle. Le scan part du serveur, ou plus tard de l’agent local.
- Ajout, modification et suppression des machines gèrent aussi leurs connexions et ressources (sessions, flux caméra).

## Caméras

- À l’ouverture de la fiche, afficher un aperçu instantané dans le cadre caméra. La vidéo démarre sur « Voir la caméra ».
- Le flux est relayé par le serveur et partagé entre spectateurs, pour ne pas multiplier les connexions vers la machine.
- xTool M2 : vues angle, centrale et outil sélectionnables, angle par défaut. Ne pas présenter une succession de captures comme une vidéo.

## Accès et sécurité

- Vérifier les autorisations côté serveur, y compris pour les flux vidéo, les fichiers et les diagnostics.
- Le journal de diagnostic, global et par machine, ne contient aucun secret.
- Ne jamais committer de mots de passe, clés API, codes LAN, jetons, cookies ou données privées.

## Notifications

- Distinguer les notifications de test des alertes automatiques de fabrication. Ne pas annoncer une alerte comme livrée tant qu’elle ne l’est pas.
- Tenir compte des contraintes réelles de ntfy, de Web Push et des plateformes mobiles.

## Identité et langues

- Conserver l’identité FabCore : noir, gris et vert en thème sombre, thème clair cohérent ([design](../design/README.md)). Pas de changement global de direction visuelle lors d’une intervention ponctuelle.
- Le français est la langue principale. Tout nouveau texte passe par le mécanisme i18n et existe aussi en anglais.

## Installation et mises à jour

- Viser une installation presque prête à l’emploi sur serveur Linux ou LXC Proxmox.
- N’annoncer une distribution, Docker ou les Community Scripts qu’après implémentation et validation.
- Installer les dépendances des fonctions livrées (Node.js, FFmpeg…). Rendre `fabcore-update` disponible dès l’installation.
- Préserver les données, droits et réglages lors des mises à jour. Documenter les limites et les vérifications réellement faites.
- Garder un README accessible, orienté produit, avec des compatibilités honnêtes et des liens vers les guides techniques.
