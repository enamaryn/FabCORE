# Phase 3 · Développement complet — écosystème FabCore

**État : à cadrer après le [MVP](MVP.md#mvp-13--bêta-et-recette-de-sortie).**
Objectif ([prompt d’origine](../MASTER_PROMPT_ORIGIN.md#phase-fulldev--plateforme-complète)) : étendre FabCore en réutilisant le socle du MVP, sans réécriture globale.

Même convention que le [POC](POC.md#lire-ce-plan) : étapes `FD-xx`, sous-étapes `FD-xx.y`. Les étapes sont indépendantes. Leur ordre sera fixé au bilan du MVP selon les retours de la bêta et le matériel disponible.

## Vue d’ensemble

| Étape | Contenu | État |
| --- | --- | --- |
| FD-00 | Cadrage et priorisation | À faire |
| FD-01 | SDK de connecteurs et plugins | À faire |
| FD-02 | Impression résine | À faire |
| FD-03 | Lasers | À faire |
| FD-04 | CNC | À faire |
| FD-05 | Production et multi-ateliers | À faire |
| FD-06 | Consommables et inventaire | À faire |
| FD-07 | Maintenance, statistiques et diagnostics | À faire |
| FD-08 | Intégrations et API publique | À faire |
| FD-09 | Visualisation avancée | À faire |
| FD-10 | Assistance IA optionnelle | À faire |

## FD-00 · Cadrage et priorisation

- [ ] FD-00.1 Bilan de la bêta MVP et retours utilisateurs.
- [ ] FD-00.2 Ordre des étapes FD-01 à FD-10.
- [ ] FD-00.3 Besoins d’architecture : processus séparés ou conteneurs pour les connecteurs, seulement si un besoin mesuré le justifie.

## FD-01 · SDK de connecteurs et plugins

- [ ] FD-01.1 SDK documenté à partir du contrat stabilisé en [MVP-04.2](MVP.md#mvp-04--connecteurs-p0-validés-modèle-par-modèle).
- [ ] FD-01.2 Simulateur générique ouvert aux contributeurs, à partir des simulateurs du [MVP-04.11](MVP.md#mvp-04--connecteurs-p0-validés-modèle-par-modèle).
- [ ] FD-01.3 Plugins communautaires chargés à la demande, avec déclaration des capacités et de la maturité.
- [ ] FD-01.4 Processus de revue et de publication des connecteurs contribués.

## FD-02 · Impression résine

- [ ] FD-02.1 Étude SDCP et des protocoles réellement disponibles.
- [ ] FD-02.2 Elegoo résine : état, progression, caméra, températures, fichiers, commandes selon compatibilité.
- [ ] FD-02.3 Anycubic résine.
- [ ] FD-02.4 Autres fabricants.

## FD-03 · Lasers

Aucun lancement forcé à distance. Les sécurités constructeur, les confirmations locales et les arrêts d’urgence restent prioritaires.

- [ ] FD-03.1 xTool : modèles supplémentaires, étudiés un par un, en plus de la M2 supervisée au POC.
- [ ] FD-03.2 GRBL.
- [ ] FD-03.3 Longer : pilotage au-delà de la supervision livrée en MVP-04.10. Ortur, Sculpfun, Atomstack.
- [ ] FD-03.4 Ruida.

## FD-04 · CNC

Mêmes règles de sécurité que les lasers.

- [ ] FD-04.1 GRBL et FluidNC.
- [ ] FD-04.2 LinuxCNC.
- [ ] FD-04.3 Contrôleurs réseau.
- [ ] FD-04.4 Agent série/USB facultatif.

## FD-05 · Production et multi-ateliers

- [ ] FD-05.1 Multi-ateliers dans une même instance.
- [ ] FD-05.2 Files d’attente de fabrication.
- [ ] FD-05.3 Gestion des commandes clients.
- [ ] FD-05.4 Calcul des coûts.

## FD-06 · Consommables et inventaire

- [ ] FD-06.1 Gestion des filaments, reliée aux emplacements AMS et CANVAS.
- [ ] FD-06.2 Gestion des résines.
- [ ] FD-06.3 Inventaire et seuils de réapprovisionnement.

## FD-07 · Maintenance, statistiques et diagnostics

- [ ] FD-07.1 Maintenance préventive par compteurs d’heures ou de fabrications.
- [ ] FD-07.2 Statistiques d’utilisation et de réussite.
- [ ] FD-07.3 Diagnostics avancés par connecteur.

## FD-08 · Intégrations et API publique

- [ ] FD-08.1 API publique versionnée et jetons d’accès.
- [ ] FD-08.2 Webhooks.
- [ ] FD-08.3 Automatisations (règles déclenchées par les événements).
- [ ] FD-08.4 Intégration Home Assistant.

## FD-09 · Visualisation avancée

- [ ] FD-09.1 Aperçu 3D du G-code.
- [ ] FD-09.2 Formats `.bgcode` et conteneurs `.3mf`.

## FD-10 · Assistance IA optionnelle

- [ ] FD-10.1 Cas d’usage à définir (diagnostic d’erreur, détection d’échec caméra), désactivés par défaut, sans envoi de données sans accord explicite.
