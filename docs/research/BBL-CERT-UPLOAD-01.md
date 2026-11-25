# BBL-CERT-UPLOAD-01 — Import manuel de certificats Bambu

Cette interface d'administration ajoute trois fichiers PEM **globaux à cette installation FabCore** dans l'écran historique « Comptes cloud » :

- `key.pem` : clé privée RSA (2048 bits minimum).
- `chain.pem` : exactement trois certificats X.509 (feuille, intermédiaire, racine) ; la clé privée doit correspondre au certificat feuille. La chaîne est vérifiée cryptographiquement.
- `crl.pem` : liste de révocation X.509 au format PEM. **La validité cryptographique, la date et la signature de cette CRL ne sont pas encore vérifiées** : ne pas considérer son import comme une preuve de validité ou d'autorisation.

## Sécurité

- POST `/api/cloud-certificates` et GET `/api/cloud-certificates` : administrateur connecté uniquement ; requête POST à origine vérifiée, corps JSON borné (160 Kio), protection contre les répétitions.
- Les fichiers sont chiffrés au repos avec AES-256-GCM dans `<FABCORE_DATA_DIR>/bambu-application-credentials/credentials.enc` ; clé locale dans `vault.key` (permissions 0600), dossier 0700.
- L'API GET et l'interface renvoient uniquement le statut, l'horodatage et l'empreinte de la feuille. Aucun accès à la clé privée via l'API.
- **Sauvegardes** : conserver la clé du coffre et le blob chiffré ensemble ; la perte de `vault.key` rend les secrets inaccessibles. Ne jamais inclure ces fichiers dans Git ni les journaux.
- L'import est un stockage administratif : aucun enregistrement de certificat sur l'imprimante, aucune commande signée, aucun pilotage activé.
- Le stockage global n'est pas encore compatible avec un déploiement multi-instance sur hôtes distincts.

## Cœur de pilotage signé (ajouté — non branché sur le `send` machine)

Pour préparer le pilotage en **mode cloud sans Mode Développeur** (le firmware sécurisé
rejette les commandes `print.*` non signées), cette PR ajoute le **cœur crypto** réutilisable,
testé en isolation, mais **ne modifie pas encore** le chemin de commande du connecteur :

- **4ᵉ champ optionnel `refreshUrl`** (le « trigger-url » `…/applications/<leaf-CN>/cert?aes256=…`,
  réutilisable) : stocké chiffré avec les 3 PEM. La CRL n'est valable qu'~1 mois ; un job serveur
  pourra rejouer cette URL pour renouveler cert+clé+CRL sans réimport.
- `poc/bambu-signing.mjs` : enveloppe signée vérifiée sur matériel — header **en premier**,
  octets signés `{"print":<section>}` en JSON compact **clés triées**, `cert_id` = serial(hex)+issuer,
  `sequence_id` **chaîne** et croissant, `param`/`url` chiffrés en `param_enc`/`url_enc` vers le
  certificat de l'imprimante ; plus l'enveloppe `security.app_cert_install`.
- `poc/bambu-credential-refresh.mjs` : GET du `refreshUrl` → déchiffrement du blob `key`
  (AES-256-CTR à S-box, portage **AGPL-3.0** de danielwoz/BambuSlicerKeySaver et
  Bambuzled/BambuKeySaver) → reconstruction RSA → `{key, chain, crl}` frais.
- Coffre : `load()` (lecture interne des secrets, jamais exposée via HTTP) et `refresh()`.
- Tests : `poc/bambu-signing.test.mjs` (signature vérifiée contre la clé du leaf, `param_enc`
  déchiffrable, round-trip du blob clé). `npm run check` complet à exécuter en CI (Node ≥ 24).

**Reste à faire (incrément suivant, changement de comportement machine à part)** : brancher
`createBambuSigner` dans `createP2SMonitor` — installer le cert à la connexion, capturer
`printer_cert` depuis la réponse, signer les `print.*` dans `send()` — gardé pour ne rien changer
quand aucun certificat n'est configuré ; puis recette matérielle.

## Sources et limites

- [Bamboo Sense (fork de recherche)](https://github.com/enamaryn/bamboo-sense)
- [CRACK.md](https://github.com/enamaryn/bamboo-sense/blob/main/docs/CRACK.md)
- [Bambu Studio](https://github.com/bambulab/BambuStudio)
- [node:crypto](https://nodejs.org/api/crypto.html)

La documentation de Bamboo Sense inclut l'extraction d'identifiants privés d'un logiciel officiel et un mécanisme de certificat accepté sans validation complète. **Cette PR n'implémente aucun de ces mécanismes**, ne modifie pas l'autorisation du firmware et ne valide aucun accès partenaire Bambu.

## Recette manuelle

1. Connecter un administrateur, ouvrir « Comptes cloud », constater « Aucun certificat importé ».
2. Cliquer « Importer 3 fichiers PEM » ; vérifier les 3 champs de sélection et la traduction FR/EN.
3. Soumettre des fichiers invalides : réponse 400, ancien coffre inchangé.
4. Soumettre un jeu de laboratoire cohérent avec chaîne valide : statut configuré, empreinte SHA-256 ; redémarrer le serveur et vérifier la persistance.
5. S'assurer qu'aucune clé privée ni contenu PEM n'apparaît dans l'API GET, le navigateur après envoi, les logs ou Git.
6. Vérifier qu'un observateur ne peut ni consulter le statut ni importer de fichiers.
7. Confirmer que la supervision des comptes cloud et les connecteurs Bambu existants restent inchangés.
