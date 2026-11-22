# Vérification du dispositif IA

Base : `c45734120418ef5e52409324b53746016a6f241f`, 22 novembre 2026. Mesure locale de la **navigation**, pas évaluation de résolution de bugs ni comparaison de consommation totale des modèles.

Une mission d'exploration indépendante, en lecture seule et avec brief réduit, a confirmé les quatre parcours : `createElegooFiles`/RPC 1044, route HTTP d'envoi → `createMoonrakerFiles`, contrôles admin dans `createFabCore`, cockpit `liveDetail`/`filesPanel`. Pas de modification par cet agent, aucun ordre machine. Cette mission ne prouve pas le chargement automatique des profils TOML dans ChatGPT Work.

| Recherche | Octets des sources listées en entier | Octets du retour de navigation | Temps local de la commande |
| --- | --- | --- | --- |
| cc2-files | 32301 | 738 | 139 ms |
| upload | 74634 | 905 | 109 ms |
| permissions | 56229 | 758 | 105 ms |
| cockpit | 249456 | 729 | 117 ms |

La commande ne retourne pas les corps de fonctions : il faut ensuite charger les extraits utiles et les tests. Ces volumes illustrent l'orientation initiale ; les transformer en « pourcentage de tokens économisés » serait trompeur. La comparaison réaliste reste carte + lecture ciblée contre Serena + lecture ciblée, pas contre le chargement systématique de tous les fichiers.

Tokens modèle, raisonnement et cache de la mission non accessibles dans ce protocole : aucune économie globale chiffrée annoncée. Durées propres à cette machine et non benchmark généralisable.

Serena : installation et handshake réussis, recherche symbolique bloquée à l'initialisation TypeScript ; [résultat détaillé](SERENA.md). Pas de déploiement serveur ni d'activation MCP par défaut. Prochaine mesure : reprendre ce pilote avec dépendances LSP disponibles et vérifier le filtrage des outils avant comparaison.

## Contrôles de livraison

- `node --check scripts/ai-context.mjs`, `--check` et les onze recherches par sujet réussis.
- Sujet inconnu, chemin absent, symbole supprimé et carte non régénérée : échec détecté lors d’essais sur copie temporaire.
- Cinq profils TOML et configuration MCP validés avec `python3 scripts/check-ai-config.py` ; liens locaux de cette documentation vérifiés.
- Suite FabCore : **139 tests réussis**. `git diff --check` sans erreur. Aucun ordre matériel.
- Revue indépendante en lecture seule : couverture des déclencheurs CI corrigée ; le contrôle léger tourne désormais sur chaque PR et push main. L’exécution GitHub Actions reste à constater après ouverture de la PR.
