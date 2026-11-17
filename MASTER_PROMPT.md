# Prompt maître — FabCore

> Version consolidée à partir des exigences et décisions du projet, le 17 novembre 2026.
> Ce document formalise le cadre du projet ; il ne constitue pas une copie verbatim du premier prompt de conversation.

## Mission

Tu contribues à FabCore, une interface web française de supervision et de gestion d’un atelier de fabrication numérique multimarque : imprimantes 3D, machines laser et, à terme, autres équipements compatibles.

Faire évoluer progressivement le produit : POC utilisable sur matériel réel, MVP, puis développement complet. La cible finale est un SaaS hébergé par le porteur du projet sur un VPS ou serveur dédié, avec un agent local par atelier. Conserver le parcours auto-hébergé simple.

## Reprendre le travail

1. Lire [AGENTS.md](AGENTS.md), vérifier la branche, les modifications locales et les dernières PR fusionnées.
2. Lire le suivi de la phase active : [POC](docs/POC.md), [MVP](docs/MVP.md) ou [développement complet](docs/FULL-DEVELOPPEMENT.md).
3. Pour les connecteurs, lire [poc/CONNECTORS.md](poc/CONNECTORS.md). Pour l’installation et l’exploitation, lire [poc/README.md](poc/README.md).
4. Identifier ce qui est développé, fusionné, déployé et réellement testé. Ne pas déduire un déploiement d’une fusion.
5. Choisir une tâche bornée et une branche dédiée. Préserver le travail des autres personnes et IA.

Ce document décrit l’intention durable. Les fichiers de phase, les tickets, les PR et le code décrivent l’état courant. En cas de divergence, vérifier les éléments récents et signaler le point à résoudre au lieu de reconstruire une fonctionnalité déjà livrée.

## Produit et expérience

- Une vue d’ensemble du parc : état, fabrication, progression, températures, activité récente et accès à chaque machine.
- Une fiche machine lisible : caméra et télémétrie côte à côte ; fabrication et système multimatériau en dessous lorsqu’il existe. Adapter la disposition aux petits écrans et aux capacités réelles.
- Un graphique commun pour les températures de buse et de plateau. Afficher honnêtement les interruptions de données.
- Une représentation compacte des AMS et CANVAS, avec bobines étroites et rapprochées, emplacements vides, matière, couleur et emplacement actif si ces informations sont reçues.
- Un aperçu instantané dans le cadre caméra à l’ouverture de la fiche ; le flux vidéo démarre sur action « Voir la caméra ». Partager le flux serveur entre spectateurs pour éviter de multiplier les connexions vers une machine.
- Pour la xTool M2 : sélection des vues angle, centrale et outil ; vue d’angle par défaut. Ne pas présenter une succession de captures comme une vidéo.
- Un journal de diagnostic global et par machine, exploitable sans exposer de secrets.
- Ajout, modification et suppression des machines ; gestion cohérente de leurs connexions et ressources.
- Aucune donnée de démonstration présentée comme une mesure réelle. Ne pas afficher les identifiants techniques internes à la place d’informations utiles.

## Identité et langues

Conserver l’identité FabCore : noir, gris et vert en thème sombre, avec un thème clair cohérent. Interface moderne, compacte et lisible, sans modification globale de la direction visuelle à chaque intervention.

Le français est la langue principale. Prévoir les textes via le mécanisme i18n du projet et maintenir l’anglais pour permettre une traduction rapide. Les nouvelles interfaces doivent respecter les deux langues et les conventions existantes.

## Installation et mises à jour

Viser une installation presque prête à l’emploi sur serveur Linux ou LXC Proxmox. Respecter les distributions effectivement prises en charge par les scripts ; ne pas annoncer Alpine, Docker ou Community Scripts comme disponibles sans implémentation et validation.

- Installer les dépendances nécessaires, notamment Node.js et FFmpeg selon les fonctions livrées.
- Fournir un parcours de premier démarrage protégé par un jeton affiché dans le terminal pour créer le premier administrateur.
- Proposer la configuration OIDC/Pocket ID, SMTP, notifications et premières machines.
- Pour ntfy : proposer un serveur interne, installé et configuré sur l’hôte de FabCore, ou un serveur externe avec les paramètres requis.
- Rendre `fabcore-update` disponible dès l’installation et documenter la mise à jour des installations existantes.
- Préserver les données, droits et réglages lors des mises à jour. Documenter les limites et vérifications réellement effectuées.
- Garder un README accessible, orienté présentation du produit, avec installation simple, compatibilités honnêtes et liens vers les guides techniques.

## Connecteurs et découverte

Privilégier un moteur commun et des connecteurs respectant un contrat stable. Exposer les capacités par machine ; ne pas ajouter des boutons dont le connecteur ne dispose pas.

Périmètre des familles à suivre : Klipper/Moonraker, Bambu Lab, Elegoo, Creality, OctoPrint, PrusaLink et xTool. Leur présence dans cette liste ne signifie pas qu’elles sont toutes prises en charge au même niveau. Vérifier les modèles et fonctions dans le dépôt.

- Réutiliser les bibliothèques, contrats et conventions existants.
- Avant une intégration incertaine, consulter la documentation et les projets de référence, notamment elegooofficial/elegoo-link, Doridian/OpenBambuAPI et thecodingdad/ha-xtool.
- Privilégier le maintien des fonctions cloud constructeur lorsque possible ; ne pas imposer le mode LAN exclusif sans nécessité vérifiée.
- Maintenir les sessions persistantes lorsque le protocole le prévoit. Éviter les authentifications répétées, la multiplication des clients MQTT et les reconnexions provoquant des bips.
- Gérer les reconnexions et temporisations sans rejouer automatiquement les commandes de fabrication.
- Utiliser les identités et numéros de série réellement renvoyés. Afficher un champ en lecture seule dans les formulaires ; indiquer une valeur indisponible lorsque le protocole ne la fournit pas.
- Ouvrir d’abord la fenêtre de découverte depuis « Ajouter une machine », avec scan ou saisie manuelle.
- Scanner le réseau choisi du serveur ou, plus tard, de l’agent. Une machine déjà ajoutée reste détectable et porte la mention correspondante. Une machine supprimée doit pouvoir être redécouverte.
- Distinguer une réponse de découverte, une connexion authentifiée et une supervision opérationnelle.
- Après un test de connexion réussi, permettre l’ajout sans provoquer un conflit de session.
- Prévoir l’appairage matériel et conserver les jetons uniquement côté serveur lorsque nécessaire.

Références :
- https://github.com/elegooofficial/elegoo-link
- https://github.com/Doridian/OpenBambuAPI
- https://github.com/thecodingdad/ha-xtool
- https://github.com/thecodingdad/ha-xtool/blob/main/docs/PROTOCOL.md

## Accès et notifications

- Administrateur : configuration et commandes autorisées par les connecteurs.
- Observateur : consultation, sans accès aux commandes administratives.
- Vérifier les autorisations côté serveur, y compris pour les flux et diagnostics.
- Prendre en charge OIDC, notamment Pocket ID, selon l’implémentation du projet.
- Ne jamais committer mots de passe, clés API, codes LAN, jetons, cookies ou données privées.
- Distinguer notifications de test et alertes automatiques de fabrication. Ne pas annoncer ces dernières comme livrées tant qu’elles ne le sont pas.
- Les notifications mobiles doivent tenir compte des mécanismes ntfy, Web Push/PWA et des contraintes de plateforme réellement implémentés.

## POC, MVP et suite

La phase active est le POC. Ne pas déplacer implicitement le projet vers une refonte SaaS.

Repères au 17 novembre 2026 :
- POC-01 à POC-08 sont répertoriés dans [docs/POC.md](docs/POC.md).
- POC-08 correspond à ntfy et SMTP, fusionné dans la PR #11.
- De nombreux ajouts ont ensuite été livrés sans numéro de jalon supplémentaire.
- Le prochain jalon proposé est POC-09 : terminal G-code sur Moonraker et OctoPrint, lié au ticket #32. Cette proposition ne signifie pas que le terminal est déjà implémenté.
- Le visualiseur G-code a fait l’objet de la PR #42 ; vérifier son état et sa recette avant d’y intervenir.
- L’utilisateur a confirmé le 17 novembre 2026 que les caméras xTool M2 fonctionnent parfaitement après les correctifs. Ne pas traiter ce point comme un échec encore ouvert sans nouveau signal.

Pour le terminal : réserver l’accès aux administrateurs, afficher les réponses, limiter les ressources et ne jamais renvoyer automatiquement une commande après une coupure. Valider le périmètre sur les connecteurs compatibles ; ne pas l’étendre arbitrairement à toutes les machines.

L’agent local relève du MVP : Raspberry Pi ou LXC sur le réseau de l’atelier, connexion sortante authentifiée vers le SaaS, découverte et supervision locales, reconnexion et isolation entre ateliers. Une autorisation réseau locale du navigateur ne remplace pas cet agent pour le suivi continu.

Évolutions futures : modules de connexion faciles à contribuer et chargés selon les besoins, éventuels processus séparés ou conteneurs si justifiés, amélioration des alertes, fichiers et caméras à distance. Ne pas transformer ces orientations en refonte immédiate.

## Méthode de développement et relais entre IA

Appliquer [AGENTS.md](AGENTS.md) à chaque intervention.

- Livrer un diff minimal couvrant la demande. Ne pas reformater tout le dépôt, réécrire l’architecture, renommer en masse ou mettre à jour les dépendances sans demande.
- Réutiliser les composants et interfaces existants. Préserver les installations et données déjà enregistrées.
- Une branche et une PR par tâche ou jalon cohérent. Ne pas fusionner ni déployer sans demande.
- Faire les vérifications adaptées : contrôle du diff pour la documentation ; tests pertinents et contrôles requis par AGENTS.md pour le code.
- Tester les comportements à risque de régression sans multiplier les tests qui recopient l’implémentation.
- Distinguer tests automatisés, essai navigateur et essai matériel. Ne jamais annoncer comme testé ce qui ne l’a pas été.
- Mettre à jour le suivi de phase après un changement significatif, avec la prochaine action concrète et les liens utiles.
- Dans la PR : problème, résultat, fichiers importants, vérifications réalisées, limites et recette restante.
- Pour réduire le coût de reprise, lire d’abord les documents courts de suivi, puis rechercher avec `rg` et ouvrir uniquement les fichiers utiles.
- Communiquer en français, clairement, avec des mises à jour concises. Avancer sur le travail autorisé sans demander de confirmations répétées.

## Résultat attendu de chaque intervention

Une évolution ciblée, vérifiable et réversible autant que possible ; une PR compréhensible ; un suivi permettant à une autre IA de poursuivre sans relire toute la conversation ni déstabiliser le code.
