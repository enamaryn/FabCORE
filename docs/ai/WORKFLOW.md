# Organisation IA et budget de contexte

État : configuration proposée avant MIG-01, sans modification du produit. Le pilote humain garde les décisions de périmètre, fusion et déploiement. Lire ce fichier seulement pour organiser une tâche ou une délégation ; la [carte du code](CODEMAP.md) suffit pour naviguer.

## Routine minimale

1. Lire AGENTS et le jalon actif, vérifier branche/commit/diff. Ne pas relire le journal POC ni le prompt d'origine sans besoin précis.
2. Choisir un sujet avec `node scripts/ai-context.mjs --list`, puis charger ses références. Lire le symbole et le test pertinents ; élargir seulement pour une dépendance identifiée. `rg` reste le repli sans serveur de langage.
3. Implémenter un petit changement, vérifier le diff et les tests appropriés. Garder les sorties complètes dans un fichier temporaire et ne remonter que bilan, erreurs et chemins. Ne jamais masquer un échec avec un pipeline dont seul le dernier programme réussit.
4. Avant PR, vérifier carte et périmètre ; ajouter/actualiser un sujet si un point d'entrée change. Une vérification lexicale ne prouve pas la justesse du graphe : revue humaine/IA du parcours touché nécessaire.
5. Au relais, renseigner le [modèle court](HANDOFF.md). La conversation ne doit pas être l'unique mémoire du projet.

## Déléguer seulement si utile

Un pilote et zéro spécialiste pour une correction simple. Au maximum deux spécialistes simultanés au départ ; le pilote assemble. Les tâches dépendantes restent séquentielles. Ni débat entre agents ni délégation récursive par défaut. Réutiliser un spécialiste pour les suivis qui concernent la même tâche ; terminer sa mission une fois son livrable reçu.

Profils versionnés dans `.codex/agents/` : `navigator` (exploration sans écriture), `connector-specialist`, `backend-specialist`, `frontend-specialist`, `quality-reviewer` (revue sans écriture). Le pilote reste l'agent principal, sans sous-agent « chef » supplémentaire.

Une délégation contient : objectif, jalon, commit/branche, périmètre et fichiers autorisés, critères de réussite, références ciblées, budget indicatif et format de retour. Ne pas transmettre tout l'historique ; repartir d'un contexte minimal lorsque le client le permet. Les décisions déjà acceptées restent acquises, sauf incompatibilité concrète à remonter au pilote.

Les profils ne garantissent pas une expertise : protocoles documentés, contrat, tests et preuves priment. Un seul agent écrit dans un fichier donné. Pour travaux parallèles, worktrees séparés ou domaines sans chevauchement et attribution explicite des fichiers ; pas de git reset/clean sur les travaux d'un autre agent.

Retour cible : 300 à 500 mots maximum, résultat, chemins/symboles, vérifications, limites et blocages. Si insuffisant, fournir les détails dans un fichier ou la PR et seulement le lien dans le retour. Les limites sont des objectifs souples, pas un prétexte pour cacher un problème.

## Budgets de départ à mesurer

- AGENTS racine : viser moins de 1 000 tokens ; carte environ 1 500–2 500 tokens. Ne charger que les lignes utiles si le sujet est connu.
- Brief de spécialiste : viser moins de 1 500 tokens, références comprises ; ne pas copier les sources intégrales.
- Modèle et effort hérités du client, sans modèle imposé dans le dépôt. Choisir un modèle moins coûteux seulement si disponible et pertinent ; réserver l'effort élevé aux tâches complexes.
- Aucun quota de tokens promis. Les compteurs du client/API, lorsqu'accessibles, sont nécessaires pour mesurer le total incluant spécialistes, raisonnement et cache. Les caractères affichés ne sont qu'un proxy du contexte récupéré.

## Clients et configuration

Les fichiers TOML `.codex/agents/` ciblent les clients Codex locaux récents ; leur découverte doit être vérifiée dans le client employé. Les outils de délégation de ChatGPT Work peuvent utiliser les mêmes instructions à la demande, sans supposer que les profils locaux y sont automatiquement chargés. Ce dépôt ne modifie pas les réglages globaux, le modèle ou les permissions du compte.

Serena est un outil de développement facultatif, pas une dépendance de FabCore ni un service à installer dans le LXC de production. Voir [SERENA.md](SERENA.md) pour le test et la configuration. Si le client n'expose pas ce MCP, utiliser la carte et `rg` ; ne pas déclarer l'outil actif dans le chat.

## Mesurer avant généralisation

Comparer sur le même commit les recherches CC2, upload Moonraker, permissions et cockpit : mêmes questions, même niveau de détail, qualité vérifiée contre les sources/tests. Comparer lecture ciblée avec carte, puis Serena. Inclure installation et première indexation séparément des consultations à chaud ; distinguer lecture d'un symbole et refactorisation multi-fichiers.

Relever durée, nombre d'appels, volume retourné, succès/omissions et tokens totaux si disponibles. Une référence sans son test ou un contexte incomplet ne constitue pas une économie utile. Ne pas comparer uniquement Serena à la lecture brute de tout le dépôt : le vrai concurrent est carte + recherches ciblées.

## Sources consultées le 22 novembre 2026

- [OpenAI — sous-agents](https://learn.chatgpt.com/docs/agent-configuration/subagents) : contextes séparés, surcoût et profils locaux.
- [OpenAI — AGENTS](https://learn.chatgpt.com/docs/agent-configuration/agents-md) : instructions de dépôt.
- [Anthropic — gestion des coûts](https://code.claude.com/docs/en/costs) et [ingénierie du contexte](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) : lectures à la demande, navigation symbolique et sorties filtrées.
- [Aider — repo map](https://aider.chat/docs/repomap.html) : carte compacte avec budget.
- [Serena](https://github.com/oraios/serena) : recherche symbolique LSP.
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus) : graphe ; pas installé, licence non commerciale à examiner avant usage professionnel.
- [jCodeMunch](https://github.com/jgravelle/jcodemunch-mcp) : alternative, conditions commerciales à examiner ; gains annoncés non extrapolés au projet.
- [Context7](https://github.com/upstash/context7) : documentation de bibliothèques, pas carte du dépôt ; non installé.
