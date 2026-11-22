# POC v0

Preuve de concept FabCore clôturée le **22 novembre 2026** après validation utilisateur sur Bambu Lab P2S et deux Elegoo Centauri Carbon 2.

## Référence

- Tag prévu : `poc-v0`.
- Commit cible : `6f52f76138973b7dd80ba47de1c243eef81c0d66` (fusion de la PR #96).
- Publication : **brouillon uniquement**, à valider par Valentin.

## Acquis

- Parc, découverte et prévention des doublons ; authentification locale et Pocket ID/OIDC.
- P2S LAN : suivi, températures, caméra, AMS et pilotage confirmés après activation du mode développeur.
- Deux CC2 : supervision, chauffe/coupure buse et plateau, Pause/Stop ; fichiers internes visibles et lancement depuis ces fichiers confirmé.
- Gestion de fichiers, téléchargement, transfert simple et visualiseur ; journaux machine/compte et diagnostic des refus.
- Base automatisée : 139 tests réussis lors du correctif #96.

## Limites conservées

Reprise CC2 indisponible dans FabCore. Cloud Bambu validé en lecture seulement ; caméra et pilotage cloud non validés. Klipper, Longer et les autres familles conservent leur niveau de recette documenté. Transfert multiple/lancement en lot et audit exhaustif des droits restent à terminer. Un arrêt réseau est logiciel et ne remplace pas une sécurité matérielle.

Cette version clôture les risques techniques principaux du POC ; elle n'est pas un MVP de production. Aucun changement de données, de mode de connexion ou de firmware n'est requis par cette release documentaire. Ne jamais joindre les configurations et secrets de l'installation aux fichiers de release.

## Suite

Migration progressive TypeScript strict / React / PostgreSQL / SSE, avec conservation des connecteurs et tests. Bilan et plan proposés dans la PR documentaire de clôture ; leur fusion n'est pas une migration ni un déploiement.
