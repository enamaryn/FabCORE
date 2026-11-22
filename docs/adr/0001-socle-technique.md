# ADR 0001 · Socle technique acquis

**État :** Proposé · **Étape :** MIG-01.1.1 · **Sources :** [bilan POC](../POC-BILAN.md#conserver-migrer-différer), [MVP-00](../MVP.md)

## Contexte

Le POC v0 est un serveur JavaScript `node:http`, une interface sans framework (`poc/live.js`), un état JSON (`poc/store.mjs`) et un rafraîchissement par interrogation périodique. Le bilan a déjà tranché les grandes orientations ; cet ADR les écrit comme règles.

## Décision

| Sujet | Règle |
| --- | --- |
| Langage | TypeScript `strict`, avec `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` et `erasableSyntaxOnly` (aucun `enum`, `namespace` ni propriété de paramètre). Migration module par module : `.mjs` et `.ts` cohabitent. |
| Exécution | Node.js **24 LTS** en production. La CI exécute la suite sur **24 et 26**. `engines.node` passera à `>=24 <27` en MIG-01.2. Passage de la production à 26 par décision explicite, pas par mise à jour implicite. |
| Architecture | Monolithe modulaire : un processus serveur, des modules aux frontières explicites ([ADR 0003](0003-frontieres.md)). Pas de microservices. Les services compagnons (agent local MVP-10) restent des processus distincts. |
| Interface | React, migrée écran par écran avec parité UX et fonctionnelle (MIG-06). |
| Persistance | PostgreSQL **16 minimum**, un seul chemin de code en auto-hébergement et en cloud, avec import versionné du `state.json` (MIG-04). |
| Temps réel | SSE authentifié ([ADR 0004](0004-sse.md)). Pas de WebSocket navigateur ; WebSocket reste possible côté connecteur lorsque le protocole fabricant l'impose. |

## Conséquences

- Les connecteurs et leurs tests sont typés sans changer les protocoles (MIG-02).
- Le POC reste exécutable tant qu'une responsabilité n'est pas entièrement migrée.
- L'environnement de développement doit fournir Node ≥ 24 ; un Node 22 ne suffit pas.

## Alternatives écartées

- Réécriture complète : perte de la recette matérielle et des particularités firmware.
- Rester en JavaScript avec JSDoc : typage trop faible pour des contrats partagés avec la communauté.
- SQLite en auto-hébergement : deux dialectes, contraire à MVP-00.3.
