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
