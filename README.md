<h1 align="center">FabCore</h1>

<p align="center"><strong>Suivez vos imprimantes 3D depuis un seul tableau de bord.</strong></p>

<p align="center">
Gardez un œil sur vos fabrications, ouvrez les caméras en direct et voyez quelles bobines sont chargées. FabCore s’installe sur votre serveur et se connecte aux machines de votre atelier.
</p>

<p align="center">
<a href="#installation"><strong>Installer FabCore</strong></a> ·
<a href="#machines-compatibles">Voir les machines compatibles</a> ·
<a href="poc/README.md">Lire le guide de configuration</a>
</p>

![Tableau de bord FabCore avec le parc et l’activité récente](docs/screenshots/vue-ensemble.webp)

## Ce que vous pouvez faire

- **Suivre vos fabrications.** Retrouvez l’état des machines, les températures et l’avancement sur une même page. Mettez en pause ou reprenez une impression Klipper depuis la fiche de la machine.
- **Voir la pièce en cours.** Ouvrez la caméra d’une Bambu Lab P2S ou d’une Elegoo Centauri Carbon compatible depuis sa fiche.
- **Repérer la bonne bobine.** Consultez les emplacements AMS et CANVAS, leur occupation, la matière, la couleur et l’emplacement actif selon les données fournies par l’imprimante.
- **Gérer les accès.** Créez des comptes Observateur en lecture seule ou connectez votre fournisseur OIDC, comme [Pocket ID](poc/README.md#connexion-oidc-avec-pocket-id).
- **Diagnostiquer une coupure.** Filtrez le journal par machine et vérifiez l’heure du dernier rapport MQTT et de la dernière image reçue.
- **Préparer les notifications.** Configurez [ntfy interne ou externe et SMTP](poc/README.md#notifications-ntfy-et-smtp), puis envoyez une notification de test.

## Machines compatibles

| Machine | État | Caméra | Filaments | Commandes |
| --- | --- | --- | --- | --- |
| Klipper avec Moonraker | Oui | — | — | Pause et reprise |
| OctoPrint | Oui | — | — | — |
| Bambu Lab P2S | Oui | Oui | AMS | — |
| Elegoo Centauri Carbon (CC1) | Oui | Oui | — | — |
| Elegoo Centauri Carbon 2 (CC2) | Oui | Oui | CANVAS | — |
| xTool M2 | Supervision expérimentale | — | — | — |

La connexion et les fonctions locales dépendent du modèle, du micrologiciel et des réglages réseau de la machine.

## Installation

**Debian ou Ubuntu**, sur un serveur personnel ou dans un **LXC Proxmox**. Pour démarrer avec un petit parc, prévoir **1 vCPU, 512 Mo de RAM et 1 Go d’espace libre** en plus du système. Le serveur doit pouvoir joindre les machines sur le réseau local. Un usage régulier des caméras peut demander davantage de ressources.

Avec `curl` installé, lancez cette commande depuis le dossier dans lequel vous voulez créer `FabCORE/`.

```bash
installer=$(curl -fsSL https://raw.githubusercontent.com/enamaryn/FabCORE/main/scripts/install.sh) && bash -c "$installer"
```

Le script télécharge le projet, installe les dépendances manquantes, dont Node.js 24 et FFmpeg, puis lance FabCore dans le terminal. Il utilise `sudo` pour les paquets système si nécessaire. Dans un LXC Debian minimal, installez d’abord `curl` en root avec `apt-get update && apt-get install -y curl`. Si vous avez déjà cloné le dépôt, lancez `bash scripts/install.sh` depuis sa racine.

Ouvrez <http://127.0.0.1:3000> et utilisez le jeton affiché pour créer votre compte administrateur. Pour un serveur distant, suivre le [guide d’accès par tunnel SSH ou reverse proxy HTTPS](poc/README.md#4-ouvrir-linterface).

## Ajoutez votre première machine

Lancez la **découverte réseau** depuis **Ajouter une machine**. FabCore préremplit les informations trouvées. Renseignez le code d’accès si la machine en demande un, puis testez la connexion. Vous pouvez aussi saisir son adresse IP manuellement.

![Ajout d’une Bambu Lab P2S après découverte réseau avec des données d’exemple](docs/screenshots/ajout-machine.webp)

La bibliothèque de fichiers, le transfert vers les imprimantes compatibles et les alertes automatiques de fabrication sont prévus. [Consulter la licence](LICENSE).
