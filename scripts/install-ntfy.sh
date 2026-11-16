#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $EUID != 0 ]]; then
  echo 'Exécuter avec sudo depuis le dossier FabCore.' >&2
  exit 1
fi
app_user=${1:-${SUDO_USER:-}}
app_data=${2:-$PWD/.fabcore}
service=fabcore-ntfy.service
config=/etc/fabcore-ntfy
data=/var/lib/fabcore-ntfy
binary=/usr/local/lib/fabcore-ntfy/ntfy
if [[ -z $app_user || $app_data != /* || ! -f poc/notifications.mjs ]]; then
  echo 'Usage depuis le dépôt : sudo bash scripts/install-ntfy.sh UTILISATEUR /chemin/données/fabcore' >&2
  exit 1
fi
app_group=$(id -gn "$app_user")
if [[ -f "$app_data/ntfy-internal.json" && -f "/etc/systemd/system/$service" ]]; then
  systemctl is-active "$service"
  exit
fi
if [[ -e $config || -e $data || -e $binary || -e "/etc/systemd/system/$service" ]]; then
  echo 'Installation ntfy FabCore partielle ou existante. Vérifier le service avant de continuer.' >&2
  exit 1
fi
for prerequisite in apt-get dpkg-deb curl gpg openssl runuser systemctl ss; do
  command -v "$prerequisite" >/dev/null || { echo "Prérequis manquant : $prerequisite" >&2; exit 1; }
done
if ss -H -lnt 'sport = :8086' | grep -q .; then
  echo 'Le port 8086 est déjà utilisé.' >&2
  exit 1
fi
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
chmod 755 "$tmp"
cd "$tmp"
curl -fsSL https://archive.ntfy.sh/apt/keyring.gpg -o ntfy.gpg
fingerprint=$(gpg --batch --show-keys --with-colons ntfy.gpg | awk -F: '$1 == "fpr" && !first++ {print $10}')
[[ $fingerprint == 55BA774A6F5EE67431E4B6B7CFDB962D4F1EC4AF ]]
install -m 0644 ntfy.gpg ntfy-archive.gpg
printf 'deb [signed-by=%s/ntfy-archive.gpg] https://archive.ntfy.sh/apt stable main\n' "$tmp" > ntfy.list
chmod 644 ntfy.list
install -d -m 0755 lists
apt_options=(-o "Dir::Etc::sourcelist=$tmp/ntfy.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$tmp/lists")
apt-get "${apt_options[@]}" update
apt-get "${apt_options[@]}" download ntfy
dpkg-deb -x ./ntfy_*.deb package

getent passwd fabcore-ntfy >/dev/null || useradd --system --user-group --home-dir "$data" --shell /usr/sbin/nologin fabcore-ntfy
install -D -m 0755 package/usr/bin/ntfy "$binary"
install -d -m 0750 -o root -g fabcore-ntfy "$config"
install -d -m 0700 -o fabcore-ntfy -g fabcore-ntfy "$data"
cat > "$config/server.yml" <<'YAML'
listen-http: "127.0.0.1:8086"
base-url: "http://127.0.0.1:8086"
cache-file: "/var/lib/fabcore-ntfy/cache.db"
auth-file: "/var/lib/fabcore-ntfy/auth.db"
auth-default-access: "deny-all"
enable-login: true
YAML
chgrp fabcore-ntfy "$config/server.yml"
chmod 640 "$config/server.yml"
export NTFY_CONFIG_FILE="$config/server.yml"
publisher=$(openssl rand -hex 24)
subscriber=$(openssl rand -hex 24)
NTFY_PASSWORD="$publisher" runuser -u fabcore-ntfy -- "$binary" user add fabcore-publisher
NTFY_PASSWORD="$subscriber" runuser -u fabcore-ntfy -- "$binary" user add fabcore-subscriber
runuser -u fabcore-ntfy -- "$binary" access fabcore-publisher fabcore wo
runuser -u fabcore-ntfy -- "$binary" access fabcore-subscriber fabcore ro
printf 'Identifiant : fabcore-subscriber\nMot de passe : %s\nSujet : fabcore\n' "$subscriber" > "$config/subscriber.txt"
cat > "/etc/systemd/system/$service" <<'UNIT'
[Unit]
Description=Serveur ntfy local pour FabCore
After=network.target

[Service]
User=fabcore-ntfy
Group=fabcore-ntfy
ExecStart=/usr/local/lib/fabcore-ntfy/ntfy serve --config /etc/fabcore-ntfy/server.yml
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$service"
curl -fsS --retry 4 --retry-connrefused --max-time 3 http://127.0.0.1:8086/v1/health >/dev/null
if [[ ! -d $app_data ]]; then install -d -m 0700 -o "$app_user" -g "$app_group" "$app_data"; fi
printf '{"url":"http://127.0.0.1:8086","topic":"fabcore","auth":"basic","username":"fabcore-publisher","secret":"%s"}\n' "$publisher" > ntfy-internal.json
install -m 0600 -o "$app_user" -g "$app_group" ntfy-internal.json "$app_data/ntfy-internal.json"
printf 'ntfy prêt. Dans FabCore, choisissez Serveur interne. Accès de lecture : %s/subscriber.txt\n' "$config"
