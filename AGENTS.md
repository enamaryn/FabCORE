# Travailler sur FabCore

Ce fichier s’adresse à toute personne ou IA qui intervient sur le dépôt. **Phase active : [POC](docs/POC.md).**

## Reprendre une session

1. Vérifier le chemin du dépôt, la branche et l’état du répertoire avec `git status --short --branch`. Consulter `origin/main` et la PR ou le ticket lié à la demande pour savoir ce qui a déjà été fusionné et ce qui est en cours. Vérifier l’état sur GitHub si la copie locale est ancienne.
2. Lire le document de la phase et les fichiers directement concernés. Utiliser `rg` pour cibler les lectures. Si une autre personne ou IA poursuit déjà le même travail, reprendre la branche prévue si elle est disponible, ou signaler le chevauchement avant de modifier les mêmes fichiers.
3. Partir de `origin/main` sur une branche dédiée pour un nouveau jalon. Si le répertoire contient du travail en cours, utiliser un worktree séparé. Préserver les modifications locales, même si leur auteur est inconnu.

| Phase | Document |
| --- | --- |
| POC · phase active | [État actuel, recette et prochain jalon](docs/POC.md) |
| MVP · planifié | [Périmètre et agent local FabCore Cloud](docs/MVP.md) |
| Développement complet | [Évolutions après le MVP](docs/FULL-DEVELOPPEMENT.md) |

Pour l’exploitation, consulter le [guide du POC](poc/README.md). Pour ajouter ou modifier un connecteur, lire le [contrat des connecteurs](poc/CONNECTORS.md).

## Modifier le code

- Livrer le plus petit diff qui couvre la demande. Suivre les conventions du fichier et réutiliser les fonctions et interfaces du projet. Préserver les API, les installations existantes et les données déjà enregistrées, sauf changement demandé.
- Ne pas lancer de formatage global, de renommage en série, de réorganisation du dépôt, de réécriture de module ou de montée de version des dépendances sans demande explicite. Limiter le formatage aux lignes modifiées. Modifier le fichier de verrouillage uniquement si les dépendances du jalon le nécessitent.
- Ne pas écraser le travail d’une autre session. Éviter les commandes qui effacent des changements locaux ou réécrivent l’historique partagé. Ouvrir la PR pour revue. La fusion et le déploiement sur un serveur se font sur demande.
- Avant de publier, relire `git diff --stat` et `git diff` (ou le diff de la branche contre `origin/main`). Exécuter `git diff --check` et `npm test` pour une modification du code. Indiquer les vérifications matérielles ou navigateur qui restent à faire.

## Passer le relais

Chaque jalon a sa propre PR. Mettre à jour le fichier de phase avec l’état et la prochaine action. Dans la PR, consigner en quelques lignes :

- Le résultat et le ticket, la branche ou le commit à reprendre.
- Les décisions utiles à la reprise, avec les fichiers et points d’entrée touchés.
- Les tests réellement exécutés et leur résultat.
- Ce qui reste à faire, avec la première action concrète.

Distinguer **ouvert**, **fusionné**, **déployé** et **testé sur matériel**. Garder les détails dans la PR liée et le suivi utilisateur dans le fichier de phase. Ne jamais y copier de clés API, codes LAN ou secrets de déploiement.
