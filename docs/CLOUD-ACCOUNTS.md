# Comptes cloud constructeur · pilote Bambu Lab

État : branche `feat/cloud-accounts`, proposée en PR, non déployée. Premier périmètre : authentification HTTPS et inventaire retourné par un compte Bambu. Aucune commande machine ni connexion MQTT cloud dans ce jalon.

## Utiliser la page

1. Se connecter à FabCore comme administrateur et ouvrir **Comptes cloud** dans les actions du compte.
2. Ajouter un compte : nom libre, fabricant, région internationale (Europe comprise) ou Chine, adresse email. Plusieurs comptes du même fabricant sont permis (24 comptes au maximum dans le POC).
3. Pour Bambu Lab, saisir le mot de passe Bambu. Si demandé, saisir le code email reçu ou le code TOTP. Le challenge dure dix minutes, appartient à la session FabCore qui l’a initié et disparaît au redémarrage/déconnexion.
4. Après authentification, consulter les machines réellement renvoyées : nom, modèle, série, état cloud et date de lecture. « Relire les machines » est une action explicite ; pas de polling de l’historique.
5. Ouvrir **Journal du compte** et, si nécessaire, **Télécharger le fichier log** pour transmettre le diagnostic.

Les marques Creality, Elegoo, Prusa, xTool et Anycubic ont des fiches de compte possibles, mais leur connexion reste explicitement « à venir ». Cela ne déclare aucune compatibilité cloud pour ces fabricants. Le modèle de compte est indépendant du connecteur Bambu.

L’inventaire n’ajoute pas de machine au parc. Une série Bambu déjà enregistrée en LAN est signalée dans la liste. Les connexions LAN existantes restent inchangées. L’affichage est plafonné aux 200 premières entrées reçues, avec mention si la réponse en contient plus. La réussite de login ne garantit pas la disponibilité de la liste : les deux étapes et leurs erreurs sont distinctes.

## Compte créé avec Google, Apple ou Facebook

Le premier pilote n’intègre pas de bouton OAuth Google/Apple/Facebook. Il ne demande jamais le mot de passe Google. D’après la [documentation ha-bambulab](https://github.com/greghesp/ha-bambulab/blob/main/docs/setup.mdx), ouvrir Bambu Handy avec la connexion sociale habituelle, puis **Profil → Sécurité du compte → Modifier le mot de passe** pour définir un mot de passe Bambu. Utiliser ensuite dans FabCore l’email associé et ce mot de passe Bambu. Cette aide est également affichée dans le formulaire.

Bambu documente ses méthodes de connexion dans son [livre blanc sécurité](https://cdn1.bambulab.com/trust-center/file/bambulab-security-whitepaper-en.pdf), section 4.2.1. Un OAuth entre Google et Bambu n’équivaut pas à une autorisation OAuth fournie à FabCore ; un tel parcours serait une intégration distincte à qualifier.

## Connexion et diagnostic

Transport sortant HTTPS uniquement, hôtes fixés dans le code par région. Aucun hôte fourni par l’utilisateur, aucune redirection suivie, aucune identité Bambu Studio/Orca imitée. Délai de huit secondes par requête, réponses limitées à 1 Mo, cinq opérations par minute et par compte plus la limite HTTP existante. Aucun retry automatique, aucune commande de fabrication.

Parcours utilisés : login `/v1/user-service/user/login`, inventaire GET `/v1/iot-service/api/user/bind`. Le login déclenche déjà l’email de vérification : aucun second appel d’envoi de code n’est fait après `verifyCode`. Un nouveau démarrage de connexion est temporisé une minute par compte, sans bloquer la vérification en cours. Pour TOTP, requête CSRF puis `/api/sign-in/tfa` sur le portail régional, avec les cookies de cette seule vérification. Un blocage de portail ou un refus est affiché ; aucun contournement automatique. **Le parcours TOTP réel reste à vérifier : cet endpoint peut refuser les clients tiers.**

Référence d’implémentation étudiée : [ha-bambulab, bambu_cloud.py](https://github.com/greghesp/ha-bambulab/blob/main/custom_components/bambu_lab/pybambu/bambu_cloud.py). La recherche complémentaire figure dans la PR documentaire #80 ; les appels réels n’ont pas été effectués avec un compte utilisateur pendant ce développement.

## Journaux par compte

Répertoire : `$FABCORE_DATA/cloud-logs/`. Une paire de fichiers par identifiant interne : `<id>.log` et `<id>.log.1`. Chaque ligne est un objet JSON daté. Rotation après environ 256 Kio ; deux fichiers au maximum par compte (environ 512 Kio plus une ligne). L’interface lit les 300 dernières lignes ; le téléchargement rassemble les deux fichiers conservés. Permissions créées : répertoire 0700, fichiers 0600.

Champs autorisés : étape, méthode, hôte et chemin fixes, statut HTTP, durée, famille de contenu, code constructeur numérique, type de challenge reconnu, présence d’un jeton (booléen), nombre de machines et résultat normalisé. Les erreurs réseau connues sont réduites à un code technique autorisé ; aucune exception brute n’est enregistrée.

**Les mots de passe, codes MFA/email, jetons, cookies, clés CSRF/TFA, codes LAN et corps HTTP bruts ne sont jamais journalisés.** « Toutes les informations de debug » signifie les éléments utiles et non secrets, pas un dump du trafic. Les corps du constructeur peuvent contenir des secrets, même dans un message d’erreur. Aucun mode verbose ne désactive ce filtrage.

Accès à l’écran, API et téléchargement réservé aux administrateurs. Les observateurs ne reçoivent ni comptes ni logs. La suppression du compte efface son jeton chiffré, son inventaire enregistré et ses deux fichiers log ; la déconnexion seule garde le journal.

## Secrets et sauvegardes

Les métadonnées et inventaires sélectionnés sont dans `state.json`. Le jeton est chiffré AES-256-GCM, lié à l’identifiant du compte, avec une clé locale indépendante dans `$FABCORE_DATA/cloud-secret.key` (0600). Le mot de passe n’est jamais écrit ; code et état MFA ne restent qu’en mémoire temporaire. Aucun jeton n’est renvoyé au navigateur ni écrit dans localStorage.

Sauvegarder la clé séparément et la protéger : perdre `cloud-secret.key` rend les anciens jetons inutilisables. Une restauration avec état chiffré mais sans clé n’en génère pas une nouvelle silencieusement. Il faut reconnecter les comptes après avoir traité la restauration. Déconnecter/supprimer retire le jeton de l’état courant ; les anciennes sauvegardes doivent suivre la même politique de rétention des secrets. Le chiffrement local ne protège pas d’un administrateur du serveur ayant accès à la clé et au stockage.

## API FabCore (administrateur)

- GET / POST `/api/cloud-accounts` : catalogue/liste et création.
- POST `/api/cloud-accounts/<id>/login` ou `/verify` : authentification ou code.
- POST `/api/cloud-accounts/<id>/devices` : relire l’inventaire.
- POST `/api/cloud-accounts/<id>/disconnect` ou `/delete` : fermeture/suppression locale.
- GET `/api/cloud-accounts/<id>/logs` ou `/logs-download` : journal filtré/fichier.

Toutes les mutations exigent session admin, origine exacte et JSON. Les challenges ne sont pas réutilisables depuis une autre session. Une déconnexion FabCore pendant l’authentification annule la conservation tardive du jeton. Aucune route de pilotage cloud n’existe ici.

## Validation et suite

97 tests passent, dont neuf tests cloud : isolation multicomptes/régions, chiffrement après redémarrage, absence de secrets, challenge email/TOTP simulé, expiration et propriétaire, erreurs HTTP/corps bornés, verrou et absence de rejeu, rotation/suppression des logs, droits/origine/téléchargement et rendu des données échappées avec aide Google. Ce sont des tests locaux avec réponses simulées, pas des essais des serveurs Bambu.

Le navigateur Chromium du poste de développement ne démarre pas (création de socket interdite). Le rendu et les clics réels restent donc à vérifier après déploiement, sur desktop/mobile et en FR/EN. Aucun déploiement ni login réel effectué par l’IA.

Recette utilisateur : créer un compte Bambu, terminer la vérification, contrôler l’inventaire et télécharger le log ; tester ensuite un second compte sans effet sur le premier. Si refus, examiner le journal filtré pour corriger sur une réponse réelle. Le pilote MQTT, l’import explicite dans le parc, les sites/organisations, les commandes, fichiers et caméra cloud sont des jalons distincts (#79). L’urgence machine #78 reste ouverte et indépendante.

## Correctif vérification email · 19 novembre 2026

Le journal matériel relève `login` HTTP 200 avec `loginType=verifyCode`, puis `sendemail/code` HTTP 200 non JSON, suivi de `cloud-response`. Valentin confirme deux emails avec le même code. Le second appel d’envoi automatique est supprimé ; le champ à six chiffres est ouvert directement après la réponse du login. La validation du code et la lecture des machines restent strictement JSON. Aucun nouvel email n’a été demandé pour diagnostiquer le problème ; lecture seule des logs du LXC 119. Libellé du formulaire : « Adresse email cloud ».
