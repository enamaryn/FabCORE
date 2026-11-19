# Protocoles et compatibilité FabCore

Relevé du 19 novembre 2026, base FabCore `7d1e6a4`. Ce dossier décrit le code existant et les observations connues ; il ne transforme pas une possibilité documentée en fonction testée. Aucun secret, code LAN ou jeton ne doit y figurer.

| Fabricant / famille | Modèles ou accès couverts | Dossier |
| --- | --- | --- |
| Bambu Lab | P2S ; autres modèles non validés dans FabCore | [LAN](BAMBU-LAN.md), [recherche cloud](BAMBU-CLOUD.md) |
| Elegoo | Centauri Carbon (CC1), Centauri Carbon 2 avec/sans CANVAS | [LAN et commandes](ELEGOO-LAN.md) |
| xTool | M2, identité JS002, protocole WS-V2 | [LAN et caméras](XTOOL-M2-LAN.md) |
| Klipper, OctoPrint, PrusaLink | Familles d’API ; compatibilité dépend du firmware et du modèle | [API HTTP locales](HTTP-LAN.md) |
| Résine, autres CNC/lasers et autres fabricants | Aucun connecteur générique validé dans le POC | Pas de capacité déduite de la seule présence sur le réseau |

Recherche approfondie Bambu : [audit du code Rust/Python, contradictions et essais locaux](BAMBU-CLOUD-AUDIT.md).

Contrat de développement : [CONNECTORS.md](../../poc/CONNECTORS.md). Phase : [POC](../POC.md), architecture future : [MVP](../MVP.md).

## Ordre de travail

1. [Urgence #78](https://github.com/enamaryn/FabCORE/issues/78) : qualifier l’arrêt d’urgence par modèle et corriger le suivi Pause/Stop CC2.
2. [Cloud Bambu #79](https://github.com/enamaryn/FabCORE/issues/79) : comptes multiples, authentification et lecture seule, puis commandes/fichiers/vidéo par capacités prouvées.
3. Reprendre la recette matérielle POC-10. Aucun test simulé ne remplace la recette matérielle.

## Règles communes

- Réutiliser les sessions persistantes ; aucune commande conservée hors ligne ni rejouée après reconnexion.
- Distinguer découverte, identité vérifiée, authentification, commande acceptée et état final confirmé.
- `stop` = annulation contrôlée. L’urgence logicielle est une capacité séparée, dépendante du réseau et du firmware ; ce n’est pas un dispositif matériel de sécurité.
- Une capacité absente reste explicitement indisponible. Aucun numéro de commande extrapolé entre CC1/CC2 ou modèles Bambu/xTool.
- Un scan porte sur le réseau du serveur/agent, pas sur celui du navigateur. Les règles actuelles plafonnent au /24 privé. Réponse UDP et services reconnus ne garantissent pas une session opérationnelle.
- Pour toute recette, noter date, modèle, version firmware exacte, mode LAN/cloud, action, réponse native et état réellement observé. Si la version manque, écrire « non relevée ».
- En passant à un autre firmware, requalifier les commandes sensibles ; dater et sourcer la modification de cette fiche.
