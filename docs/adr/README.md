# Décisions d'architecture (ADR)

Une décision par fichier, numérotée, jamais réécrite après acceptation : une révision crée un nouvel ADR qui remplace l'ancien (« Remplacé par »). États : Proposé → Accepté → Remplacé.

| ADR | Sujet | État | Étape |
| --- | --- | --- | --- |
| [0001](0001-socle-technique.md) | Socle technique acquis | Proposé | MIG-01.1.1 |
| [0002](0002-outillage.md) | Outillage : exécution TS, HTTP, validation, SQL, frontend, lint | Proposé | MIG-01.1.2 |
| [0003](0003-frontieres.md) | Frontières des couches et implémentation unique | Proposé | MIG-01.1.3 |
| [0004](0004-sse.md) | Convention des événements SSE | Proposé | MIG-01.1.1 |
| [0005](0005-i18n.md) | Internationalisation multilingue | Proposé | MIG-01.1.3 |
| [0006](0006-connecteurs-autonomes.md) | Connecteurs autonomes et fiches modèle | Proposé | MIG-01.1.3 |
| [0007](0007-profils-installation.md) | Profils d'installation et configuration | Proposé | MIG-01.1.3 |

Ces ADR décident ; ils n'implémentent rien. La mise en œuvre suit le [plan de migration](../MIGRATION-MVP.md) (MIG-01.2 et suivantes) et le [périmètre MVP](../MVP.md).

Format : Contexte · Décision · Conséquences · Alternatives écartées.
