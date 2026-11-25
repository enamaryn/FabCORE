# Renouvellement des PEM Bambu

Les PEM restent importés sans validation cryptographique bloquante. Les échéances sont des **métadonnées indicatives**, pas une preuve de confiance ou d’acceptation par l’imprimante. Les dates illisibles restent inconnues ; aucun import n’est refusé pour cette raison.

## Réglages administrateur

Dans Comptes cloud, « URL de renouvellement » configure le trigger-url sans réimporter les fichiers. Cette URL reste chiffrée et n’est jamais renvoyée au navigateur. Un champ vide désactive le renouvellement automatique. « Renouveler maintenant » exécute une tentative contrôlée ; le statut affiche les échéances, la dernière réussite, la prochaine tentative et les échecs. Ces actions utilisent POST `/api/cloud-certificates` avec `action=configure` ou `action=refresh`, sous les mêmes gardes admin/origine/type JSON que l’import.

## Fonctionnement serveur

- Vérification chaque minute pendant le fonctionnement du serveur ; arrêt du timer et annulation du téléchargement à sa fermeture.
- Renouvellement sept jours avant l’échéance la plus proche des certificats/CRL, ou après quatorze jours au maximum. Si les dates ne peuvent être lues, tentative après sept jours.
- Après une réussite, pas de nouvelle tentative automatique pendant vingt-quatre heures, même si le fournisseur retourne la même CRL. Après un échec, délai progressif d’une heure à vingt-quatre heures, conservé après redémarrage. Le bouton manuel peut demander une nouvelle tentative immédiate.
- Une seule tentative à la fois. Requête HTTPS sans redirection, timeout de quinze secondes, réponse limitée à 256 Kio. Les erreurs fournisseur sont remplacées par un code public stable sans URL ni secret.
- L’ancien coffre reste disponible si le téléchargement ou le déchiffrement échoue. Un import ou une configuration effectués pendant le téléchargement empêchent le remplacement par le résultat devenu ancien.
- Une alerte d’échéance sans URL, ou d’échec de renouvellement, utilise les canaux ntfy/SMTP déjà configurés. Au plus une alerte livrée par jour pour le même import. Les données d’historique ne contiennent que des dates et codes d’erreur.
- La tâche ne connaît ni MQTT ni les machines et n’envoie aucune commande. Les nouveaux PEM seront pris en compte à la prochaine action explicite de pilotage ; aucun ordre utilisateur n’est rejoué après renouvellement.

Le serveur doit être en fonctionnement pour effectuer les tentatives ; il ne s’agit pas d’une tâche planifiée externe. Le fournisseur doit continuer à accepter l’URL fournie. Une URL absente ou devenue invalide nécessite une configuration ou un nouvel import par l’utilisateur.

## Vérifications et reprise

Tests : dates DER UTC/GeneralizedTime et CRL multiples, échéances inconnues, concurrence, persistance, délai de reprise, alertes dédupliquées, arrêt, réponse bornée, import concurrent protégé, parcours HTTP admin/origine et maintien du G28 signé après un renouvellement refusé. Aucun renouvellement réel ni ordre matériel n’est lancé pendant le développement.

Entrées : `poc/bambu-credential-dates.mjs`, `poc/bambu-credential-renewal.mjs`, `createBambuCertificateVault`, `handleBambuCertificates` dans `poc/server.mjs`. Tests : `poc/bambu-credential-renewal.test.mjs`, `poc/bambu-signed-cloud.test.mjs`.

Branche : `feature/bambu-credential-renewal`. Après fusion/mise à jour : vérifier les échéances, renseigner le trigger-url si disponible, demander un renouvellement et vérifier le statut ; ne pas diffuser cette URL dans un ticket ou une capture.
