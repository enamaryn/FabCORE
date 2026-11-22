# Travailler sur FabCore

**Phase active : MVP — cadrage et migration.** POC clôturé. [Bilan](docs/POC-BILAN.md) · [Plan de migration](docs/MIGRATION-MVP.md) · [Périmètre MVP](docs/MVP.md).

## Reprendre une tâche

1. Vérifier dépôt, branche, état local et référence distante : `git status --short --branch`. Vérifier sur GitHub si la copie est ancienne. Préserver tout travail local ; utiliser une branche/worktree dédié pour un nouveau jalon.
2. Consulter [CODEMAP](docs/ai/CODEMAP.md), ou `node scripts/ai-context.mjs --list` puis `<sujet>`. Lire le symbole, son test et le seul document du jalon utile. Élargir aux dépendances identifiées ; ne pas relire tout le journal POC ou le prompt d'origine.
3. Si une session travaille déjà sur le sujet, reprendre sa branche ou coordonner le périmètre avant d'écrire. Un seul propriétaire par fichier ; worktrees séparés pour travaux parallèles.

## Références à la demande

- Connecteur : [contrat](poc/CONNECTORS.md), puis guide fabricant dans `docs/protocols/`.
- Interface : [règles produit](docs/PRODUCT.md).
- Exploitation : [guide](poc/README.md).
- Organisation IA/délégation : [routine](docs/ai/WORKFLOW.md) ; [relais court](docs/ai/HANDOFF.md).
- Étapes futures : [développement complet](docs/FULL-DEVELOPPEMENT.md).
- Intention d'origine : `MASTER_PROMPT_ORIGIN.md`, seulement pour cadrage.

## Modifier et vérifier

- Livrer le plus petit diff couvrant la demande. Réutiliser interfaces et conventions ; préserver contrats, installations, données et acquis de recette. Migration progressive, sans réécriture des connecteurs.
- Aucun formatage global, renommage en série ou changement de dépendances sans besoin du jalon. Ne modifier le verrouillage que si nécessaire. Ne jamais effacer ou réécrire le travail d'une autre session.
- Avant PR : relire `git diff --stat` et `git diff`, exécuter `git diff --check` et les contrôles adaptés. Pour du code produit : `npm test`. Pour la navigation : `node scripts/ai-context.mjs --check`. Indiquer tests physiques/navigateur restant à faire.
- Si un point d'entrée change : mettre à jour `docs/ai/topics.json`, puis `node scripts/ai-context.mjs --write-map` et `--check`. La carte et les empreintes aident à naviguer ; vérifier les relations réelles dans le code.
- Sorties d'outils : bilan et erreurs utiles ; conserver les détails dans un fichier temporaire sans masquer les codes d'échec. Aucun secret dans les journaux, docs ou PR.

## Agents et livraison

Travail simple : un seul agent. Déléguer une tâche indépendante volumineuse à un spécialiste avec objectif, références, critères et périmètre courts ; deux spécialistes simultanés maximum au départ, sans sous-délégation ni débats répétés sur les décisions acquises. Profils locaux : `.codex/agents/`. Ne pas supposer leur chargement automatique dans ChatGPT Work ; y transmettre les instructions pertinentes explicitement.

Chaque jalon a sa PR et son état de reprise : branche/commit, résultat, vérifications, limites et première action suivante. Distinguer ouvert, fusionné, déployé et testé matériel. Ouvrir la PR pour revue ; fusion et déploiement sur demande. Aucune commande machine implicite dans une tâche de développement. Les profils de lecture seule ne modifient ni fichiers ni matériel ; leurs restrictions textuelles ne remplacent pas les permissions du client.
