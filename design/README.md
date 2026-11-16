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
| [Mainsail](https://docs.mainsail.xyz/) et [Fluidd](https://docs.fluidd.xyz/) | Interfaces Klipper centrées sur la machine et sa télémétrie | Regrouper caméra, fabrication, commandes et températures dans la fiche machine, avec une vue parc distincte |
| [OctoPrint](https://octoprint.org/) et [contrôle des accès](https://docs.octoprint.org/en/main/features/accesscontrol.html) | Caméra, commandes, suivi et création du premier admin | Traiter l’accès à la caméra et le pilotage comme des capacités distinctes. Intégrer les scénarios de droits dans la fiche |
| [Bambu Studio](https://cdn1.bambulab.com/documentation/X1E-9096a552381b8/Y.BC.SM.A00208-02_X1E%20EN.pdf) et [Handy](https://bambulab.com/en/download/handy) | Le suivi machine associe caméra, progression et commandes. Handy apporte l’accès mobile | Conserver les actions principales sous le flux et les rendre accessibles au pouce |
| [Elegoo Matrix](https://www.elegoo.com/pages/elegoo-matrix-app) | Changement d’imprimante depuis la vue appareil | Donner un nom et un identifiant individuels à deux appareils identiques, du scan jusqu’à l’alerte |
| [Prusa Connect / PrusaLink](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608) | Supervision du parc et distinction accès local/cloud | Laisser le mode de connexion lisible et distinguer la vue parc des capacités de la liaison |
| [CNCjs](https://cnc.js.org/docs/user-guide/) | L’atelier CNC organise ses commandes autour des axes, de l’origine et de la trajectoire | Prévoir une fiche par famille de machine, avec un vocabulaire adapté |
| [PrintBuddy](https://www.printbuddy.tech/index-en) | Vue multimarque et différences de capacité documentées par fournisseur | Utiliser un état commun pour le parc et faire varier fichiers, caméra et pilotage par appareil |

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
