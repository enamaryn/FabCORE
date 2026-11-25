# Commandes Bambu : compte cloud et LAN

## Choix du chemin

Le type de machine enregistré détermine le transport, sans détection heuristique ni bascule automatique :

| Ajout dans FabCore | Commandes | Fichiers |
| --- | --- | --- |
| Depuis « Comptes cloud » (`bambu-cloud`) | Session MQTT TLS du compte cloud ; `print.*` signé avec les PEM importés | FTPS local de l'imprimante (990), code demandé côté serveur au compte cloud |
| Ajout LAN (`bambu`) | Session MQTT TLS LAN existante, sans identité applicative ni signature | FTPS LAN existant |

Le mode de l'imprimante n'est jamais modifié par FabCore. Ajouter une identité au coffre n'active pas la signature pour les machines LAN. Aucun compte ni jeton cloud n'est utilisé par le connecteur LAN. Les commandes cloud ne se replient jamais sur des commandes brutes/LAN en cas d'erreur.

## Utilisation

1. Importer `key.pem`, `chain.pem`, `crl.pem` dans « Comptes cloud ». Leur stockage ne prouve pas leur acceptation par l'imprimante.
2. Connecter le compte Bambu et utiliser « Ajout automatique » pour importer sa machine. Le suivi MQTT doit rester actif et un rapport de moins de 60 secondes doit être disponible.
3. Les panneaux existants exposent origine/déplacements, éclairage, chauffe, ventilateurs, pause/reprise/stop, terminal et lancement de fichier. Les droits admin, confirmations, garde d'état et verrous HTTP restent appliqués.
4. Pour lister, lire/visualiser, uploader, télécharger ou transférer les fichiers : renseigner l'IPv4 locale dans « Paramètres vidéo et fichiers ». Cette adresse sert au FTPS même avec caméra désactivée. Le serveur doit joindre le LAN de l'imprimante ; le broker cloud n'est pas un serveur FTP.

## Protocole et résultats

- La supervision n'installe rien. À la première commande `print.*`, le serveur publie `security.app_cert_install` avec la chaîne et la CRL, puis attend un ACK explicitement réussi, corrélé par appareil, canal, commande et séquence.
- Le certificat de l'imprimante est lu depuis la réponse d'installation (`printer_cert`, `cert` ou `dev_cert`). Si absent pour une commande nécessitant le chiffrement, une requête `app_cert_list` est faite. Sans certificat utilisable, aucune commande sensible n'est publiée.
- `gcode_line`, `gcode_file` et `project_file` chiffrent `param`/`url` vers ce certificat. Le cœur existant signe les octets JSON canoniques et place `header` en premier. Pause/reprise/stop sont signés, sans chiffrer leur paramètre vide.
- Les séquences sont des chaînes strictement croissantes pendant le processus serveur. Les deux canaux restent séparés : `system.ledctrl` est une commande native non signée, même quand le cloud est actif.
- Un ACK ne prouve pas un mouvement physique terminé : homing, déplacements et terminal restent « acceptés ». La chauffe attend la consigne relue. La référence d'origine FabCore est oubliée à la perte de session ou après une commande terminal.
- QoS 0, `retain=false`, file QoS 0 désactivée : aucun renvoi de contrôle à la reconnexion. Déconnexion du compte, suppression de machine, rapport périmé, changement de PEM ou refus arrêtent le chemin de commande. Une publication sans réponse reste inconnue.
- Les identités d'installation sont invalidées à la reconnexion ou au changement de PEM. Aucun essai de variante de signature, de paramètre en clair ou d'autre transport n'est déclenché automatiquement.
- Clé privée, CRL, chaîne et enveloppe signée ne sont pas écrites dans les journaux de commande. Le certificat imprimante reste interne à la session ; seuls les champs d'ACK et métadonnées nécessaires sont journalisés.

## Limites et recette matérielle

Le cœur cryptographique était déjà présent ; ce jalon vérifie son raccordement par des tests simulés, dont un parcours HTTP complet compte → import machine → coffre → homing chiffré/signé, et des transferts FTPS simulés. **Recette partielle sur la P2S réelle le 25 novembre 2026, 14 h 07 (Paris)** : les journaux du LXC 119 confirment `app_cert_install → SUCCESS`, puis le `gcode_line` envoyé par Valentin depuis le terminal → `SUCCESS`, `err_code=0` ; Valentin confirme le mouvement G28. La lecture des journaux n’a envoyé aucune commande. Les autres contrôles et transferts restent à recetter physiquement.

La compatibilité est à qualifier sur la P2S de référence ; pas de promesse pour les autres modèles importés. Le certificat/CRL fourni doit être accepté par le firmware. Le renouvellement du coffre reste disponible en interne ; aucun renouvellement automatique ni nouvelle tentative de commande après renouvellement n'est ajouté ici. Les champs RSA sont bornés par la taille du certificat imprimante ; un G-code/chemin trop long est refusé sans envoi en clair.

Après fusion et mise à jour : conserver le cloud actif et Bambu Handy ; importer les PEM, vérifier suivi/AMS, tester lumière puis pause/reprise/stop sur un petit travail supervisé. Au repos, tester origine et déplacements courts, puis chauffe/coupure ; enfin liste, upload, téléchargement et lancement d'un fichier préparé. Contrôler l'état réel et les ACK. Refaire les contrôles LAN sans compte cloud pour confirmer l'absence de signature. Aucun test matériel n'est déclenché par cette PR.

## Reprise

- Branche : `feature/bambu-signed-controls`.
- Entrées : `connectors/bambu/src/commands.ts`, `cloud-monitor.ts`, composition `poc/cloud-accounts.mjs`, registre `poc/connectors.mjs`, transferts `poc/bambu-cloud-files.mjs`.
- Tests : `poc/bambu-signed-cloud.test.mjs`, `connectors/bambu/test/cloud-monitor.test.ts`, tests LAN existants.
- État cloud corrigé : `FAILED` avec `print_error=0` est l’ancien travail échoué, pas une erreur active ; l’état public devient Prête et l’ancien nom/progrès est effacé, comme en LAN. Sans code ou avec un code non nul, FAILED reste Erreur.
- Première action après revue : vérifier le déblocage des boutons sur la P2S au repos, puis les autres contrôles supervisés. Une absence d’ACK ne déclenche aucun mouvement ni renvoi.
