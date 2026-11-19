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

## Organisations, sites, fermes et comptes constructeur

Décision du 19 novembre 2026 : privilégier les fonctions cloud validées, tout en permettant un parc de machines LAN et cloud dans FabCore.

- Une machine a un seul mode de connexion configuré : **LAN ou cloud**, jamais les deux simultanément. Une capacité absente du mode choisi est signalée indisponible. Aucun basculement automatique ; changer de mode demande une action explicite et ferme l’ancienne connexion avant d’ouvrir la nouvelle.
- Une organisation peut gérer plusieurs sites et plusieurs fermes/ateliers par site, avec des gestionnaires et droits distincts. La vue consolidée ne montre que les périmètres autorisés.
- Plusieurs comptes du même constructeur (Bambu Lab, Creality, Elegoo, etc.) peuvent coexister, avec jetons et sessions indépendants. La compatibilité cloud est vérifiée par marque, modèle, firmware et fonction avant d’être annoncée.
- Ne pas confondre utilisateur FabCore, compte constructeur, site et ferme. Un compte peut présenter des machines de plusieurs sites ; un site peut contenir des machines issues de plusieurs comptes et des machines LAN.
- L’import affecte explicitement chaque machine à son site et sa ferme. Une identité déjà configurée dans un mode n’est pas ajoutée en double dans l’autre. Aucun rapprochement automatique entre organisations.
- Une panne ou révocation d’un compte ne déconnecte pas les autres comptes. Les identifiants et jetons restent inaccessibles aux autres gestionnaires ; les autorisations s’appliquent aux API, commandes, fichiers, caméras et événements.

Exemple de recette : une CC2 en cloud via le compte A et une seconde CC2 en LAN, sur le même site ou sur deux sites différents. FabCore les distingue et affiche le mode propre à chacune. Le compte constructeur éventuellement utilisé par ailleurs pour la seconde n’est pas requis pour sa connexion LAN.

## Fichiers natifs de toutes les familles

Demande du 19 novembre 2026 : le panneau de fichiers doit viser l’inventaire réel de chaque machine FDM, résine, CNC et laser, indépendamment du logiciel ayant envoyé les fichiers. Inclure les stockages que le protocole permet d’interroger (interne, cache, SD, USB), les dossiers et les fichiers préinstallés ; ne pas supposer leur absence si une liste n’est pas disponible.

Distinguer inventaire natif, copies d’envois FabCore et bibliothèque locale. Indiquer la source et le périmètre de la liste. Un connecteur limité aux copies ne doit pas nommer son panneau « Fichiers de la machine » ni déclarer la machine vide. Un protocole sans stockage distant doit être présenté comme tel. Ne pas annoncer une lecture ou un lancement de format résine/CNC/laser à partir du seul visualiseur G-code FDM.

Appliquer recherche par nom/chemin, tris récent/ancien et A–Z, cinq éléments par défaut ou vingt par page, aux listes des connecteurs compatibles. Signaler les limites de chargement ; la pagination visuelle ne prouve pas que tous les stockages ont été interrogés. La sélection de Visualiser/Lancer reste attachée au fichier exact après filtrage ou tri.
