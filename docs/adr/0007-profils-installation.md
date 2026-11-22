# ADR 0007 · Profils d'installation et configuration

**État :** Proposé · **Étape :** MIG-01.1.3 · Mise en œuvre MVP-02.3, MVP-03 et MIG-08.

## Contexte

Un atelier sans administrateur doit installer FabCore d'un bloc ; un utilisateur disposant déjà d'une infrastructure, ainsi que FabCore Cloud, doit pouvoir brancher ses propres services. Node.js est le moteur de FabCore lui-même : il est fourni ou installé, il ne se « connecte » pas comme un service externe.

## Décision

Trois profils, un seul code :

| Profil | Contenu | Cible |
| --- | --- | --- |
| Tout-en-un (défaut) | LXC Debian (cible principale) ou Docker Compose : Node 24 fourni, PostgreSQL 16 géré localement, sauvegardes et mises à jour | Atelier sans administrateur |
| Services externes | FabCore seul, connecté à des services fournis | Infrastructure existante, FabCore Cloud |
| Manuel | Depuis les sources, Node ≥ 24 de l'utilisateur | Contributeurs, cas particuliers |

Services configurables comme externes : PostgreSQL ≥ 16 (URL, TLS, certificat d'autorité), proxy inverse/TLS, OIDC, SMTP, ntfy ; stockage objet des fichiers ultérieurement. Les services compagnons (agent local MVP-10) sont des processus distincts reliés par une connexion authentifiée.

Configuration :

- Schéma TypeBox unique dans `src/config/`. Sources par priorité : variables d'environnement, puis fichier de configuration. Valeurs invalides : refus de démarrer avec un message explicite.
- Secrets dans le fichier de configuration (mode `0600`) ou l'environnement ; jamais en base ni dans les journaux.

Première installation :

1. Sans configuration valide, FabCore démarre en **mode configuration** : seul l'assistant est servi, protégé par le jeton d'installation (MVP-03.1, `fabcore setup-token rotate`).
2. L'étape Activation propose *Tout-en-un* ou *Services externes*. Pour chaque service externe : formulaire et bouton de test (joignabilité, TLS, version PostgreSQL ≥ 16, droits de création de schéma).
3. Écriture de la configuration, migrations, redémarrage en mode normal, verrouillage du bootstrap.
4. Le même résultat est atteignable sans navigateur (environnement ou CLI) pour Docker et les déploiements automatisés.

## Conséquences

- La persistance ne suppose jamais une base locale : pool, TLS et délais configurables, vérification de version au démarrage.
- Le mode configuration n'ouvre ni connexion machine ni découverte réseau.
- Sauvegarde et restauration sont prises en charge par FabCore en tout-en-un ; en services externes, FabCore documente ce qui doit être sauvegardé.
- Le passage tout-en-un → base externe se fait par export/import documenté, pas par bascule à chaud.

## Alternatives écartées

- Configuration uniquement par fichier édité à la main : inaccessible aux ateliers visés.
- Configuration des services stockée en base : impossible de configurer la base elle-même, secrets exposés aux sauvegardes.
- Image unique contenant toujours PostgreSQL : inutile et coûteuse pour les services externes et le cloud.
