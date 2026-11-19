# Journaux par machine

Chaque fiche propose un onglet **Logs** réservé aux administrateurs, avec recherche et téléchargement. Le journal global reste synthétique. Le journal machine conserve les opérations des connecteurs, leur résultat et leur durée. Bambu ajoute connexions et abonnements MQTT, requêtes natives, réponses et identifiants corrélés, refus et délais. Elegoo ajoute les requêtes RPC et leurs réponses. La chauffe journalise la consigne attendue et celle réellement relue : une commande acceptée ne prouve pas que la température a changé.

Les autres connecteurs disposent du journal des opérations ; cela ne constitue pas une capture exhaustive de leurs paquets réseau. Les commandes du terminal libre ne sont pas reproduites. Les rapports Bambu périodiques sont échantillonnés toutes les dix secondes ou lors d’un changement d’état ; les réponses aux commandes ne sont pas échantillonnées. Aucun rejeu, reconnexion ou commande supplémentaire n’est déclenché pour journaliser.

Stockage : `$FABCORE_DATA/machine-logs/<uuid>.log`, rotation vers `.log.1` après environ 1 Mio, une ligne bornée à 16 Kio. Permissions 0700/0600. L’écran lit les 500 dernières entrées ; le téléchargement contient les deux fichiers conservés. La suppression d’une machine efface ses logs. Un défaut d’écriture n’empêche pas une commande et rend le journal explicitement indisponible. Les secrets connus et les champs sensibles sont retirés ; les données machine suivent une liste de champs autorisés. Les logs contiennent néanmoins des adresses locales et des noms de fichiers : les partager uniquement avec les personnes concernées.

API administrateur : GET `/api/machines/<uuid>/logs` et `/api/machines/<uuid>/logs-download`. Un observateur reçoit 403.

Pour une chauffe refusée, noter l’heure, effectuer une seule tentative puis ouvrir les logs. Chercher `control.execute`, `mqtt-send`, `mqtt-command-response` et `heater-confirmation` : vérifier cible, commande, séquence, code, raison et consigne réelle. Un délai sans réponse doit rester un résultat inconnu, pas être interprété comme une exécution. Ne pas multiplier les tentatives pour produire des données.

Les [journaux des comptes cloud](CLOUD-ACCOUNTS.md) sont indépendants : le pilote actuel authentifie le compte et liste les machines, sans importer ni commander une machine cloud. Un inventaire `FAIL` n’est pas un refus de connexion. Les journaux ne peuvent pas reconstituer rétroactivement les échanges antérieurs à cette mise à jour.
