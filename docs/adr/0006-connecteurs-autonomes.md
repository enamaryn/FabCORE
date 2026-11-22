# ADR 0006 · Connecteurs autonomes et fiches modèle

**État :** Proposé · **Étape :** MIG-01.1.3 · Contrat : [CONNECTORS.md](../../poc/CONNECTORS.md). Typage MIG-02, SDK documenté FD-01.

## Contexte

Le registre actuel (`poc/connectors.mjs`) centralise les définitions et capacités dans le cœur. Pour que la communauté ajoute rapidement des marques et modèles, un connecteur doit être autonome, testable sans matériel et sans modifier le cœur. La plupart des machines partagent quelques protocoles (Moonraker, OctoPrint, PrusaLink, Bambu, Elegoo…).

## Décision

Deux niveaux d'extension :

| Ajout | Forme | Code requis |
| --- | --- | --- |
| Nouveau modèle sur un protocole existant | Fiche modèle JSON | Non |
| Nouveau protocole ou API constructeur | Connecteur | Oui |

Structure d'un connecteur :

```
connectors/<id>/
  manifest.json      id, version, marques, transports (LAN/cloud), maturité, capacités maximales, schéma de configuration
  models/*.json      fiches modèle : marque, modèle, firmware testés, capacités effectives, volume, particularités
  locales/fr.json    textes propres (ADR 0005)
  locales/en.json
  src/               implémentation du contrat
  test/  fixtures/   tests de conformité et données anonymisées
```

Règles :

- Le connecteur n'importe que `packages/connector-sdk` (types, ports, erreurs, schémas TypeBox, harnais de test). Vérifié par lint.
- Le manifeste et les fiches sont validés par schéma TypeBox au démarrage ; une fiche invalide est rejetée sans bloquer les autres connecteurs.
- Une fiche modèle ne peut que restreindre ou préciser les capacités déclarées par son connecteur, jamais en ajouter.
- Cycle de vie commun : ouvrir, lire, commander, fermer. Une machine a un seul transport configuré ; aucune bascule implicite LAN/cloud.
- Suite de conformité fournie par le SDK, exécutée sans matériel : fermeture des sessions, isolation entre machines, absence de rejeu, distinction accepté/confirmé/inconnu, refus d'autorisation, données inconnues non inventées.
- Maturité affichée à l'utilisateur : `expérimental`, `communautaire`, `validé` (recette matérielle documentée avec modèle et firmware). Seule une recette supervisée fait passer à `validé`.
- Distribution au MVP : connecteurs dans le dépôt, enregistrés statiquement et relus par PR. Ils pilotent chauffe et mouvements ; aucun code tiers non relu n'est chargé.
- Plus tard (FD-01.3) : paquets externes chargés à la demande, isolés (worker ou processus) avec permissions déclarées ; décision dans un ADR dédié.
- Dépôt en workspaces npm : `packages/connector-sdk` et `connectors/*` dès leur création en MIG-02.

## Conséquences

- MIG-02 déplace chaque connecteur existant vers cette structure sans changer son protocole ; le registre lit les manifestes au lieu de définitions codées dans le cœur.
- Un guide de contribution (MIG-07) décrit : écrire une fiche, écrire un connecteur, fournir des fixtures, demander une recette.
- Le contrat du SDK est versionné ; un changement cassant exige une version majeure et la mise à jour de tous les connecteurs du dépôt.

## Alternatives écartées

- Chargement dynamique de plugins tiers dès le MVP : risque de sécurité physique et contrat encore instable.
- Un connecteur par modèle : duplication massive des protocoles partagés.
- Capacités déclarées uniquement dans le cœur : chaque ajout exigerait de modifier FabCore.
