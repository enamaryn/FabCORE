# Bilan technique — POC v0

Date de clôture : **22 novembre 2026**, à la demande de Valentin après recette matérielle. La publication de la release reste soumise à sa validation ; préparer un brouillon ne signifie pas publier.

## Référence et preuves

Base de code acceptée : `6f52f76138973b7dd80ba47de1c243eef81c0d66` (`main`, [PR #96](https://github.com/enamaryn/FabCORE/pull/96)). Nom de release : **POC v0** ; tag prévu : `poc-v0`. Les modifications de ce bilan sont documentaires et ne migrent pas l'installation.

Les confirmations utilisateur dans la conversation font foi pour le matériel. La suite automatisée comporte 139 tests réussis lors du correctif #96 ; elle ne remplace pas la recette physique. Les versions précises des firmwares de recette n'ont pas toutes été relevées : la validation ne s'étend pas aux autres modèles ou firmwares.

| Domaine | Résultat retenu | Portée et réserves |
| --- | --- | --- |
| Bambu P2S LAN | Supervision, températures, caméra, AMS et pilotage confirmés | Mode développeur activé avant les derniers essais ; suivi d'une impression de 9 h déjà confirmé |
| Deux Elegoo CC2 | Machines distinctes, supervision, caméra et CANVAS ; chauffe et coupure buse/plateau, Pause/Stop confirmés | Reprise CC2 non disponible dans FabCore ; ne pas la déclarer validée |
| Fichiers CC2 | Inventaires internes des deux machines et lancement depuis fichier interne confirmés | Lecture native 1044 et lancement 1020 ; CC1 conserve ses limites propres |
| Parc | Découverte et prévention des doublons confirmées ; suppression/réajout CC2 testés | Ne pas confondre une IP et une instance Moonraker ; capacités par connexion |
| Fichiers et aperçu | Téléchargement, transfert simple et parcours du visualiseur confirmés | Transfert multiple et lancement en lot : recette dédiée encore nécessaire |
| Authentification | Local et Pocket ID/OIDC confirmés ; séparation UI admin/observateur constatée et tests serveur existants | Audit manuel exhaustif des routes, fichiers et flux à terminer au MVP |
| Erreurs | Perte de liaison CC2 constatée ; refus d'autorisation P2S identifié et rendu explicite | Recette exhaustive firmware en erreur et accès refusé reportée |
| Klipper/Moonraker | Deux instances, températures et parcours fichiers en lecture/interface confirmés | Production physique encore partielle ; réglages personnels de la Tarantula hors projet |
| Longer Ray5 | Homing confirmé | Autres commandes et chaîne de production encore expérimentales |
| Bambu Cloud | Authentification, inventaire, températures et AMS en lecture | Ni caméra ni commandes cloud déclarées validées |
| xTool et autres familles | Acquis de supervision/caméras conservés selon les guides | Pas de validation globale de production par extension |

Le périmètre bloquant de clôture a été recentré explicitement sur **CC2 et P2S**. Les essais supplémentaires ci-dessus sont reportés, pas marqués réussis. Le POC est une preuve technique close, pas une certification de sûreté ni une version de production garantie. Un arrêt logiciel dépend du réseau et du firmware ; il ne remplace pas un arrêt matériel.

## État technique

Le POC repose sur JavaScript ESM et Node.js (contrainte actuelle `>=24`), un serveur et une interface dans `poc/`, des connecteurs dédiés, un état JSON persistant, une authentification locale/OIDC et des transports MQTT, HTTP, WebSocket ou TCP selon les machines. Dépendances majeures : mqtt, ws, basic-ftp, openid-client et nodemailer. La licence reste GPL-3.0.

Les points solides sont les connecteurs par fabricant, la séparation des capacités, les sessions persistantes, les commandes corrélées et sans rejeu automatique, les confirmations et le diagnostic par machine/compte. La contrainte principale est désormais l'évolution du socle : typage absent, responsabilités serveur/interface à découper, persistance à migrer, interrogation navigateur périodique et contrats à stabiliser.

## Conserver, migrer, différer

| Élément | Décision | Justification |
| --- | --- | --- |
| Protocoles, sessions et commandes validés | Conserver puis typer progressivement | Éviter de perdre la recette matérielle et les particularités firmware |
| Tests et guides fabricant/modèle | Conserver et enrichir | Références de non-régression et d'intégration communautaire |
| Authentification, droits et contrôles serveur | Conserver les comportements et isoler les services | Contrats explicites, audit et tests négatifs renforcés |
| Serveur JavaScript | Migration incrémentale TypeScript strict, monolithe modulaire Node.js LTS | Maintenabilité sans réécriture complète |
| Interface existante | Migration progressive React avec parité UX et fonctionnelle | Composants communs, traductions et nettoyage des flux caméra |
| État JSON | Import versionné vers PostgreSQL, même persistance auto-hébergée/cloud | Transactions, intégrité, sauvegarde et évolution du modèle |
| Rafraîchissement navigateur | SSE sécurisé | Diffusion de changements, reconnexion et resynchronisation maîtrisées |
| SDK/plugins dynamiques | Contrats préparés maintenant, SDK complet en développement ultérieur | Ne pas introduire de chargement de code tiers prématuré |
| Gestion de production | Backlog [#94](https://github.com/enamaryn/FabCORE/issues/94) | Kanban/planification après stabilisation du socle |

## Acceptation et suite

La clôture est autorisée ; la release reste un brouillon jusqu'à validation de Valentin. Aucune migration, modification de configuration machine ou mise à jour LXC n'est effectuée par cette clôture.

Le [plan de migration](MIGRATION-MVP.md) détaille les dépendances, sous-étapes, livrables et conditions de passage. Les priorités de recette restent P2S LAN et CC2 ; les autres connecteurs sont préservés avec leurs niveaux de validation réels.

Sources internes : [journal POC](POC.md), [plan MVP](MVP.md), [contrat des connecteurs](../poc/CONNECTORS.md), [Bambu LAN](protocols/BAMBU-LAN.md), [Elegoo LAN](protocols/ELEGOO-LAN.md), [Bambu Cloud](protocols/BAMBU-CLOUD.md), [Longer](protocols/LONGER-RAY5-LAN.md).
