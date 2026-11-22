# Pilote Serena — résultat et activation facultative

## État vérifié le 22 novembre 2026

Test sur une copie Git archivée du commit FabCore `c45734120418ef5e52409324b53746016a6f241f`, sans données d'installation, sans ordre matériel et sans modification du code produit.

- Python/uv disponibles ; installation isolée réussie de Serena au commit **`7f7d6245bf96b60fdf4e752a779917372fd1ee6e`** (version annoncée `2.1.1.dev0`).
- CLI et handshake MCP réussis ; liste des outils reçue.
- Appel `get_symbols_overview` sur `poc/elegoo-files.mjs` : **échec d'initialisation LSP**, installation automatique de `typescript@5.9.3` par npm en erreur. Aucun résultat symbolique exploitable, aucun benchmark de gain Serena obtenu.
- Pendant l'activation en échec, la liste annoncée contenait aussi des outils d'édition malgré le profil de projet en lecture seule. Ne pas considérer la restriction validée tant que le projet ne s'active pas correctement et que la liste effective n'est pas vérifiée.
- Le premier démarrage a tenté une télémétrie d'environnement (OS/version/backend/contexte) vers `oraios-software.de` ; échec DNS observé. Le code source prévoit `SERENA_USAGE_REPORTING=false` : configuré dans l'exemple MCP. Aucune donnée de machine ni aucun secret n'a été fourni au test.

**Décision :** intégration facultative et désactivée par défaut dans `.codex/config.toml`. La carte locale et `rg` sont la voie active. Ne pas installer Serena dans le LXC de production et ne pas annoncer le MCP comme disponible dans ChatGPT Work sans vérification réelle.

## Configuration préparée

`.serena/project.yml` demande le backend TypeScript (également pour JS/MJS), la lecture seule et seulement quatre outils de navigation. `.codex/config.toml` fixe un commit de Serena, désactive le dashboard et sa télémétrie. Les caches/mémoires et journaux locaux sont exclus de Git ; les secrets et données `.fabcore/` sont exclus de l'index.

Serena peut enrichir/réécrire son propre fichier projet avec des valeurs par défaut : relire le diff avant de commiter. `read_only` ne signifie pas absence d'écriture de caches, configuration ou logs. Ne pas versionner ces artefacts ni utiliser les mémoires locales comme unique suivi du projet.

## Procédure de reprise du pilote

1. Dans un environnement de développement avec accès aux registres nécessaires, créer une copie du dépôt sans données réelles. Vérifier Python >=3.11, uv, Node/npm et la compatibilité du commit Serena épinglé.
2. Lancer `uvx --from git+https://github.com/oraios/serena@7f7d6245bf96b60fdf4e752a779917372fd1ee6e serena --help`, puis vérifier les dépendances du serveur TypeScript. Ne modifier ni les dépendances FabCore ni le LXC pour cette opération.
3. Dans le client Codex local, activer temporairement `enabled = true` pour ce MCP uniquement, avec `SERENA_USAGE_REPORTING=false`. Redémarrer/recharger selon le client et accepter uniquement un projet de confiance. Ne pas modifier le profil global.
4. Vérifier que le bon projet est actif et que les seuls outils d'analyse attendus sont exposés. Si les outils d'édition sont encore exposés, garder le pilote isolé et ne pas le considérer validé.
5. Tester overview, recherche de `createElegooFiles`, références appelantes, puis les quatre tâches du [protocole](WORKFLOW.md#mesurer-avant-généralisation). Comparer au code/tests réellement présents.
6. Publier le résultat avec commit, versions, temps d'indexation et métriques. N'activer par défaut que si les gains et restrictions sont démontrés. Sinon garder le repli sans MCP.

Les agents TOML locaux et les MCP ne sont pas automatiquement installés dans tous les environnements ChatGPT. Les adaptateurs préparés ne modifient pas les outils déjà exposés à une conversation existante.

## Références épinglées

- [Projet et licence](https://github.com/oraios/serena/tree/7f7d6245bf96b60fdf4e752a779917372fd1ee6e).
- [CLI](https://github.com/oraios/serena/blob/7f7d6245bf96b60fdf4e752a779917372fd1ee6e/src/serena/cli.py).
- [Configuration projet](https://github.com/oraios/serena/blob/7f7d6245bf96b60fdf4e752a779917372fd1ee6e/src/serena/resources/project.template.yml).
- [Contexte Codex](https://github.com/oraios/serena/blob/7f7d6245bf96b60fdf4e752a779917372fd1ee6e/src/serena/resources/config/contexts/codex.yml).
- [Télémétrie et variable d'arrêt](https://github.com/oraios/serena/blob/7f7d6245bf96b60fdf4e752a779917372fd1ee6e/src/serena/agent.py).
