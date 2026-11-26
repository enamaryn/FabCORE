# Projets créatifs et travaux à produire — issue #94

Le Kanban suit un projet personnel ou une demande client, depuis l’idée jusqu’au livrable 2D/3D. Ce n’est pas une file d’impression. Le [planning Production](PRODUCTION-PLANNING.md) est autonome : il réunit les travaux issus de ces projets et ceux créés directement sans Kanban.

## Parcours

Cinq étapes : Idées, À cadrer, Conception, Prototype, Création finalisée. Un administrateur déplace une carte avec le sélecteur accessible ou le glisser-déposer sur ordinateur. Les observateurs consultent le tableau et les détails. Les filtres portent sur le texte, l’origine, le format, la priorité et les archives.

Une fiche conserve titre, brief, notes, client, responsable libre, échéance, priorité, étiquettes, blocage, checklist et liens de référence/conception/livrable. Les liens HTTP(S) n’acceptent pas d’identifiants intégrés et ne sont jamais téléchargés par le serveur. Aucun fichier binaire n’est téléversé depuis cette fiche : les documents restent à leur emplacement d’origine. L’archivage est réversible.

Un projet peut produire plusieurs travaux de prototype ou de production. Chacun conserve quantité, matière, format, référence de fichier/version, durée estimée, échéance et affectation indicative à une machine. L’état « à faire / terminé / annulé » est manuel. Les affectations ne vérifient pas la compatibilité d’un fichier et n’envoient aucune commande. Les créneaux sont éditables dans le planning Production. La suppression d’une machine conserve son nom dans les anciens travaux. Le Gantt utilise ces mêmes travaux sans duplication ; calendriers de capacité et indisponibilités restent des évolutions ultérieures.

## Persistance et concurrence

`projectBoard` est un champ versionné de l’état existant. La sauvegarde JSON et le stockage PostgreSQL via `settings` le conservent sans migration SQL dédiée. Les mutations sont sérialisées ; chaque modification exige `expectedRevision`. Une version périmée renvoie HTTP 409 et invite à rouvrir la fiche, sans écraser le travail concurrent. Les formulaires gardent leur instantané initial pendant les mises à jour SSE. L’identité d’audit vient de la session ; l’historique est borné à 50 entrées par projet. L’événement `projects.changed` est publié après sauvegarde réussie.

Limites du premier jalon : 250 projets, 1 000 travaux, 12 liens et 40 éléments de checklist par projet ; requêtes projets limitées à 64 Kio. Les autres routes conservent leur limite habituelle. Les métadonnées sont partagées dans l’atelier selon les rôles existants, sans espace privé par client.

## API et points d’entrée

- `GET /api/projects` : tableau complet, utilisateur connecté.
- `POST /api/projects` : création, administrateur.
- `POST /api/projects/:id` : modification, étape ou archivage avec révision attendue.
- `POST /api/projects/:id/work` : création d’un travail.
- `POST /api/projects/:id/work/:workId` : modification d’un travail avec révision attendue.

Les écritures appliquent les gardes JSON, origine et limitation de débit existantes. Le domaine valide les dates calendaires, champs, quantités et liens. Une sauvegarde malformée n’est pas silencieusement remplacée par un tableau vide. Le service n’importe aucun connecteur machine.

Entrées : `src/domain/projects.ts`, `src/application/projects.ts`, `src/http/routes/projects.ts`, `web/src/components/projects/ProjectsPage.tsx` et `ProjectEditor.tsx`. Navigation React « Projets », avec lien depuis l’ancienne interface. Traductions française et anglaise.

## Vérifications

Tests service : validation, dates/liens, révisions concurrentes, audit, archives, travaux multiples et sauvegarde en échec. Tests HTTP réels sur boucle locale : rôles, origine, limite de taille, conflit, redémarrage JSON et absence de commande machine. Rendu serveur React : étapes, échappement, vue observateur et déplacements accessibles. Test PostgreSQL avec fermeture/réouverture lorsque `FABCORE_TEST_DATABASE_URL` est fourni, sinon ignoré explicitement.

La recette interactive bureau/téléphone et le retour utilisateur restent à effectuer. Aucun essai de production ni commande matérielle n’est nécessaire pour ce jalon.
