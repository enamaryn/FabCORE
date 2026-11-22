# ADR 0003 · Frontières des couches

**État :** Accepté (2026-11-22) · **Étape :** MIG-01.1.3

## Contexte

`poc/server.mjs` mélange routes, droits, orchestration et accès aux connecteurs ; `poc/live.js` porte présentation et logique. Le plan demande une seule implémentation autoritaire par responsabilité.

## Décision

Arborescence cible (créée au fil des migrations, pas en bloc) :

```
src/domain/         types et règles purs : Machine, Connexion, Capacités, Télémétrie, Commande/Résultat, Événement, Erreur
src/application/    cas d'usage : droits, corrélation et confirmation des commandes, orchestration, ports
src/persistence/    Kysely, migrations, dépôts : implémente les ports de persistance
src/http/           Fastify : routes, SSE, authentification OIDC/locale : adaptateurs fins
src/config/         chargement et validation de la configuration (ADR 0007)
packages/connector-sdk/   contrat public des connecteurs (ADR 0006)
connectors/<id>/    connecteurs fabricant : implémentent le contrat du SDK
web/                interface React
poc/                code POC encore actif, retiré au fil des migrations
```

Règles :

1. Dépendances dans un seul sens : `http`, `persistence`, `config` → `application` → `domain`. Le domaine n'importe rien d'autre que lui-même.
2. Les connecteurs n'importent que `packages/connector-sdk`. Le SDK ne dépend pas du cœur.
3. Une responsabilité a une seule implémentation active. Une fois migrée, l'ancienne version `poc/` est supprimée ou réduite à une réexportation ; jamais deux chemins parallèles.
4. Tout résultat de commande distingue **accepté** (accusé du transport), **confirmé** (observé par la supervision) et **inconnu**. Aucune couche ne promeut un état sans preuve, et aucun rejeu automatique n'est introduit.
5. Les contrôles d'autorisation se font dans `application`, pas dans les routes ni dans l'interface.
6. Le serveur n'expose pas de texte affiché : codes et paramètres ([ADR 0005](0005-i18n.md)).

Les règles 1 et 2 sont vérifiées par `no-restricted-imports` dès MIG-01.2.

## Conséquences

- Les tests du domaine et de l'application n'ont besoin ni de réseau, ni de base, ni de matériel.
- `docs/ai/topics.json` et la carte du code sont mis à jour à chaque déplacement de point d'entrée.

## Alternatives écartées

- Découpage par fichiers techniques (`routes/`, `services/`) sans règle de dépendance : ne protège pas le domaine.
- Paquets séparés pour chaque couche : coût de publication et de versionnage sans bénéfice avant le SDK.
