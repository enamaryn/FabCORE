# FabCore · Proposition UX/UI

Ouvrir [prototype.html](prototype.html) localement dans Chromium, Firefox ou Safari. Le fichier ouvre directement la revue interactive. Chaque écran ou état dispose d’un accès direct, avec aperçu Bureau, Mobile et ouverture en plein écran. Le bouton Atelier ouvre le parcours en continu. Le prototype fonctionne hors ligne. L’[identité et les wireframes](identite.html) permettent de comparer les pistes et les cinq écrans prioritaires. Les [logos et icônes](brand/) sont fournis en SVG éditable. Quatre icônes disposent aussi d’un export PNG.

## Scénarios de revue

1. **Première installation**. Ouvrir l’assistant depuis la navigation, saisir `FABCORE-DEMO` et créer un administrateur fictif. Essayer Pocket ID/OIDC, les trois états de ntfy et SMTP. Simuler le scan, sélectionner les deux CC2, donner un nom à chacune et finaliser. Le parc reflète les sélections.
2. **Incident et contrôle**. Dans l’atelier prérempli, suivre l’alerte CC2-02 vers la machine et constater la caméra indisponible. Ouvrir Bambu P2S, mettre la fabrication en pause, la reprendre ou vérifier la confirmation d’annulation. Consulter l’historique.
3. **Fichiers et rôles**. Transférer un fichier fictif en choisissant une machine admissible. Ajouter un utilisateur, tester le rôle Observateur dans les paramètres et rouvrir la P2S.
4. **Mobile et préférences**. Retrouver l’atelier, les machines et les alertes depuis la barre basse. Ouvrir les autres rubriques via Plus. Tester FR/EN et les thèmes sombre, clair et système.

Les données métier et les étapes de l’assistant vivent en mémoire de la page. Langue et thème sont les seules préférences enregistrées localement. Les accès, notifications, transferts, commandes et connexions sont simulés. Les caméras utilisent un dessin de démonstration. Le catalogue comporte des aperçus pour la résine, le laser et la CNC. Les icônes PWA sont des livrables graphiques.

## Benchmark

| Référence | Observation | Décision FabCore |
| --- | --- | --- |
| [O.D.I.N. / RunsOdin](https://runsodin.com/) ([tarifs](https://runsodin.com/pricing)) | Gestion de ferme 3D auto-hébergée Docker, télémétrie, files, caméras et inventaire. Protocoles Bambu MQTT, Moonraker, PrusaLink, Elegoo SDCP, Anycubic LAN ; OctoPrint et Ultimaker signalés expérimentaux, capacités variables. Source disponible sous BSL 1.1 annoncée. Relevé du 19 novembre 2026, sans essai | Concurrent direct à inclure aux côtés de Printago et SimplyPrint. Comparer maintenance, permissions, cloud/LAN, files et coût. Ne pas présenter l’auto-hébergement, OIDC ou les caméras comme exclusifs à FabCore ; étudier les différences multi-équipements et multisites. Voir le relevé détaillé en fin de document |
| [Mainsail](https://docs.mainsail.xyz/) et [Fluidd](https://docs.fluidd.xyz/) | Interfaces Klipper centrées sur la machine et sa télémétrie | Regrouper caméra, fabrication, commandes et températures dans la fiche machine, avec une vue parc distincte |
| [OctoPrint](https://octoprint.org/) et [contrôle des accès](https://docs.octoprint.org/en/main/features/accesscontrol.html) | Caméra, commandes, suivi et création du premier admin | Traiter l’accès à la caméra et le pilotage comme des capacités distinctes. Intégrer les scénarios de droits dans la fiche |
| [Bambu Studio](https://cdn1.bambulab.com/documentation/X1E-9096a552381b8/Y.BC.SM.A00208-02_X1E%20EN.pdf) et [Handy](https://bambulab.com/en/download/handy) | Le suivi machine associe caméra, progression et commandes. Handy apporte l’accès mobile | Conserver les actions principales sous le flux et les rendre accessibles au pouce |
| [Elegoo Matrix](https://www.elegoo.com/pages/elegoo-matrix-app) | Changement d’imprimante depuis la vue appareil | Donner un nom et un identifiant individuels à deux appareils identiques, du scan jusqu’à l’alerte |
| [Prusa Connect / PrusaLink](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608) | Supervision du parc et distinction accès local/cloud | Laisser le mode de connexion lisible et distinguer la vue parc des capacités de la liaison |
| [CNCjs](https://cnc.js.org/docs/user-guide/) | L’atelier CNC organise ses commandes autour des axes, de l’origine et de la trajectoire | Prévoir une fiche par famille de machine, avec un vocabulaire adapté |
| [PrintBuddy](https://www.printbuddy.tech/index-en) | Vue multimarque et différences de capacité documentées par fournisseur | Utiliser un état commun pour le parc et faire varier fichiers, caméra et pilotage par appareil |
| [SimplyPrint](https://simplyprint.io/fr) ([tarifs](https://simplyprint.io/pricing.md)) | Gestion cloud multimarque d’imprimantes 3D par abonnement, intégrations natives annoncées pour Bambu Lab et Prusa. Gratuit limité à 2 imprimantes. Au relevé de novembre 2026 : Basic jusqu’à 3 imprimantes (environ 6 $/mois), Pro jusqu’à 10 imprimantes (30 à 40 $/mois), essai de 14 jours | Concurrent direct de l’offre professionnelle. FabCore se distingue par l’open source, l’auto-hébergement gratuit jusqu’à 10 machines et les familles laser et CNC. L’offre pro doit se vendre sur le service cloud, pas sur le nombre de machines. Repère pour la grille tarifaire ([MVP-11](../docs/MVP.md#mvp-11--offre-professionnelle-et-tarification)) |
| [print-farm-manager](https://github.com/joeltelling/print-farm-manager) (MIT) | Gestion auto-hébergée d’une ferme d’impression, sans cloud ni abonnement, avec Node.js, React et SQLite. Couvre PrusaLink, Elegoo CC1 (SDCP) et CC2 (MQTT), Bambu Lab X1C et P1S (MQTT, FTPS, AMS), Klipper et OctoPrint. Répartition automatique des travaux sur les imprimantes libres, validation par l’opérateur entre deux impressions, import CSV, mode écran mural. Aucune authentification, exposition à Internet déconseillée. Au relevé de novembre 2026 : 221 étoiles, 218 commits | Concurrent auto-hébergé le plus proche. FabCore se distingue par la sécurité (comptes, rôles, OIDC), les caméras, les notifications, les diagnostics, le laser et la CNC. Étudier la file et la répartition des travaux, la validation entre impressions et l’écran mural pour le MVP. Code MIT consultable pour les connecteurs, en conservant sa mention de copyright |
| [Printago](https://printago.io/) ([tarifs](https://printago.io/pricing), [compatibilités](https://printago.io/printer-compatibility), [auto-hébergement](https://printago.io/self-hosted)) | Plateforme de production 3D multimarque : file et routage selon matières/capacités, tranchage cloud, bibliothèque, inventaire, caméras et maintenance annoncés. Bambu cloud direct selon modèle/firmware ; pont local Fuse pour les autres connexions. Offre auto-hébergée également annoncée. Relevé du 19 novembre 2026, sans essai du service | Concurrent direct à étudier pour la production, le cloud/LAN et les droits. Ne pas présenter l’auto-hébergement, les rôles ou le multimarque seuls comme des fonctions exclusives de FabCore. Évaluer le positionnement multi-équipements 3D/laser/CNC et comparer les fonctions réellement livrées. Voir le relevé ci-dessous et MVP-11.0 |

### Printago · relevé initial du 19 novembre 2026

Sources : pages officielles consultées, sans compte créé ni essai matériel. Les fonctionnalités ci-dessous sont des annonces de l’éditeur, pas une validation indépendante.

| Axe | Observation et source | Conséquence pour l’analyse FabCore |
| --- | --- | --- |
| Production | [Présentation](https://printago.io/) : file de fabrication, routage selon capacités et matériaux, tranchage cloud OrcaSlicer/Bambu Studio, bibliothèque et intégrations e-commerce | Comparer le parcours complet fichier → affectation → fabrication, sans confondre un visualiseur G-code et un trancheur. Prioriser les écarts après la recette du POC |
| Connexions | [Compatibilité](https://printago.io/printer-compatibility) : modes cloud et LAN décrits par modèle ; la page générale présente Bambu cloud direct et le pont Fuse pour les autres liaisons. La P2S et la CC2 sont listées en LAN ; certains Bambu affichent des seuils de firmware pour le cloud | Une annonce « cloud multimarque » ne garantit pas chaque modèle ni chaque fonction. Vérifier notamment nos P2S et CC2 et la coexistence de plusieurs comptes, sites et gestionnaires. Ne pas déduire de leur présence une connexion cloud disponible |
| Économie | [Tarifs](https://printago.io/pricing) : nombre d’imprimantes connectées annoncé illimité, facturation par tâches simultanées (« production slots »), un créneau gratuit ; essai de 14 jours pour les créneaux supplémentaires, 5 Go et membres d’équipe gratuits annoncés. Le montant des créneaux supplémentaires n’est pas relevé ici | Comparer machines connectées, concurrence d’exécution, stockage et utilisateurs. Ne pas comparer directement « 10 machines » à « 1 créneau ». Aucun tarif FabCore modifié par ce relevé |
| Maintenance et droits | [Tarifs/fonctions](https://printago.io/pricing) : suivi d’entretien avec rappels selon usage et permissions par rôle | Confronter FD-07 (maintenance) et MVP-04 (droits). Rechercher séparément si un Gantt de production et les échéances constructeur sourcées existent : non établis par les pages consultées |
| Hébergement | [Édition auto-hébergée](https://printago.io/self-hosted) : Docker Compose, fonctionnement hors ligne annoncé, licences validées localement, contact commercial. Les pages consultées n’établissent pas une distribution open source ni un auto-hébergement gratuit | L’auto-hébergement et les rôles existent aussi dans cette offre. Vérifier licence, coût, contraintes et périmètre avant tout argument comparatif |

À approfondir en MVP-11.0 : multi-comptes du même constructeur, organisation multisite, périmètre des gestionnaires, SSO/OIDC, accès aux caméras par transport, prix des créneaux, conditions de l’auto-hébergement et Gantt. Ces points sont **à vérifier**, pas des fonctions supposées absentes. Une automatisation de production concurrente ne justifie pas d’ajouter des lancements sans confirmation à FabCore.

## Architecture et design system

| Public | Premier parcours | Information critique |
| --- | --- | --- |
| Maker qui installe FabCore | Activation → admin local → services → découverte → récapitulatif | La provenance du jeton et l’identité de chaque machine |
| Opérateur d’atelier | Vue parc → filtre → fabrication → fichier ou action | Machine ciblée, disponibilité et résultat de la commande |
| Observateur FabLab | Alertes → machine → constat | Droits de lecture, état et indisponibilité de la caméra |
| Administrateur | Utilisateurs → rôles → paramètres | Portée du rôle et accès de récupération |

Navigation desktop persistante. Sur mobile, Atelier, Machines, Alertes et Plus. Les caméras, fichiers, connecteurs, utilisateurs et paramètres disposent de vues dédiées. L’historique ouvre la machine impliquée. Le flux d’activation dispose d’un contexte visuel dédié. Les événements d’une machine et les rôles restent lisibles sur les petits écrans.

| Token | Atelier graphite sombre | Atelier graphite clair |
| --- | --- | --- |
| Fond | #101312 | #F1F5F1 |
| Navigation | #141816 | #FBFDFB |
| Carte | #1A1F1C | #FFFFFF |
| Surface renforcée | #222924 | #E9F0EB |
| Trait | #303A33 | #CCD8CF |
| Texte | #EEF3EE | #17251C |
| Texte secondaire | #A5B3A9 | #4C6053 |
| Vert action/succès | #57E489 | #096A37 |
| Fond vert discret | #183825 | #DCF4E5 |
| Info / avertissement / erreur | #8CCAFF / #F4C97C / #FF9B98 | #145A9B / #795003 / #A83330 |

Inter est la typographie proposée, avec une pile système en mode hors ligne. IBM Plex Sans est l’alternative à comparer. Échelle 12/14/15/21/29–42 px. Espacements 4/8/12/16/24/32 px. Rayons 8 px pour les contrôles, 13 px pour les panneaux. Icônes au trait en grille 24. Cibles principales de 42 px, navigation tactile de 48 px. Grilles adaptées à 1 050, 720 et 365 px. Les badges associent libellé et couleur. Les formulaires utilisent des libellés, les erreurs critiques reçoivent un retour visible, la confirmation intercepte l’annulation d’un travail et le focus reste visible. Les transitions suivent la préférence système de mouvement réduit.

**Direction proposée.** Atelier graphite avec le symbole Noyau. Banc de mesure propose une lecture plus instrumentée. Le contour de Noyau tient à petite taille et se prête à une variante monochrome.

## Revue avant POC

- Choisir la direction et le symbole, puis confirmer le rendu du mot-symbole et les contrastes avec des tests d’accessibilité complémentaires.
- Confirmer les raccourcis mobiles, le nommage des deux CC2 et le niveau de détail nécessaire dans la fiche machine.
- Examiner la progression de l’assistant, les étapes facultatives et la confirmation de la commande d’annulation.
- Vérifier la disponibilité des domaines choisis et la recherche de marques avant de retenir l’identité publique. Le nom FabCore a des homonymes dans la fabrication, dont [une découpeuse laser commercialisée par FabCreator](https://www.fabcreator.com/store).

## O.D.I.N. / RunsOdin · relevé du 19 novembre 2026

Sources officielles consultées : [présentation](https://runsodin.com/), [tarifs](https://runsodin.com/pricing) et liens de documentation de l’éditeur. Aucun compte, installation ou essai matériel effectué.

- **Positionnement annoncé** : auto-hébergement et connexions LAN, gestion multimarque de fermes 3D. La page distingue supervision et commandes, et marque certains envois expérimentaux ou non disponibles. Le support SDCP Elegoo ne démontre pas celui du MQTT CC2.
- **Offres annoncées** : Community gratuite jusqu’à cinq imprimantes ; Pro à 15 USD/mois ou 150 USD/an, imprimantes et utilisateurs illimités ; Education et Enterprise sur devis. La page d’accueil nuance la disponibilité du paiement mensuel. La page tarifs juxtapose « compte unique » et des droits/utilisateurs étendus dans Community : répartition exacte à confirmer, ne pas la présenter comme établie.
- **Fonctions à comparer** : maintenance, bibliothèque/archives, files de production, OIDC/RBAC, caméras WebRTC, alertes et détection locale ONNX. Vérifier la maturité et l’édition requise plutôt que reprendre les promesses de la page.
- **Licence déclarée** : BSL 1.1, conversion Apache 2.0 annoncée pour le 7 février 2029. Vérifier le texte et les conditions applicables avant toute réutilisation ; ne pas assimiler « source disponible » à la licence GPL de FabCore.
- **Questions ouvertes** : comptes cloud constructeur multiples, sites/fermes/gestionnaires, inventaire natif USB/SD/cache, Gantt et compatibilité exacte P2S/CC2. Aucune absence n’est déduite du seul silence des pages consultées.

Conséquence pour MVP-11 : comparaison avec Printago, SimplyPrint et print-farm-manager sur les mêmes axes (hébergement, licence, périmètre réel, prix, transports, sécurité et opérations). Les fonctions 3D/laser/CNC et le cloud constructeur multi-comptes sont des orientations FabCore à réaliser, pas des différences déjà démontrées en production.
