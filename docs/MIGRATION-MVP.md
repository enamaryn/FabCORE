# Migration du POC vers le socle MVP

**État : plan formalisé, implémentation non commencée.** Référence : [bilan POC v0](POC-BILAN.md). Ce plan détaille MVP-00/01/02/03/12/13 ; il ne remplace pas le périmètre produit du [MVP](MVP.md).

## Règles de passage

Une étape correspond à une petite PR révisable. Elle avance de « À faire » vers « En cours », « En revue », « Fusionné », puis « Déployé/Testé » lorsque cela a réellement eu lieu. Une phase n'est terminée que lorsque ses critères sont démontrés. Une fusion ne vaut pas recette matérielle. Les travaux dépendants attendent leur prérequis ; aucune date arbitraire n'est imposée.

Les connecteurs et leurs comportements sont conservés, les tests existants restent verts. Pas de nouveau protocole pendant la migration hors correction de régression. Aucun ordre machine, rejeu après reconnexion ou lancement d'impression au démarrage. Les essais matériels restent explicites et supervisés. Une machine conserve un seul transport configuré, LAN ou cloud, sans bascule implicite.

| Phase | Objet | Dépendance | État initial |
| --- | --- | --- | --- |
| MIG-00 | Référence et recette de non-régression | Clôture POC | Bilan rédigé ; publication à valider |
| MIG-01 | Architecture, contrats et outillage | MIG-00 | MIG-01.1 en revue ([ADR](adr/README.md)) |
| MIG-02 | Domaine et connecteurs TypeScript | MIG-01 | À faire |
| MIG-03 | Services backend et API | MIG-02 | À faire |
| MIG-04 | PostgreSQL et reprise des données | MIG-03 | À faire |
| MIG-05 | Événements et SSE | MIG-03/04 | À faire |
| MIG-06 | Interface React par parcours | MIG-05 | À faire |
| MIG-07 | Documentation et extensibilité | MIG-02 à 06 | À faire |
| MIG-08 | Installation, recette et bascule | MIG-04 à 07 | À faire |

## MIG-00 · Figer les acquis

### MIG-00.1 · Référence de livraison

- MIG-00.1.1 Consigner le commit accepté, les notes et les limites : [POC v0](releases/POC-v0.md).
- MIG-00.1.2 Enregistrer le brouillon GitHub ; publication et tag définitif après validation du propriétaire.
- MIG-00.1.3 Sauvegarder l'installation et les données avant toute future migration ; ne pas joindre de données personnelles à la release.

### MIG-00.2 · Contrat de recette

- MIG-00.2.1 Conserver les tests existants et constituer des fixtures anonymisées à partir des retours utiles.
- MIG-00.2.2 Relever modèles, versions et modes des machines de recette lors du prochain essai.
- MIG-00.2.3 Séparer acquis CC2/P2S, essais reportés et anomalies connues dans une matrice de parité.

**Sortie :** référence immuable identifiée, limites acceptées et recette reproductible. **Retour arrière :** code POC et données originales préservés.

## MIG-01 · Décisions et fondations

### MIG-01.1 · Décisions d'architecture

Acceptés : [ADR 0001 à 0007](adr/README.md) — TypeBox, Fastify, Kysely, Vite, Node 24 (CI 24 + 26), PostgreSQL ≥ 16, i18n, connecteurs autonomes, profils d'installation.

- MIG-01.1.1 Formaliser les décisions acquises : TypeScript strict, Node.js LTS, monolithe modulaire, React, PostgreSQL et SSE.
- MIG-01.1.2 Choisir et motiver le framework HTTP éventuel, le build frontend, l'accès SQL/ORM et les outils de validation ; ne pas imposer ces choix silencieusement.
- MIG-01.1.3 Définir les frontières domaine, application, transports, persistance et présentation ; une seule implémentation autoritaire par responsabilité.

### MIG-01.2 · Outillage et contrats

- MIG-01.2.1 Ajouter compilation incrémentale JS/TS, typage strict des modules migrés, lint limité et scripts de développement.
- MIG-01.2.2 Définir Machine, Connexion, Capacités, Télémétrie, Commande/Résultat, Événement et Erreur ; distinguer accepté, confirmé et inconnu.
- MIG-01.2.3 Installer la CI tests/typecheck/lint/licences sans mise à jour globale des dépendances.

**Sortie :** décisions écrites, contrats revus, build et tests verts. **Retour arrière :** entrée POC encore exécutable ; changements d'outillage réversibles.

## MIG-02 · Typer les connecteurs sans changer les protocoles

### MIG-02.1 · Domaine et adaptation

- MIG-02.1.1 Extraire types, validations et contrats de cycle de vie : ouvrir, lire, commander, fermer.
- MIG-02.1.2 Adapter le registre existant ; conserver identifiants, capacités, temporisations et corrélations.
- MIG-02.1.3 Garder inconnue toute donnée non remontée ; ne pas inventer état, couleur, consigne ou succès.

### MIG-02.2 · Migration fabricant par fabricant

- MIG-02.2.1 Migrer d'abord CC2 et P2S LAN dans deux étapes séparées, avec les tests des fichiers internes et refus d'autorisation.
- MIG-02.2.2 Migrer Moonraker, OctoPrint/PrusaLink, puis les autres connecteurs et le pilote cloud sans élargir leurs capacités.
- MIG-02.2.3 Vérifier fermeture des sessions, isolation des machines, déconnexion et reconnexion sans état périmé ni rejeu.

**Sortie :** parité des tests et des contrats, tableau fabricant actualisé ; essais physiques ciblés sur les comportements touchés. **Retour arrière :** revenir au connecteur précédent par version déployée, sans deux connexions concurrentes.

## MIG-03 · Découper le backend et documenter l'API

### MIG-03.1 · Services et routes

- MIG-03.1.1 Extraire authentification/utilisateurs, parc/connexions, télémétrie, commandes, fichiers/caméras, notifications et administration.
- MIG-03.1.2 Conserver les contrats HTTP existants pendant le remplacement progressif ; documenter REST en OpenAPI.
- MIG-03.1.3 Centraliser contrôles d'autorisation, validation, erreurs, délais et annulation des requêtes.

### MIG-03.2 · Commandes et diagnostic

- MIG-03.2.1 Maintenir confirmations, restrictions pendant fabrication, verrouillage par machine et absence de rejeu.
- MIG-03.2.2 Ajouter des identifiants de corrélation, niveaux de logs, masquage des secrets et rétention bornée ; journal par machine et compte.
- MIG-03.2.3 Tester observateur/admin, fichiers, flux, origine des requêtes, refus réseau et résultats inconnus.

**Sortie :** parité API et tests négatifs ; aucun faux succès ni secret dans les journaux. **Retour arrière :** application précédente compatible avec les données avant MIG-04.

## MIG-04 · PostgreSQL et migration des installations

### MIG-04.1 · Modèle et migrations

- MIG-04.1.1 Définir schéma versionné : utilisateurs, organisation/site/ferme, machines, connexions, comptes cloud, bobines manuelles et préférences.
- MIG-04.1.2 Préserver identifiants et liens ; poser contraintes d'unicité machine/connexion et droits d'accès.
- MIG-04.1.3 Isoler état courant, historique borné et métadonnées fichiers ; ne pas déplacer arbitrairement les gros fichiers dans SQL.

### MIG-04.2 · Import et sauvegarde

- MIG-04.2.1 Écrire un import `state.json` en simulation, puis transactionnel et idempotent, avec rapport d'anomalies sans secrets.
- MIG-04.2.2 Préserver mots de passe hachés, références de fichiers et secrets chiffrés avec leurs clés ; tester que les accès restent utilisables.
- MIG-04.2.3 Comparer comptes, machines et relations avant/après ; sauvegarder JSON, fichiers, clés et base ; répéter restauration sur copie.

**Sortie :** import reproductible sans perte et restauration prouvée ; même chemin PostgreSQL auto-hébergement/cloud. **Retour arrière :** arrêter les écritures, sauvegarder les changements intervenus, restaurer version et sauvegarde pré-migration. Aucun retour aveugle au JSON qui perdrait des changements.

## MIG-05 · Temps réel SSE

### MIG-05.1 · Événements

- MIG-05.1.1 Publier les changements d'état depuis les services, avec identifiants, horodatage et portée utilisateur/site/machine.
- MIG-05.1.2 Borne mémoire, fréquence et taille des messages ; isoler les abonnés lents.
- MIG-05.1.3 Définir reconnexion, reprise limitée et resynchronisation complète si l'historique a expiré.

### MIG-05.2 · Remplacement du polling

- MIG-05.2.1 Ajouter flux authentifié, heartbeat, nettoyage à la fermeture et tests de révocation des droits.
- MIG-05.2.2 Remplacer les interrogations navigateur périodiques ; conserver les lectures initiales et actualisations explicites utiles.
- MIG-05.2.3 Mesurer connexions, charge et fraîcheur sur un parc simulé ; ne pas ouvrir de caméra en arrière-plan.

**Sortie :** reconnexions sans fuite, parité des états et charge mesurée. **Retour arrière :** réactiver temporairement le rafraîchissement existant, sans doubler les abonnements machine.

## MIG-06 · React sans régression des parcours

### MIG-06.1 · Interface commune

- MIG-06.1.1 Reprendre identité, tokens, thèmes et catalogues FR/EN ; composants accessibles, formulaires et dialogues communs.
- MIG-06.1.2 Migrer navigation, vue d'ensemble et parc dense responsive ; toutes les machines visibles, pastilles compactes et multi-modules conservés.
- MIG-06.1.3 Migrer fiche avec six blocs stables, indisponibilités explicites, saisie préservée et contrôles selon droits/capacités.

### MIG-06.2 · Parcours complets

- MIG-06.2.1 Migrer fichiers : recherche/tri/pages, lecture, téléchargement, envoi, transfert simple/multiple et confirmations séparées de lancement.
- MIG-06.2.2 Migrer visualiseur et caméra ; libérer animations, ressources et abonnements à chaque navigation.
- MIG-06.2.3 Migrer comptes cloud/logs, diagnostics, notifications, accès et installation ; tests parcours, mobile, clavier et clair/sombre.

**Sortie :** matrice de parité complète et recette CC2/P2S sans régression ; aucune fonction pilote promue implicitement. **Retour arrière :** conserver une version antérieure complète et compatible avec le schéma, pas deux interfaces actives concurrentes sur les commandes.

## MIG-07 · Évolution et contribution

### MIG-07.1 · Contrats publiés

- MIG-07.1.1 Documenter types/versionnement, capacités, erreurs, sécurité et cycle de vie des connecteurs.
- MIG-07.1.2 Fournir un exemple de connecteur simulé et une suite de conformité ; documenter ajout d'un fabricant et recette par modèle.
- MIG-07.1.3 Mettre à jour OpenAPI, guides locaux, commandes et sources, procédures de contribution et matrice de compatibilité.

### MIG-07.2 · Limites de l'extensibilité

- MIG-07.2.1 Stabiliser les points d'extension internes ; ne pas charger de plugins tiers arbitraires.
- MIG-07.2.2 Reporter le SDK complet, l'isolation de plugins et le catalogue au développement complet.
- MIG-07.2.3 Garder production Kanban/planification dans #94 jusqu'à stabilisation du socle.

**Sortie :** un contributeur peut lancer les tests et ajouter un connecteur simulé sans lire tout le serveur. **Retour arrière :** contrats versionnés ; aucune installation de plugin utilisateur à convertir.

## MIG-08 · Bascule contrôlée

### MIG-08.1 · Packaging et exploitation

- MIG-08.1.1 Produire build reproductible, installation LXC, configuration minimale et contrôle de santé sans action machine.
- MIG-08.1.2 Ajouter sauvegarde préalable, migrations explicites, contrôle de version du schéma et procédure de restauration.
- MIG-08.1.3 Vérifier journaux bornés, rotation, secrets, expiration des sessions et limites réseau/fichiers.

### MIG-08.2 · Recette et livraison

- MIG-08.2.1 Répéter l'import sur copie puis les tests automatiques et les scénarios admin/observateur, pertes réseau et reconnexions.
- MIG-08.2.2 Effectuer une recette supervisée CC2/P2S : connexion, caméra, températures, fichiers, lancement, Pause/Stop et reprise uniquement si prise en charge.
- MIG-08.2.3 Mesurer un parc simulé, documenter les limites, répéter le rollback et préparer une release candidate.
- MIG-08.2.4 Faire valider la candidate avant fusion/déploiement demandé ; publier le bilan de parité et les réserves restantes.

**Sortie :** socle migré accepté et installation récupérable. La fin de cette migration n'équivaut pas à la livraison de toutes les fonctions commerciales du MVP.

## Préalable IA avant MIG-01

Organisation, carte et profils proposés dans [docs/ai/WORKFLOW.md](ai/WORKFLOW.md). Le [pilote Serena](ai/SERENA.md) reste facultatif et évalué séparément ; ni serveur de production ni dépendance runtime ajoutés. Valider ce préalable avant les changements techniques du MVP.

## Première action après validation du plan

Ouvrir une PR MIG-01.1 de décisions et contrats, puis MIG-01.2 pour l'outillage minimal. Ne pas commencer par réécrire les connecteurs, déplacer tout le dépôt ou changer les dépendances en bloc.
