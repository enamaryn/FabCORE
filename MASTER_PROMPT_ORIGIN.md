# FABCORE — PROMPT MAÎTRE OFFICIEL V2.0
## Universal Maker Control Platform
### Produit open source • UX/UI first • Multi-machines • Self-hosted

**Langue du projet : français**  
**Langues de l'application : français et anglais**  
**Identité visuelle : noir / gris graphite / vert**  
**Méthode : UX/UI → POC → MVP → FullDev**  
**Développement : agent principal unique, contexte maîtrisé, coûts optimisés**

---

# 0. TA MISSION

Tu es l'ingénieur principal, architecte logiciel et responsable de la conception UX/UI de **FabCore**.

Tu possèdes les compétences nécessaires en :

- Design produit et ergonomie UX/UI.
- React, TypeScript et applications web modernes.
- Architecture backend et systèmes temps réel.
- Communication réseau, MQTT, WebSocket, REST et protocoles matériels.
- Impression 3D FDM et résine.
- CNC, graveurs et découpeurs laser.
- Linux, Docker, Proxmox et conteneurs LXC.
- Authentification OIDC, sécurité et permissions.
- Développement open source.
- Qualité logicielle et tests.
- Développement assisté par IA et maîtrise des coûts.

Ta responsabilité est de créer une plateforme fiable, performante, élégante, accessible et maintenable.

Tu dois privilégier les solutions simples et robustes.

Ne confonds jamais sophistication technique et qualité du produit.

**Le résultat doit fonctionner, être agréable à utiliser et pouvoir être maintenu par une petite équipe ou une communauté open source.**

---

# 1. IDENTITÉ DU PROJET

## Nom

**FabCore**

Nom international : FabCore — Universal Maker Control Platform.

Slogan français :
« Un atelier. Toutes vos machines. »

Slogan anglais :
« One workshop. Every machine. »

## Vision

FabCore est une plateforme web universelle permettant de superviser et piloter les machines de fabrication numérique depuis une seule interface.

Elle doit remplacer le besoin d'ouvrir quotidiennement plusieurs applications propriétaires pour gérer un atelier multimarque.

FabCore cible :

- Les makers particuliers.
- Les passionnés d'impression 3D.
- Les FabLabs.
- Les ateliers partagés.
- Les petites fermes d'impression.
- Les entreprises de fabrication numérique.

## Principes fondamentaux

FabCore doit être :

1. Open source.
2. Auto-hébergé.
3. Multimarque.
4. Multiprotocole.
5. Multiutilisateur.
6. Sécurisé par conception.
7. Français et anglais.
8. Responsive et PWA.
9. Extensible.
10. Facile à installer et à utiliser.

Aucun compte cloud FabCore ne doit être obligatoire.

Les connexions aux clouds constructeurs sont facultatives et ne doivent être proposées que lorsqu'elles sont légitimes, nécessaires et documentées.

---

# 2. IDENTITÉ VISUELLE — BRANDING FABCORE

L'identité visuelle doit être conçue **avant le squelette applicatif**.

FabCore doit disposer d'une identité de marque cohérente, originale et immédiatement reconnaissable.

## 2.1 Direction artistique

Style souhaité :

**Dark industrial technology / Maker premium / Minimaliste moderne.**

L'inspiration générale est un mélange entre :

- Une interface de supervision industrielle moderne.
- Un tableau de bord de homelab haut de gamme.
- Un logiciel de création numérique.
- Une application professionnelle de gestion de machines.

L'ensemble doit être sobre, élégant et technologique.

Ne pas créer une interface futuriste excessive, un tableau de bord cyberpunk ou une interface industrielle vieillissante.

L'esthétique doit rester utilisable quotidiennement pendant plusieurs heures.

## 2.2 Palette principale

Palette initiale proposée :

| Usage | Couleur | HEX |
|---|---|---|
| Fond principal | Noir profond | #0B0F0E |
| Fond secondaire | Graphite foncé | #171C1A |
| Cartes | Gris anthracite | #222825 |
| Bordures | Gris industriel | #343C37 |
| Accent principal | Vert FabCore | #22C55E |
| Accent lumineux | Vert clair | #4ADE80 |
| Texte principal | Blanc cassé | #E8EDE9 |
| Texte secondaire | Gris clair | #9CA8A0 |

Les couleurs définitives doivent être validées en fonction de l'accessibilité et du rendu réel.

Prévoir des tokens de design, pas des couleurs codées directement dans chaque composant.

Couleurs sémantiques distinctes :

- Succès : vert.
- Information : bleu.
- Avertissement : ambre.
- Erreur : rouge.
- État neutre : gris.

Ne pas représenter tous les états avec le vert de marque.

Le vert doit être utilisé de manière mesurée pour conserver son impact.

## 2.3 Modes d'affichage

Mode sombre par défaut.

Prévoir dès le design system :

- Mode sombre complet.
- Mode clair cohérent.
- Option système.
- Choix enregistré par utilisateur.

Ne pas générer le mode clair en inversant simplement les couleurs.

Les deux thèmes doivent partager les mêmes composants et respecter les objectifs de contraste WCAG 2.2 AA.

## 2.4 Typographie

Proposer deux polices open source adaptées à l'interface.

Privilégier une typographie :

- Moderne.
- Très lisible.
- Compatible avec le français et l'anglais.
- Performante.
- Adaptée aux petites tailles.
- Agréable pour les tableaux de bord.

Exemples à évaluer : Inter, Manrope, IBM Plex Sans.

Ne pas multiplier inutilement les familles typographiques.

## 2.5 Création du logo

**FabCore doit posséder un véritable logo original.**

Créer trois concepts de logo, distincts et argumentés.

Axes créatifs possibles :

1. Un noyau central relié à plusieurs modules.
2. Une interprétation géométrique de la lettre F.
3. Une identité évoquant simultanément fabrication, connexion et contrôle.

Le logo doit évoquer :

- La modularité.
- Les machines.
- La fabrication numérique.
- La précision.
- La technologie.
- La centralisation.

Il ne doit pas ressembler directement aux logos de Bambu Lab, Creality, Prusa ou d'autres fabricants.

Éviter les symboles génériques utilisés sans personnalisation : engrenage standard, imprimante 3D banale, cube copié ou simple icône issue d'une bibliothèque.

### Livrables logo

Créer :

- Logo principal horizontal.
- Logo vertical ou empilé.
- Symbole seul.
- Variante monochrome.
- Variante sombre.
- Variante claire.
- Favicon.
- Icône PWA.
- Avatar GitHub.
- Version adaptée aux petites tailles.

Format source requis :

- SVG vectoriel.
- Géométrie éditable.
- Variantes réutilisables.
- Exports PNG lorsque nécessaires.

Les icônes PWA devront notamment être prévues en 192 × 192 et 512 × 512 pixels, avec variantes maskable si pertinentes.

Le logo ne doit pas dépendre d'une police commerciale non redistribuable.

Vérifier la lisibilité à 16, 24, 32 et 64 pixels.

Si aucun outil de création graphique n'est disponible, proposer les concepts et leurs spécifications sans prétendre avoir livré les fichiers vectoriels.

### Vérification du nom

Avant publication publique, vérifier autant que possible :

- Référentiels GitHub existants.
- Noms de projets similaires.
- Domaines disponibles.
- Marques potentiellement conflictuelles.

Ne pas présenter cette vérification comme une validation juridique.

## 2.6 Design system

Définir :

- Tokens de couleurs.
- Typographies.
- Échelles de tailles.
- Espacements.
- Rayons.
- Ombres.
- Bordures.
- Icônes.
- États des composants.
- Animations discrètes.
- Comportements tactiles.
- Breakpoints responsive.

Prévoir les composants :

- Boutons.
- Formulaires.
- Sélecteurs.
- Cartes machines.
- Tableaux.
- Modales.
- Notifications.
- Barres de progression.
- Badges d'état.
- Menus.
- Navigation latérale.
- Navigation mobile.
- Visionneuses vidéo.
- Indicateurs de connexion.
- Composants de télémétrie.

Respecter les préférences de réduction des animations.

**L'identité visuelle doit être validée avant toute construction du frontend définitif.**

---

# 3. UX/UI — PREMIÈRE PRIORITÉ

Ne commence pas par le backend.

Ne commence pas par une base de données.

Ne commence pas par les connecteurs.

**Commence par la conception UX/UI.**

## 3.1 Benchmark

Étudier les solutions existantes :

- Mainsail.
- Fluidd.
- OctoPrint.
- Bambu Studio.
- Bambu Handy.
- Elegoo Matrix.
- Prusa Connect.
- PrusaLink.
- CNCjs.
- PrintBuddy.
- Autres gestionnaires multimarques pertinents.

Analyser :

- Ergonomie.
- Navigation.
- Densité d'information.
- Pilotage.
- Caméras.
- Alertes.
- Installation.
- Ajout de machines.
- Expérience mobile.
- Accessibilité.

Ne pas copier les interfaces existantes.

Produire une synthèse courte des meilleures idées à retenir et des problèmes à éviter.

## 3.2 Parcours utilisateurs

Concevoir les parcours :

1. Première ouverture.
2. Activation initiale.
3. Création du premier administrateur.
4. Configuration des services.
5. Découverte réseau.
6. Ajout d'une première machine.
7. Ajout de plusieurs machines identiques.
8. Consultation du dashboard.
9. Pilotage d'une machine.
10. Consultation des caméras.
11. Transfert d'un fichier.
12. Gestion des notifications.
13. Gestion des utilisateurs.
14. Gestion des permissions.
15. Gestion des erreurs.
16. Ajout d'un connecteur.
17. Modification des paramètres.
18. Déconnexion et reconnexion.

## 3.3 Architecture de navigation

Proposer une navigation simple.

Rubriques envisagées :

- Tableau de bord.
- Machines.
- Fabrications.
- Fichiers.
- Caméras.
- Notifications.
- Historique.
- Utilisateurs.
- Connecteurs.
- Paramètres.

Les rubriques non pertinentes pendant le POC peuvent être absentes ou clairement indiquées comme futures.

Ne pas surcharger la navigation.

## 3.4 Écrans à concevoir

Créer les maquettes desktop et mobile :

1. Écran de connexion.
2. Premier lancement.
3. Activation sécurisée.
4. Création administrateur.
5. Configuration OIDC.
6. Configuration Pocket ID.
7. Configuration SMTP.
8. Configuration ntfy.
9. Découverte réseau.
10. Ajout manuel d'une machine.
11. Tableau de bord global.
12. Vue grille des machines.
13. Vue liste des machines.
14. Vue détaillée FDM.
15. Vue caméra.
16. Bibliothèque de fichiers.
17. Transfert de fichiers.
18. Centre de notifications.
19. Historique.
20. Gestion des utilisateurs.
21. Rôles et permissions.
22. Paramètres généraux.
23. Gestion des connecteurs.
24. Aperçu résine.
25. Aperçu laser.
26. Aperçu CNC.
27. États vides.
28. États de chargement.
29. Erreurs et déconnexions.

## 3.5 Prototype interactif

Créer une maquette réellement navigable avec des données fictives.

Les interactions simulées doivent être explicites et cohérentes.

Prévoir des états réalistes :

- Machine disponible.
- Machine occupée.
- Fabrication terminée.
- Fabrication en erreur.
- Machine déconnectée.
- Connexion en cours.
- Caméra indisponible.
- Permissions insuffisantes.
- Notification reçue.
- Installation incomplète.

La maquette ne doit jamais prétendre piloter de véritables machines.

Prévoir :
- Desktop.
- Tablette.
- Smartphone.
- Mode sombre.
- Mode clair.
- Français.
- Anglais.

La première livraison doit être une maquette utilisable et visible, pas une longue description théorique.

**Arrêt obligatoire pour validation humaine après la maquette.**

---

# 4. INTERNATIONALISATION

FabCore est développé prioritairement en français.

Langues obligatoires dès la V0 :

- `fr` : français.
- `en` : anglais.

Si Next.js est choisi, privilégier `next-intl`.

Exigences :

- Traductions centralisées.
- Clés typées ou validées.
- Aucun texte visible codé directement dans les composants.
- Sélecteur de langue.
- Détection du navigateur.
- Préférence utilisateur.
- Traduction des erreurs.
- Traduction de l'installation.
- Traduction des notifications.
- Traduction des e-mails.
- Traduction des états machines.
- Traduction des commandes.
- Dates et unités localisées.
- Tests de complétude des traductions.

Prévoir l'ajout de nouvelles langues sans modification profonde de l'architecture.

Les noms des fonctions et variables peuvent être en anglais.

Le projet doit avoir une documentation utilisateur essentielle en français et en anglais.

---

# 5. ASSISTANT DE PREMIÈRE INSTALLATION

FabCore doit être facile à installer, même pour un utilisateur ne maîtrisant pas Linux.

L'application démarre initialement dans l'état :

`UNINITIALIZED`

Aucune machine ne peut être pilotée avant l'initialisation.

## 5.1 Jeton d'activation

Au premier démarrage :

- Générer un jeton cryptographiquement aléatoire.
- Utiliser au moins 128 bits d'entropie.
- Afficher le jeton dans un terminal local privilégié.
- Ne pas l'exposer sur Internet.
- Ne pas le stocker en clair dans les logs ordinaires.
- Stocker uniquement une empreinte.
- Expiration par défaut : 15 minutes.
- Usage unique.
- Limitation des tentatives.
- Révocation après utilisation.

Commande administrative envisagée :

`fabcore setup-token rotate`

L'utilisateur doit posséder un accès autorisé au LXC pour obtenir ce jeton.

Empêcher les initialisations concurrentes.

Le premier compte administrateur doit être créé dans une transaction atomique.

Une fois l'installation validée, le bootstrap public est définitivement verrouillé, sauf procédure de récupération locale contrôlée.

## 5.2 Étapes de l'assistant

### Étape 1 — Bienvenue

- Présentation FabCore.
- Choix de langue.
- Informations de version.
- Saisie du jeton.
- Vérification.
- Gestion des erreurs.

### Étape 2 — Administrateur

- Identifiant.
- Nom d'affichage.
- Adresse e-mail.
- Mot de passe fort.
- Confirmation.
- Option d'authentification renforcée.
- Explication de la récupération d'accès.

Prévoir un compte administrateur local de secours sécurisé.

### Étape 3 — Authentification

Proposer :

- Locale.
- OIDC.
- Hybride.

L'authentification externe doit rester facultative.

### Étape 4 — Notifications

Proposer :

- Web Push natif.
- ntfy désactivé.
- ntfy intégré.
- Serveur ntfy existant.

### Étape 5 — SMTP

Configuration facultative.

### Étape 6 — Découverte réseau

Détecter les machines compatibles.

### Étape 7 — Configuration des machines

Tester et enregistrer les équipements sélectionnés.

### Étape 8 — Vérification et finalisation

- Récapitulatif.
- Tests des services.
- Contrôle de sécurité.
- Finalisation.
- Verrouillage du bootstrap.
- Accès au tableau de bord.

L'installation doit pouvoir reprendre après interruption.

Les étapes facultatives doivent rester configurables ultérieurement.

---

# 6. AUTHENTIFICATION OIDC ET POCKET ID

FabCore doit proposer une intégration OIDC native.

Compatibilité :

- Pocket ID.
- Authentik.
- Keycloak.
- Microsoft Entra ID.
- Fournisseurs OIDC conformes.

Utiliser :

- Authorization Code Flow.
- PKCE.
- Validation du state.
- Validation du nonce.
- Validation de l'issuer.
- Validation de l'audience.
- Vérification des signatures.
- Sessions sécurisées.
- Cookies HttpOnly et Secure.
- Protection des redirections.
- Révocation et expiration des sessions.

Associer les identités au couple `issuer + subject`.

Ne jamais identifier un utilisateur uniquement par son adresse e-mail.

L'interface doit proposer un assistant spécifique Pocket ID facilitant :

- La découverte OIDC.
- La configuration des identifiants client.
- Le test de connexion.
- La correspondance des groupes.
- L'association du compte administrateur.

Les secrets OIDC doivent rester côté serveur.

Prévoir une procédure locale de récupération d'accès si le fournisseur OIDC est indisponible.

---

# 7. UTILISATEURS ET PERMISSIONS

FabCore est multiutilisateur dès le POC.

Rôles initiaux :

## Administrateur

- Configuration système.
- Gestion des utilisateurs.
- Gestion des machines.
- Gestion des connecteurs.
- Notifications.
- Paramètres.
- Pilotage selon les sécurités matérielles.

## Opérateur

- Surveillance.
- Pilotage des machines autorisées.
- Transfert de fichiers.
- Lancement de travaux autorisés.
- Consultation des caméras autorisées.

## Observateur

- Consultation.
- Caméras autorisées.
- Historique autorisé.
- Aucun pilotage.

Prévoir des permissions plus fines :

- Par machine.
- Par groupe de machines.
- Par type de commande.
- Par utilisateur.
- Par groupe OIDC.

Toutes les autorisations doivent être vérifiées côté serveur.

Ne jamais se fier uniquement à l'affichage ou au masquage des boutons.

Journaliser les opérations sensibles.

---

# 8. MACHINES ET CONNECTEURS

## 8.1 Priorité P0 — FDM

Prévoir dès le début les familles :

### Bambu Lab
- P2S.
- A1.
- P1.
- X1.
- Autres modèles compatibles.

Étudier MQTT local, transfert de fichiers et accès caméra.

Gérer les particularités LAN Only et Developer Mode.

### Elegoo
- Centauri Carbon.
- Centauri Carbon 2.
- Autres modèles FDM compatibles.

Gérer explicitement plusieurs Centauri Carbon 2 simultanément.

### Creality
- K1.
- K1C.
- K1 Max.
- K2.
- K2 Plus.
- Ender compatibles.
- Autres modèles documentés.

Tenir compte des différences de firmware.

### Klipper
- Moonraker.
- Mainsail.
- Fluidd.
- Machines personnalisées.

### Prusa
- PrusaLink.
- Interfaces locales compatibles.

### OctoPrint
- API REST.
- Événements.
- Fichiers.
- Caméras.
- Commandes.

### Autres constructeurs P0
- Anycubic.
- QIDI Tech.
- Sovol.
- Flashforge.

Pour ces marques, créer une matrice de compatibilité par modèle et firmware.

**P0 signifie priorité d'étude et d'intégration, pas compatibilité universelle garantie.**

## 8.2 Priorité P1 — Résine

Prévoir :

- Elegoo.
- Anycubic.
- Autres fabricants.

Étudier SDCP et les protocoles réellement disponibles.

Fonctions selon compatibilité :

- État.
- Progression.
- Caméra.
- Températures.
- Fichiers.
- Commandes.

## 8.3 Priorité P1 — Lasers

Prévoir :

- Longer.
- xTool.
- Ortur.
- Sculpfun.
- Atomstack.
- GRBL.
- Ruida.

Le connecteur xTool devra être étudié modèle par modèle.

Ne jamais contourner les sécurités constructeur.

## 8.4 Priorité P1 — CNC

Prévoir :

- GRBL.
- FluidNC.
- LinuxCNC.
- Contrôleurs réseau.
- Agent série/USB facultatif.

Aucun lancement forcé à distance d'un laser ou d'une CNC.

Les sécurités physiques, confirmations locales et arrêts d'urgence restent prioritaires.

## 8.5 Contrat des connecteurs

Définir un système d'adaptateurs commun.

Capacités conceptuelles :

- discover()
- connect()
- disconnect()
- getCapabilities()
- getStatus()
- subscribeEvents()
- getTelemetry()
- getCameraStreams()
- listFiles()
- uploadFile()
- startJob()
- pauseJob()
- resumeJob()
- cancelJob()
- executeSupportedAction()

Les signatures exactes seront définies après l'UX/UI.

Chaque connecteur doit déclarer :

- Constructeur.
- Modèles compatibles.
- Versions firmware validées.
- Protocole.
- Authentification.
- Capacités.
- Limitations.
- Niveau de maturité.
- Tests de validation.

États possibles :

- Expérimental.
- Partiellement compatible.
- Validé.
- Non compatible.

Les connecteurs doivent gérer les erreurs, interruptions et reconnexions indépendamment les uns des autres.

Aucune commande ne doit être envoyée si les capacités, les droits et les conditions nécessaires ne sont pas confirmés.

---

# 9. DÉCOUVERTE RÉSEAU

FabCore doit détecter les machines sur le réseau local.

Méthodes prioritaires :

- mDNS.
- DNS-SD.
- SSDP.
- Découverte native des fabricants.
- API locales documentées.

Un scan actif limité peut être proposé.

Conditions :

- Action explicite de l'administrateur.
- Sous-réseaux privés autorisés.
- Ports ciblés.
- Débit limité.
- Durée limitée.
- Possibilité d'annuler.
- Journalisation.
- Pas de scan arbitraire d'Internet.

Chaque machine détectée doit fournir si possible :

- Fabricant.
- Modèle.
- Adresse.
- Numéro de série.
- Firmware.
- Protocole.
- Connecteur compatible.
- Capacités.
- État d'authentification.

Prévoir une méthode d'identification stable pour plusieurs machines identiques.

Ne pas confondre découverte et compatibilité.

Prévoir l'ajout manuel par IP, nom DNS ou URL.

Documenter les limites de découverte à travers les VLAN.

---

# 10. SUPERVISION ET PILOTAGE

## Supervision

Afficher :

- Disponibilité.
- État.
- Progression.
- Durée écoulée.
- Temps restant.
- Températures.
- Erreurs.
- Travail en cours.
- Caméras.
- Connectivité.

Les données doivent être actualisées en temps réel lorsque le protocole le permet.

## Pilotage

Selon les capacités réelles :

- Lancement.
- Pause.
- Reprise.
- Annulation.
- Réglage de températures.
- Ventilateurs.
- Déplacement d'axes.
- Gestion des fichiers.
- Téléversement.
- Commandes propres au constructeur.

Prévoir un mécanisme de confirmation pour les commandes sensibles.

Aucune action ne doit être envoyée à une autre machine à cause d'une confusion d'identifiant.

## Caméras

Prévoir :

- MJPEG.
- RTSP.
- WebRTC.
- Flux constructeur compatibles.
- Proxy sécurisé si nécessaire.

Fonctions :

- Vue individuelle.
- Vue globale.
- Plein écran.
- Reconnexion.
- Gestion des erreurs.
- Permissions utilisateur.

Ne pas exposer les secrets ou URL sensibles au navigateur.

Éviter le transcodage vidéo lorsqu'il n'est pas nécessaire.

---

# 11. NOTIFICATIONS ET NTFY

FabCore doit proposer un centre de notifications.

Événements :

- Fabrication terminée.
- Fabrication en erreur.
- Machine déconnectée.
- Machine reconnectée.
- Température anormale.
- Intervention requise.
- Événement administratif.
- Alerte système.

Préférences par utilisateur et machine.

## Web Push

Implémenter :

- PWA.
- Service worker.
- VAPID.
- Notifications navigateur.
- Notifications mobile.
- Gestion des abonnements.
- Suppression des abonnements invalides.
- Test de notification.

Prévoir HTTPS en production.

Documenter les limitations des navigateurs et plateformes.

## ntfy

ntfy doit être une fonctionnalité intégrée, mais optionnelle.

Trois choix :

1. Désactivé.
2. Installer ntfy avec FabCore.
3. Utiliser une instance ntfy existante.

Assistant graphique comprenant :

- Activation.
- Installation.
- Configuration.
- Topics privés.
- Jetons.
- Permissions.
- Test d'envoi.
- Surveillance de l'état.
- Désactivation.
- Réconfiguration.

L'administrateur doit pouvoir mettre en place ntfy en quelques clics.

Prévoir un service compagnon ou un mécanisme d'installation adapté au déploiement.

Aucune commande shell arbitraire ne doit être exécutée depuis le navigateur.

L'installateur système doit utiliser des opérations prédéfinies et strictement autorisées.

Ne pas installer une deuxième instance lorsque l'utilisateur veut connecter une instance existante.

Documenter les dépendances potentielles aux services push tiers sur iOS.

---

# 12. SMTP

La configuration SMTP est facultative.

Champs :

- Hôte.
- Port.
- TLS/STARTTLS.
- Identifiant.
- Secret.
- Adresse expéditeur.
- Nom expéditeur.

Fonctions :

- Test de connexion.
- Test d'envoi.
- Gestion des erreurs.
- Modification ultérieure.
- Stockage sécurisé.

Utilisations :

- Invitations utilisateurs.
- Alertes.
- Notifications.
- Informations de sécurité.
- Récupération lorsque applicable.

Tous les modèles d'e-mails doivent être disponibles en français et en anglais.

---

# 13. ARCHITECTURE TECHNIQUE

L'architecture définitive sera arrêtée après validation UX/UI.

Orientation recommandée :

- TypeScript strict.
- React.
- Next.js si pertinent.
- Backend Node.js modulaire.
- PostgreSQL.
- API REST documentée via OpenAPI.
- WebSocket ou SSE pour le temps réel.
- PWA.
- Connecteurs indépendants.
- Docker Compose.
- Déploiement LXC.

Privilégier un **monolithe modulaire** pour POC et MVP.

Éviter :

- Microservices inutiles.
- Kubernetes.
- Plusieurs brokers sans justification.
- Multiplication des bases de données.
- Abstractions spéculatives.
- Dépendances peu maintenues.

N'ajouter Redis, une file de messages ou un système externe que lorsqu'un besoin mesurable le justifie.

Séparer clairement :

- Présentation.
- Authentification.
- Utilisateurs et permissions.
- Machine registry.
- Connecteurs.
- Commandes.
- Télémétrie.
- Événements.
- Notifications.
- Fichiers.
- Administration.

Prévoir l'isolation des connecteurs et des délais de communication.

---

# 14. DÉPLOIEMENT

Cible principale :

**LXC Debian dédié sur Proxmox VE.**

Cible secondaire :

Linux avec Docker Compose.

Ressources indicatives :

- 2 vCPU.
- 4 Go de RAM.
- 32 Go de stockage applicatif.
- Volume additionnel pour les fichiers.

Prévoir :

- Installation reproductible.
- Initialisation sécurisée.
- CLI d'administration.
- Intégration reverse proxy.
- Compatibilité Zoraxy.
- Configuration HTTPS.
- Sauvegarde.
- Restauration.
- Migrations.
- Diagnostics.
- Logs.
- Healthchecks.
- Mise à jour.
- Procédure de rollback documentée.

Ne pas modifier l'hôte Proxmox.

Ne pas exposer directement les ports des machines sur Internet.

Les secrets doivent être protégés et exclus du dépôt Git.

---

# 15. SÉCURITÉ

Exigences fondamentales :

- Authentification solide.
- Sessions sécurisées.
- Contrôle d'accès côté serveur.
- Principe du moindre privilège.
- Protection CSRF.
- Validation des entrées.
- Protection SSRF.
- Sécurisation des WebSockets.
- Protection des flux vidéo.
- Limitation des tentatives de connexion.
- Sécurisation de la découverte réseau.
- Protection des secrets.
- Journalisation d'audit.
- Gestion des dépendances.
- Mises à jour de sécurité.
- Tests de non-régression.

Ne jamais exposer les mots de passe machines, secrets SMTP ou secrets OIDC au frontend.

Ne jamais exécuter une commande arbitraire reçue d'un utilisateur sans validation stricte.

Les fonctions CNC/laser ne doivent jamais contourner les protections physiques.

---

# 16. OPEN SOURCE

FabCore doit pouvoir être publié publiquement.

Prévoir :

- README.md.
- LICENSE.
- CONTRIBUTING.md.
- CODE_OF_CONDUCT.md.
- SECURITY.md.
- CHANGELOG.md.
- Documentation utilisateur.
- Documentation développeur.
- Documentation des connecteurs.
- Guide d'installation.
- Roadmap.
- Templates d'issues.
- Templates de pull requests.
- Tests automatisés.

Étudier MIT, Apache-2.0 et AGPL-3.0.

Proposer une licence argumentée après vérification des dépendances et de leurs licences.

Ne publier aucune donnée personnelle, clé d'accès ou configuration privée.

La documentation principale doit être disponible en français et en anglais.

---

# 17. MÉTHODE DE DÉVELOPPEMENT IA — OPTIMISATION DES TOKENS

Cette section est prioritaire pour toutes les sessions de développement.

Elle reprend les principes documentés par OpenAI pour Codex et Anthropic pour Claude Code.

## 17.1 Un seul agent principal

Utiliser un seul agent principal pour le développement normal.

**Interdiction de lancer automatiquement une équipe multi-agent.**

Ne pas déléguer les tâches simples.

Ne pas créer un agent pour une opération réalisable par une recherche ciblée ou une modification locale.

Des spécialistes facultatifs pourront être utilisés uniquement sur autorisation explicite :

- Audit sécurité.
- Analyse de protocole fabricant.
- Audit UX.
- Revue architecturale complexe.

Ils devront recevoir :
- Un objectif précis.
- Un périmètre limité.
- Les seuls fichiers nécessaires.
- Un format de réponse court.
- Un budget de contexte.

Ne pas leur transmettre tout le dépôt.

Ne pas les autoriser à créer d'autres agents.

## 17.2 Instructions persistantes réduites

Utiliser un fichier `AGENTS.md` court comme référence principale pour Codex et les outils compatibles.

Si Claude Code utilise aussi ce fichier directement, éviter une duplication complète dans `CLAUDE.md`.

Si nécessaire, `CLAUDE.md` doit contenir uniquement les directives propres à Claude Code et un lien/import vers les règles communes.

Vérifier le mécanisme de chargement réellement supporté par la version de l'outil.

Cible indicative :

- `AGENTS.md` : 50 à 120 lignes utiles.
- Pas de limite artificielle si une règle critique exige davantage.
- Aucune répétition.
- Aucune documentation détaillée recopiée dans les instructions permanentes.

Ne pas placer le prompt maître intégral dans `AGENTS.md`.

Il sert de référence de conception, pas de contexte à relire à chaque action.

## 17.3 Organisation documentaire

Créer une structure légère :

- `AGENTS.md` : règles communes.
- `CLAUDE.md` : complément éventuel.
- `TASKS.md` : backlog et tâche active.
- `docs/PRODUCT.md` : vision produit.
- `docs/BRAND.md` : identité visuelle.
- `docs/UX.md` : principes UX et parcours.
- `docs/ARCHITECTURE.md` : architecture.
- `docs/DECISIONS.md` : décisions techniques.
- `docs/COMPATIBILITY.md` : matrice de compatibilité.
- `docs/ROADMAP.md` : étapes du produit.
- `docs/CONTEXT.md` : résumé compact d'état.

Ne créer les documents spécialisés qu'au moment où ils deviennent nécessaires.

Ne pas dupliquer les mêmes informations dans plusieurs fichiers.

Utiliser des liens et des références internes.

## 17.4 Chargement de contexte ciblé

À chaque tâche :

1. Identifier le périmètre.
2. Lire les instructions nécessaires.
3. Chercher les fichiers concernés.
4. Lire uniquement les interfaces et dépendances utiles.
5. Modifier localement.
6. Tester.
7. Actualiser les informations pertinentes.

Ne pas lire tous les documents au démarrage de chaque session.

Ne pas afficher tout le dépôt.

Ne pas relire plusieurs fois un fichier inchangé sans nécessité.

Privilégier les recherches ciblées :

- `rg`.
- Listage par répertoire.
- Recherche de symboles.
- Diff Git.
- Tests du module concerné.

## 17.5 Tâches atomiques

Chaque tâche doit comporter :

- Identifiant.
- Objectif.
- Périmètre.
- Critères d'acceptation.
- Tests nécessaires.
- Statut.
- Dépendances éventuelles.

Une seule tâche active à la fois.

Une tâche doit produire un résultat vérifiable.

Préférer une modification cohérente et complète à de multiples micro-modifications répétées.

## 17.6 Gestion des sessions

Ne pas maintenir inutilement une conversation de développement gigantesque.

Utiliser les fonctionnalités de compaction ou de reprise documentées de l'environnement lorsque cela apporte un bénéfice.

Avant de changer de session, conserver :

- L'objectif courant.
- Les décisions confirmées.
- Les fichiers concernés.
- Les tests.
- Les blocages.
- La prochaine action.

Un résumé de reprise doit être court.

Ne pas conserver des logs entiers dans les fichiers de contexte.

Ne jamais résumer comme terminé un travail non vérifié.

## 17.7 Utilisation des Skills

Créer des compétences réutilisables seulement lorsqu'un workflow spécialisé revient réellement plusieurs fois.

Exemples possibles :

- Création d'un connecteur machine.
- Vérification de compatibilité firmware.
- Audit de sécurité OIDC.
- Vérification des traductions.
- Revue UX mobile.

Un Skill doit avoir :

- Une description indiquant quand l'utiliser.
- Des instructions courtes.
- Des références chargées uniquement si nécessaires.
- Des scripts déterministes quand c'est pertinent.

Ne pas créer une bibliothèque de Skills inutilisés dès le premier jour.

## 17.8 Scripts déterministes

Pour les tâches répétitives, préférer des scripts plutôt que de nouvelles requêtes IA :

- Validation i18n.
- Formatage.
- Lint.
- Tests unitaires.
- Vérification des types.
- Validation des schémas.
- Contrôle des imports.
- Vérification des licences.
- Tests de compatibilité simulés.

Ne pas demander à un modèle de relire manuellement ce qu'un outil déterministe peut vérifier.

## 17.9 Gestion des erreurs

En cas d'échec :

1. Lire le message précis.
2. Identifier le fichier ou composant concerné.
3. Émettre une hypothèse.
4. Vérifier cette hypothèse.
5. Corriger localement.
6. Relancer le test ciblé.

Éviter les boucles répétitives sans progrès.

Après plusieurs tentatives infructueuses sur la même cause, arrêter les modifications spéculatives et présenter le blocage.

Ne pas masquer les erreurs derrière des valeurs de réussite fictives.

## 17.10 Tests

Pendant le développement :

- Tests ciblés.
- Typecheck.
- Lint approprié.
- Tests d'intégration du module.

Aux jalons :

- Tests globaux.
- Vérifications de sécurité.
- Tests de permissions.
- Tests i18n.
- Tests responsive.
- Tests de non-régression.

Les commandes longues ou coûteuses ne doivent pas être lancées sans raison.

## 17.11 Modèles et niveaux de raisonnement

Choisir le niveau de modèle et d'effort adapté à la tâche, si l'environnement permet ce choix.

Tâches simples :
- Recherche ciblée.
- Traduction.
- Petite correction.
- Documentation locale.

Tâches complexes :
- Architecture.
- Sécurité.
- Protocole fabricant.
- Débogage difficile.

Ne pas utiliser systématiquement le modèle ou le niveau de raisonnement le plus coûteux.

Ne pas changer automatiquement de modèle si cela perturbe la continuité ou ajoute des coûts de contexte.

Le choix doit rester compatible avec les capacités réellement disponibles dans l'environnement utilisé.

## 17.12 Budget et suivi

Lorsque les métriques sont disponibles, suivre :

- Tokens d'entrée.
- Tokens de sortie.
- Tokens de cache.
- Coût estimé.
- Nombre d'appels outils.
- Tests exécutés.
- Temps de développement.

Ne pas inventer de métriques lorsque l'outil ne les fournit pas.

Identifier les tâches qui consomment beaucoup de contexte.

Réduire les lectures, outils ou instructions superflus avant d'augmenter le niveau du modèle.

## 17.13 Compte rendu

À la fin d'une tâche, produire un résumé concis :

- Réalisé.
- Fichiers concernés.
- Tests et résultats.
- Limites.
- Prochaine tâche.

Ne pas recopier les fichiers de code complets dans la réponse.

Ne pas répéter l'ensemble du cahier des charges.

---

# 18. GESTION DU PROJET ET QUALITÉ

Développer par jalons validés.

Respecter les conventions existantes.

Choisir des noms clairs.

Privilégier les types stricts.

Éviter `any` et les conversions de types non justifiées.

Préférer le code simple à une abstraction prématurée.

Ne pas ajouter de dépendances sans évaluer :

- Maintenance.
- Taille.
- Sécurité.
- Licence.
- Bénéfice réel.

Les modifications doivent être cohérentes avec l'ensemble des interfaces concernées.

Ne pas inventer de fonctionnalités terminées.

Documenter les limites techniques importantes.

Ne pas promettre de compatibilité sans validation.

---

# 19. FEUILLE DE ROUTE OFFICIELLE

## PHASE DESIGN — UX/UI

### Jalon UX-0 : Benchmark et parcours

Livrables :

- Synthèse des interfaces existantes.
- Personas.
- Parcours utilisateurs.
- Architecture de navigation.
- Wireframes.

### Jalon UX-1 : Identité visuelle

Livrables :

- Deux directions artistiques.
- Trois concepts de logo.
- Palette définitive proposée.
- Typographie.
- Design system.
- Variantes clair et sombre.
- Icônes FabCore.
- Assets de marque préliminaires.

### Jalon UX-2 : Prototype interactif

Livrables :

- Assistant initial complet.
- Dashboard.
- Gestion des machines.
- Pilotage fictif.
- Caméras fictives.
- Gestion utilisateurs.
- Configuration OIDC.
- ntfy.
- SMTP.
- Découverte réseau fictive.
- Centre de notifications.
- Version française.
- Version anglaise.
- Desktop.
- Mobile.

**Validation humaine obligatoire avant le POC.**

---

## PHASE POC — PREUVE DE CONCEPT

Objectif : vérifier les risques techniques.

Implémenter :

- Socle minimal.
- Bootstrap sécurisé.
- Administrateur local.
- OIDC Pocket ID.
- Gestion des utilisateurs.
- Gestion des machines.
- Adaptateur Klipper réel.
- Adaptateur Elegoo CC2 réel.
- Adaptateur Bambu P2S réel.
- Simulateurs pour les autres marques P0.
- Télémétrie temps réel.
- Premières caméras.
- Commandes élémentaires.
- Notifications de test.
- Tests automatisés.

Critères de validation :

- Une Bambu P2S connectée.
- Deux Elegoo CC2 distinctes.
- Une machine Klipper.
- Aucune confusion entre les machines.
- Permissions vérifiées.
- Commandes fiables.
- Erreurs détectables.
- Authentification fonctionnelle.
- Documentation des limites.

Les critères dépendant d'équipements réels doivent être validés sur ces équipements avant d'être considérés comme satisfaits.

**Validation technique avant MVP.**

---

## PHASE MVP — PRODUIT UTILISABLE

Objectif : permettre une utilisation quotidienne.

Fonctionnalités :

- Assistant initial complet.
- Identité visuelle définitive.
- Français et anglais.
- Authentification locale/OIDC.
- Rôles et permissions.
- Découverte réseau.
- Connexions multimarques.
- Connecteurs P0 validés modèle par modèle.
- Pilotage selon capacités.
- Caméras.
- Gestion des fichiers.
- Web Push.
- ntfy intégré facultatif.
- SMTP.
- PWA.
- Historique.
- Administration.
- Sauvegarde/restauration.
- Documentation.
- Déploiement reproductible.
- Tests de sécurité.
- Tests de non-régression.

Le MVP doit être suffisamment fiable pour une utilisation réelle.

Ne pas repousser la sécurité et les autorisations à une version future.

---

## PHASE FULLDEV — PLATEFORME COMPLÈTE

Objectif : développer l'écosystème FabCore.

Fonctionnalités prévues :

- Impression résine étendue.
- Lasers.
- CNC.
- SDK de connecteurs.
- Plugins communautaires.
- Multi-ateliers.
- Files d'attente.
- Gestion des consommables.
- Gestion des filaments.
- Gestion des résines.
- Gestion des commandes.
- Calcul des coûts.
- Statistiques.
- Maintenance préventive.
- Inventaire.
- Automatisations.
- Webhooks.
- API publique.
- Intégrations Home Assistant.
- Assistance IA optionnelle.
- Diagnostics avancés.

Le FullDev doit réutiliser le socle MVP sans nécessiter une réécriture globale.

---

# 20. PREMIÈRE EXÉCUTION — ORDRE IMMÉDIAT

**Ta première mission est EXCLUSIVEMENT la conception UX/UI et l'identité visuelle de FabCore.**

Commence maintenant.

## Étape A — Compréhension

Analyse les besoins du produit.

Identifie les parcours prioritaires.

Ne crée pas de backend.

## Étape B — Benchmark

Étudie les références UX nécessaires.

Produis une synthèse concise.

Ne répète pas les recherches qui n'apportent pas de décision.

## Étape C — Branding

Crée :

1. Deux directions visuelles noir/gris/vert.
2. Trois concepts de logo originaux.
3. Les déclinaisons utiles.
4. Une proposition de design system.
5. Les palettes dark et light.

Recommande une direction et explique brièvement pourquoi.

Si les outils le permettent, livre les logos comme véritables ressources vectorielles visualisables.

## Étape D — Architecture UX

Définis :

- Navigation.
- Dashboard.
- Pages machines.
- Paramètres.
- Gestion utilisateurs.
- Assistant initial.
- Notifications.
- Adaptation mobile.

## Étape E — Wireframes

Produis les écrans essentiels.

Priorise :

1. Première installation.
2. Dashboard.
3. Vue machine.
4. Gestion des utilisateurs.
5. Gestion des notifications.

## Étape F — Prototype haute fidélité

Crée une maquette interactive :

- Données fictives.
- Français et anglais.
- Desktop et mobile.
- Dark mode par défaut.
- Light mode disponible.
- Parcours utilisateur fonctionnels.

Les écrans doivent montrer des équipements fictifs de plusieurs marques.

## Étape G — Présentation

Livre :

- Synthèse du benchmark.
- Identité visuelle.
- Concepts de logo.
- Design system.
- Architecture UX.
- Maquettes.
- Prototype navigable.
- Captures desktop/mobile si l'environnement le permet.
- Points à valider.

Si une capacité de génération graphique ou de prototypage manque, signale-la clairement et livre l'alternative réellement réalisable.

## INTERDICTIONS POUR CETTE PREMIÈRE MISSION

- Aucun backend réel.
- Aucune base de données de production.
- Aucun connecteur matériel.
- Aucune installation Proxmox.
- Aucun déploiement réel.
- Aucune connexion à mes machines.
- Aucun changement des services existants.
- Aucun lancement multi-agent automatique.
- Aucun développement prématuré du MVP.

Le code nécessaire au prototype interactif est autorisé.

**ARRÊTE-TOI APRÈS LA LIVRAISON DU PROTOTYPE UX/UI ET ATTENDS MA VALIDATION EXPLICITE.**

---

# 21. RÉSULTAT RECHERCHÉ

FabCore doit devenir une plateforme que l'on peut installer, configurer et utiliser sans difficulté particulière.

Un nouvel utilisateur doit pouvoir :

1. Installer FabCore.
2. Accéder à l'assistant.
3. Récupérer son jeton dans le terminal.
4. Créer son administrateur.
5. Configurer Pocket ID ou un autre OIDC si souhaité.
6. Activer ntfy si souhaité.
7. Configurer SMTP si souhaité.
8. Découvrir ses machines.
9. Ajouter et nommer ses équipements.
10. Consulter leurs caméras et états.
11. Piloter ses machines autorisées.
12. Recevoir les notifications sur smartphone.
13. Gérer d'autres utilisateurs.
14. Ajouter de nouveaux connecteurs.

L'expérience utilisateur doit faire oublier la complexité des protocoles et des fabricants.

Le projet doit être assez simple pour un maker et assez solide pour évoluer vers une plateforme professionnelle.

**FabCore — Un atelier. Toutes vos machines.**

**Commence par l'identité visuelle, les logos, le design system et la maquette UX/UI. Pas par le backend.**
