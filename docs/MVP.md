# MVP FabCore

**État : planifié.** La phase active est le [POC](POC.md).

## Agent local pour FabCore Cloud

Le SaaS est hébergé sur un VPS ou serveur dédié. Un agent par atelier, sur Raspberry Pi ou LXC, découvre les machines sur le LAN et remonte leur télémétrie par une connexion sortante authentifiée.

Pour le pilote, valider l’appairage, la découverte, le suivi navigateur fermé, la reconnexion après coupure et l’isolation entre deux clients qui utilisent les mêmes adresses privées. [Ticket #30](https://github.com/enamaryn/FabCORE/issues/30)

Autres jalons MVP à préciser à la clôture du POC.
