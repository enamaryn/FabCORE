# POC FabCore

## Jalon en cours

Finaliser la recette de découverte réseau sur le LXC. Vérifier qu’OctoPrint est trouvé même sans imprimante branchée et que la P2S et les deux Elegoo apparaissent comme déjà ajoutées. Les améliorations de scan sont incluses dans la [PR #29](https://github.com/enamaryn/FabCORE/pull/29), fusionnée. OctoPrint est confirmé sur le réseau réel. La recette porte maintenant sur les CC2 avec ou sans code LAN enregistré, la xTool M2 et la stabilité de la réponse P2S. Le matériel xTool répond au WebSocket LAN mais refuse l’identification avec un code 406. La découverte UDP V2 permet de lire le modèle M2 et le numéro de série avant la connexion de suivi, qui nécessite un appairage sur le firmware testé. Depuis le formulaire xTool, « Appairer la M2 » lance l’attente de la confirmation physique, puis enregistre la machine et son jeton côté serveur. La confirmation physique sur la M2 a renvoyé TOKEN_AUTHORIZED et son identité. Le firmware émet l’état en push puis acquitte state/sync avec une réponse vide. Le connecteur attend ces deux messages et accepte le format push réel {mode: "Idle"}. La recette complète après correction reste à confirmer. Référence de protocole : [ha-xtool](https://github.com/thecodingdad/ha-xtool/blob/main/docs/PROTOCOL.md). Le formulaire affiche le numéro de série fourni par le scan ou le test de connexion pour les connecteurs qui le remontent. Les champs de saisie prévus par Bambu et la CC1 restent disponibles. L’essai du formulaire dans le navigateur reste à confirmer.

## Gestion du parc

« Ajouter une machine » ouvre la détection réseau, avec le choix entre lancer le scan et la saisie manuelle.

L’ajout d’une nouvelle CC2 réutilise le test réussi pendant une minute dans la même session si l’adresse et le code LAN correspondent. Le parcours HTTP couvre aussi l’ajout direct. Essai sur le LXC à confirmer.

La suppression d’une machine et le correctif d’accès à `fabcore-update` dans les LXC sont fusionnés dans la [PR #35](https://github.com/enamaryn/FabCORE/pull/35). Le parcours HTTP couvre les droits Observateur, la suppression persistante et le réajout. Le bouton « Modifier la machine » est dans l’en-tête de la fiche, à côté de « Retour au parc ». La suppression se fait depuis cette fenêtre de modification. La suppression depuis le navigateur sur le LXC reste à confirmer.

## Ensuite

1. Visualiseur G-code par couches, avec ouverture d’un fichier local et distinction des extrusions et déplacements à vide. [Ticket #31](https://github.com/enamaryn/FabCORE/issues/31) · en PR : panneau **Fichiers de la machine** (liste, envoi, lancement d’impression) et visualiseur en direct sur la fiche Moonraker et OctoPrint, analyse dans `poc/gcode.mjs`. Reste à valider sur l’Ender 3 et OctoPrint avec des fichiers réels de PrusaSlicer, Cura, Orca et Bambu Studio.
2. Terminal G-code pour les connecteurs compatibles, à valider sur Moonraker et OctoPrint. [Ticket #32](https://github.com/enamaryn/FabCORE/issues/32)

## Jalons fusionnés

| Jalon | PR |
| --- | --- |
| POC-01 · Activation et Klipper | [#2](https://github.com/enamaryn/FabCORE/pull/2) |
| POC-02 · Bambu P2S | [#4](https://github.com/enamaryn/FabCORE/pull/4) |
| POC-03 · Elegoo CC1 et CC2 | [#5](https://github.com/enamaryn/FabCORE/pull/5) |
| POC-04 · Découverte réseau | [#6](https://github.com/enamaryn/FabCORE/pull/6) |
| POC-05 · Caméras Elegoo | [#7](https://github.com/enamaryn/FabCORE/pull/7) |
| POC-06 · Pause, reprise et rôles | [#9](https://github.com/enamaryn/FabCORE/pull/9) |
| POC-07 · Pocket ID et OIDC | [#10](https://github.com/enamaryn/FabCORE/pull/10) |
| POC-08 · ntfy et SMTP | [#11](https://github.com/enamaryn/FabCORE/pull/11) |
| OctoPrint, PrusaLink et registre des connecteurs | [#25](https://github.com/enamaryn/FabCORE/pull/25), [#29](https://github.com/enamaryn/FabCORE/pull/29) |

[Guide d’exploitation et de configuration](../poc/README.md)
