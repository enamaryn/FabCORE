# Planning de production autonome — #94

L’entrée **Production** est indépendante des projets créatifs. Une commande client, une réimpression ou une fabrication ponctuelle peut être créée directement dans le planning sans projet Kanban. Les travaux issus d’un projet apparaissent dans la même liste avec leur identité existante : les déplacer ne crée aucune copie.

Un travail conserve titre, client/référence, format 2D/3D/mixte, prototype/production finale, quantité, matière, référence de fichier/version, notes, durée totale estimée, échéance et machine. Le lien `projectId` est facultatif (`null` pour un travail autonome) ; il peut être renseigné à la création mais n’est pas modifié lors d’un déplacement. Les anciens travaux restent lisibles sans les nouveaux champs optionnels `client` et `scheduledStart`.

## Planifier et suivre

La réserve « À planifier » regroupe les travaux actifs sans créneau complet : machine, durée et début. Le Gantt présente les machines et les créneaux ; la fiche fournit une alternative accessible au glisser-déposer pour choisir la date et la machine. Le suivi à faire/réalisé/annulé reste manuel. La durée estimée porte sur le travail entier, sans multiplication automatique par la quantité.

Un créneau est un instant UTC `scheduledStart` et une durée totale `estimatedMinutes`. Le navigateur affiche et saisit les heures locales, puis convertit les instants pour leur sauvegarde. Les vues utilisent des limites calendaires locales, y compris les changements d’heure. La période visible peut être déplacée et présentée par jour ou semaine. La vue jour possède une échelle horaire et un zoom pour les fabrications courtes (par exemple 20 minutes). Le placement peut se faire par pas de 5 minutes ; la durée totale est saisie à la minute.

Les chevauchements actifs sur une même machine sont signalés, sans déplacement silencieux ni rejet des autres créneaux. Deux créneaux qui se touchent ne se chevauchent pas. Les travaux annulés et réalisés ne créent pas de conflit actif. Les échéances sont des dates calendaires locales. Les travaux dont la machine a été retirée gardent son nom et peuvent être réaffectés. Une machine hors ligne reste planifiable : la disponibilité réseau n’est pas un calendrier d’ouverture.

Cette première planification ne comporte ni calcul de compatibilité fichier/matière/machine, ni réservation matérielle, ni lancement automatique. Elle n’appelle aucun connecteur. Les calendriers d’ouverture, indisponibilités, dépendances, capacités simultanées, phases de préparation/retrait et rapprochement estimé/observé restent des évolutions ultérieures. Une erreur ou reconnexion n’envoie jamais une commande d’impression.

## API et stockage

- `GET /api/production` : même ensemble de projets et travaux que le Kanban, utilisateur connecté.
- `POST /api/production/work` : création autonome ; `projectId` UUID facultatif pour rattachement à un projet existant.
- `POST /api/production/work/:id` : modification d’un travail autonome ou lié ; `expectedRevision` obligatoire.

Les routes projets existantes conservent leur frontière de parent : impossible de modifier un travail autonome ou d’un autre projet via une URL projet. Les écritures sont réservées à l’administrateur ; observateurs en lecture seule. Les gardes d’origine, JSON, taille et débit restent appliquées. La liste complète reste bornée à 1 000 travaux et 250 projets. Les nouvelles données restent dans `projectBoard`, conservées par JSON et PostgreSQL sans migration SQL ni recopie des travaux.

La sauvegarde est sérialisée par le service commun ; toute révision périmée renvoie 409. L’interface garde l’instantané du formulaire et invite à rouvrir après conflit. L’événement `projects.changed` est publié après sauvegarde réussie et invalide les deux écrans. Toute création/modification d’un travail lié reste auditée dans le projet ; une création autonome ne crée aucun projet implicite.

Le serveur exige un instant UTC réel (format ISO avec `Z`) et, lorsqu’un début est fixé, une machine et une durée positive. Retirer un travail du calendrier remet son début à `null`. Une machine inconnue n’est pas une nouvelle affectation valide ; les anciennes références de machine supprimée restent conservées pour réaffectation. Les collisions sont des alertes de planification, pas des erreurs de sauvegarde.

## Vérifications et recette

Tests service : création sans projet, client, planification/déplanification, dates impossibles, durée et machine requises, lien facultatif préservé, frontières projet, anciennes sauvegardes, concurrence, stockage défaillant et mapping PostgreSQL. Tests HTTP sur boucle locale : rôles, origine, lecture commune, révisions, persistance JSON et absence d’appel machine. La recette PostgreSQL ferme/réouvre le magasin avec un travail autonome et un travail de projet. Tests purs de calendrier et rendu React complètent le parcours de l’interface.

Recette utilisateur restante : création directe, placement/déplacement/édition d’un créneau, alerte de collision, changement jour/semaine et affichage téléphone/bureau. Aucun test matériel n’est requis pour la planification de métadonnées.

## Suivi prévu/réalisé — association explicite

Un administrateur ouvre le travail et choisit « Associer une fabrication ». Deux sources sont distinguées :

- Observation de la fabrication en cours : nouvelle lecture du connecteur existant, état printing/paused et fichier identique à celui confirmé dans le formulaire. Une télémétrie explicitement datée de plus de 15 secondes est refusée. Une seule exécution active par travail et par machine.
- Déclaration opérateur : permet le suivi sans identifiant natif de fabrication, y compris pour un connecteur qui ne fournit pas ces événements. Elle ne commande pas la machine et ne suppose pas un départ effectif à l’ouverture du formulaire.

Le nom de fichier n’est pas un identifiant de fabrication universel. Le suivi natif actuel ne permet pas de distinguer deux fabrications successives du même fichier sur tous les fabricants. Il ne clôture donc jamais automatiquement un travail. Pause, état inconnu, autre fichier et fin native signalée sont des observations distinctes ; une perte de liaison n’est ni un échec ni une réussite. La reprise après redémarrage affiche un état non vérifié jusqu’à une nouvelle observation. Sans relevé depuis plus de 90 secondes, l’affichage redevient inconnu. Les lectures existantes du parc mettent à jour l’observation ; aucune nouvelle commande ou boucle de pilotage n’est créée.

L’opérateur confirme le résultat terminé/échec/annulé et l’heure de fin. Le début peut être renseigné s’il est connu ; associer une impression déjà lancée ne déduit pas son heure de départ. Une heure inconnue reste `null`, affichée « — ». La durée réelle et l’écart au prévu ne sont calculés que si début et fin sont connus. Il s’agit de la durée écoulée, pauses comprises, pas d’un compteur moteur/chauffe. Les dates non modifiées conservent leurs secondes et millisecondes, y compris lors d’une heure répétée en automne.

Chaque tentative conserve la machine, le fichier, l’opérateur, l’heure d’association, les heures confirmées, son résultat et le cliché du début/durée prévus. Vingt tentatives au maximum sont conservées par travail. Le formulaire de métadonnées ne peut ni injecter ni effacer ces données. Pendant une tentative active, machine, créneau, estimation et état sont verrouillés ; les notes restent modifiables. Un échec conserve le travail à produire et permet une nouvelle tentative. Terminer ou annuler ne déclenche aucune action matérielle. Les anciennes sauvegardes sans `executions` restent lisibles.

L’observation native actualise son état sans changer la révision éditoriale du travail ; les autres mutations relisent les données courantes dans la même file sérialisée et conservent ces observations. L’horodatage d’observation est sauvegardé sur changement ou au plus une fois par minute. La clôture et l’association incrémentent la révision et gardent l’audit du projet éventuel. Une erreur de stockage du suivi ne doit pas masquer la supervision de la machine.

### Recalage à confirmer

Après une fin confirmée au-delà du créneau prévu, l’administrateur peut demander une proposition de recalage. Elle concerne les travaux suivants à produire sur cette machine, à partir du début prévu de la fabrication source. Les intervalles libres absorbent le dépassement ; seuls les travaux qui doivent avancer vers une date ultérieure sont déplacés. Les travaux réalisés/annulés restent inchangés. La proposition est indisponible tant qu’une autre fabrication est active sur cette machine : son heure de fin n’est pas inventée.

L’aperçu montre machine, travail, ancien et nouveau début. Rien n’est écrit avant la confirmation séparée. Le jeton de proposition expire après cinq minutes, ne survit pas au redémarrage et n’est utilisable qu’une fois. Tout changement concurrent du planning de la machine, y compris l’ajout d’un travail ou une nouvelle tentative, impose un nouveau calcul. La confirmation sauvegarde tous les déplacements en une fois ; un échec ne publie aucun succès.

API administrateur, gardes JSON/origine/débit et révisions existantes :

- `POST /api/production/work/:id/execution` : association native vérifiée ou déclaration opérateur, confirmation de la cible.
- `POST /api/production/work/:id/execution/:executionId/finish` : résultat et heures confirmés.
- `POST /api/production/work/:id/replan-preview` : proposition sans déplacement.
- `POST /api/production/replan-apply` : application atomique du jeton confirmé.

La recette reste à effectuer avec des fabrications réelles surveillées : début inconnu, pause, déconnexion, même fichier relancé, échec puis nouvelle tentative, fin déclarée et recalage. Les tests automatisés utilisent des transports simulés et ne démarrent aucune machine.
