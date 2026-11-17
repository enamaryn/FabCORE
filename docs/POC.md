# POC FabCore

## Jalon en cours

Finaliser la recette de découverte réseau sur le LXC. Vérifier qu’OctoPrint est trouvé même sans imprimante branchée et que la P2S et les deux Elegoo apparaissent comme déjà ajoutées. Les améliorations de scan sont incluses dans la [PR #29](https://github.com/enamaryn/FabCORE/pull/29), fusionnée. La recette sur le réseau réel reste à confirmer.

## Gestion du parc

La suppression d’une machine et le correctif d’accès à `fabcore-update` dans les LXC sont fusionnés dans la [PR #35](https://github.com/enamaryn/FabCORE/pull/35). Le parcours HTTP couvre les droits Observateur, la suppression persistante et le réajout. La suppression depuis le navigateur sur le LXC reste à confirmer.

## Ensuite

1. Visualiseur G-code par couches, avec ouverture d’un fichier local et distinction des extrusions et déplacements à vide. [Ticket #31](https://github.com/enamaryn/FabCORE/issues/31)
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
