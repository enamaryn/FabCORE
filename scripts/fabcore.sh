#!/usr/bin/env bash
# Commande d'administration FabCore : `fabcore <commande>`. Voir `fabcore help`.
# Configuration lue dans l'environnement, sinon dans le service systemd `fabcore` de cette installation
# (Environment= et EnvironmentFile=). L'URL PostgreSQL n'est jamais affichée ni passée en argument.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$root"
service=${FABCORE_SERVICE:-fabcore}
keep=${FABCORE_BACKUP_KEEP:-10}

fail() { printf 'fabcore : %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage : fabcore <commande> [options]

  update [--check] [--no-backup]  Met FabCore à jour depuis GitHub main, après une sauvegarde automatique
  backup                          Sauvegarde données, clés et base PostgreSQL dans une archive horodatée
  backups                         Liste les sauvegardes
  restore <archive> [--check] [--yes]
                                  Remet une sauvegarde en place (--check : vérifie seulement, sans rien modifier)
  import [--apply]                Importe state.json dans PostgreSQL (simulation sans --apply)
  database check                  Vérifie la base configurée : connexion, TLS, version ≥ 16, droits
  database setup [--yes]          Tout-en-un : installe PostgreSQL local, crée la base, importe et bascule le service
  status                          Version, service, stockage et dernière sauvegarde
  help                            Cette aide

Variables : FABCORE_DATA (données, .fabcore par défaut), FABCORE_DATABASE_URL (PostgreSQL ; ou fichier FABCORE_CONFIG),
FABCORE_BACKUPS (archives, .fabcore-backups par défaut), FABCORE_BACKUP_KEEP (10 par défaut).
EOF
}

# Service systemd de cette installation seulement (même dossier de travail).
own_service() {
  [[ $service != none ]] && command -v systemctl >/dev/null &&
    [[ $(systemctl show "$service" -p WorkingDirectory --value 2>/dev/null) == "$root" ]]
}
service_running() { own_service && systemctl is-active --quiet "$service"; }

# Fichier NOM=valeur (EnvironmentFile de systemd ou FABCORE_CONFIG) : dernière valeur de la variable.
env_file_value() {
  local name=$1 file=$2 line value=''
  [[ -r $file ]] || return 0
  while IFS= read -r line; do
    line=${line#export }
    if [[ $line == "$name="* ]]; then value=${line#*=}; value=${value#[\"\']}; value=${value%[\"\']}; fi
  done < "$file"
  printf '%s' "$value"
}

# Valeur d'une variable : environnement, puis Environment= et EnvironmentFile= du service, puis FABCORE_CONFIG.
config() {
  local name=$1 value=${!1:-} file line found
  if [[ -n $value ]]; then printf '%s' "$value"; return; fi
  if own_service; then
    local words=()
    read -r -a words <<< "$(systemctl show "$service" -p Environment --value 2>/dev/null)"
    for line in "${words[@]}"; do
      if [[ $line == "$name="* ]]; then value=${line#*=}; fi
    done
    while read -r file _; do
      found=$(env_file_value "$name" "${file#-}")
      [[ -z $found ]] || value=$found
    done < <(systemctl show "$service" -p EnvironmentFiles --value 2>/dev/null | tr ' ' '\n' | grep -v '^(' || true)
  fi
  if [[ -z $value && $name != FABCORE_CONFIG ]]; then
    file=$(config FABCORE_CONFIG)
    [[ -z $file ]] || value=$(env_file_value "$name" "$file")
  fi
  printf '%s' "$value"
}

absolute() { if [[ $1 == /* ]]; then printf '%s' "$1"; else printf '%s' "$root/$1"; fi; }
data=$(absolute "$(config FABCORE_DATA)"); [[ $data != "$root/" ]] || data="$root/.fabcore"
backups=$(absolute "${FABCORE_BACKUPS:-.fabcore-backups}")
database_url=$(config FABCORE_DATABASE_URL)
# Configuration de la base transmise aux outils Node par l'environnement du processus, jamais en argument.
for variable in FABCORE_CONFIG FABCORE_DATABASE_URL FABCORE_DATABASE_SSL FABCORE_DATABASE_CA_FILE FABCORE_DATABASE_POOL_MAX FABCORE_DATABASE_CONNECT_TIMEOUT_MS; do
  value=$(config "$variable")
  if [[ -n $value ]]; then export "$variable=$value"; fi
done
unset variable value

with_database() {
  [[ -n $database_url ]] || fail 'FABCORE_DATABASE_URL non configuré.'
  command -v node >/dev/null || fail 'Node.js introuvable.'
  local env
  env=$(node scripts/database.mjs env "$@") || fail 'base PostgreSQL inaccessible ou encore utilisée.'
  eval "$env"
}

# pg_dump/pg_restore de la version majeure du serveur : un client plus récent écrit des réglages (ex.
# transaction_timeout en 17) que le serveur refuse à la restauration, et une archive qu'un outil plus ancien ne lit pas.
# Appeler après with_database. Définit pg_dump_bin et pg_restore_bin.
need_pg_tools() {
  local tool dir="/usr/lib/postgresql/$FABCORE_PG_MAJOR/bin" path
  for tool in pg_dump pg_restore; do
    path=''
    if [[ -x $dir/$tool ]]; then path=$dir/$tool
    elif command -v "$tool" >/dev/null && [[ $("$tool" --version | grep -oE '[0-9]+' | head -n 1) == "$FABCORE_PG_MAJOR" ]]; then path=$(command -v "$tool")
    fi
    [[ -n $path ]] || fail "$tool $FABCORE_PG_MAJOR introuvable : installer postgresql-client-$FABCORE_PG_MAJOR (même version majeure que le serveur)."
    printf -v "${tool}_bin" '%s' "$path"
  done
}

json_field() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$2" | head -n 1; }

prune() {
  local old
  (( keep > 0 )) || return 0
  while IFS= read -r old; do
    rm -f -- "$old" "$old.sha256"
  done < <(ls -1t -- "$backups"/fabcore-backup-*.tar.gz 2>/dev/null | tail -n +"$((keep + 1))")
}

# Sous-shell : nettoyage garanti. Appelée par les autres commandes via `bash fabcore.sh backup --label`,
# pour que toute erreur interrompe la sauvegarde (set -e ne s'applique pas dans un `cmd || …`).
cmd_backup() (
  local label=${1:-manuel} stamp name work storage=json commit
  [[ -d $data ]] || fail "dossier de données introuvable : $data"
  umask 077
  mkdir -p -- "$backups"
  stamp=$(date -u +%Y%m%d-%H%M%S)
  name="fabcore-backup-$stamp-$label"
  local n=1
  while [[ -e $backups/$name.tar.gz ]]; do n=$((n + 1)); name="fabcore-backup-$stamp-$label-$n"; done
  work=$(mktemp -d "$backups/.backup.XXXXXXXX")
  trap 'rm -rf -- "$work"' EXIT
  # state.json est remplacé atomiquement : une copie à chaud reste cohérente. Un envoi de fichier en cours peut manquer.
  tar -C "$data" -cf "$work/data.tar" .
  if [[ -n $database_url ]]; then
    with_database
    need_pg_tools
    storage=postgresql
    "$pg_dump_bin" --format=custom --no-owner --no-privileges --schema="$FABCORE_PG_SCHEMA" --file="$work/database.dump"
  fi
  commit=$(git rev-parse HEAD 2>/dev/null || echo inconnu)
  printf '{\n  "format": 1,\n  "created": "%s",\n  "commit": "%s",\n  "storage": "%s",\n  "schema": "%s"\n}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$commit" "$storage" "${FABCORE_PG_SCHEMA:-}" > "$work/manifest.json"
  tar -C "$work" -czf "$work/archive.tar.gz" manifest.json data.tar $([[ $storage == postgresql ]] && echo database.dump)
  mv -T -- "$work/archive.tar.gz" "$backups/$name.tar.gz"
  (cd -- "$backups" && sha256sum -- "$name.tar.gz" > "$name.tar.gz.sha256")
  prune
  printf 'Sauvegarde (%s) : %s\n' "$storage" "$backups/$name.tar.gz"
)
backup_step() { bash "$root/scripts/fabcore.sh" backup --label "$1"; }

cmd_backups() {
  local file found=false
  for file in $(ls -1t -- "$backups"/fabcore-backup-*.tar.gz 2>/dev/null); do
    found=true
    printf '%s  %s\n' "$(du -h -- "$file" | cut -f1)" "$file"
  done
  "$found" || echo "Aucune sauvegarde dans $backups."
}

cmd_restore() (
  local archive='' check=false yes=false work storage was_running=false previous stamp
  while (( $# )); do
    case $1 in
      --check) check=true ;;
      --yes) yes=true ;;
      -*) fail "option inconnue : $1" ;;
      *) [[ -z $archive ]] || fail 'une seule archive.'; archive=$1 ;;
    esac
    shift
  done
  [[ -n $archive ]] || fail 'Usage : fabcore restore <archive> [--check] [--yes]'
  [[ -f $archive ]] || fail "archive introuvable : $archive"
  archive=$(cd -- "$(dirname -- "$archive")" && pwd -P)/$(basename -- "$archive")
  if [[ -f $archive.sha256 ]]; then
    (cd -- "$(dirname -- "$archive")" && sha256sum --check --status -- "$(basename -- "$archive").sha256") || fail 'empreinte SHA-256 différente : archive altérée.'
  else
    echo 'Attention : aucune empreinte .sha256 à côté de l’archive, intégrité non vérifiée.' >&2
  fi
  work=$(mktemp -d)
  trap 'rm -rf -- "$work"' EXIT
  tar -C "$work" -xzf "$archive" manifest.json data.tar 2>/dev/null || fail 'archive illisible ou incomplète.'
  [[ $(sed -n 's/.*"format": *\([0-9]*\).*/\1/p' "$work/manifest.json") == 1 ]] || fail 'format de sauvegarde inconnu.'
  storage=$(json_field storage "$work/manifest.json")
  mkdir -- "$work/data"
  tar -C "$work/data" -xf "$work/data.tar" || fail 'données illisibles dans l’archive.'
  if [[ -f $work/data/state.json ]]; then
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$work/data/state.json" 2>/dev/null || fail 'state.json invalide dans l’archive.'
  fi
  if [[ $storage == postgresql ]]; then
    [[ -n $database_url ]] || fail 'sauvegarde PostgreSQL : configurer FABCORE_DATABASE_URL avant de restaurer.'
    with_database
    need_pg_tools
    tar -C "$work" -xzf "$archive" database.dump || fail 'dump PostgreSQL absent de l’archive.'
    "$pg_restore_bin" --list "$work/database.dump" >/dev/null || fail 'dump PostgreSQL illisible.'
  elif [[ -n $database_url ]]; then
    fail 'sauvegarde au format JSON alors que PostgreSQL est configuré : restaurer sans FABCORE_DATABASE_URL, puis réimporter avec fabcore import.'
  fi
  if "$check"; then
    printf 'Archive valide (%s, créée %s, version %s). Aucune modification.\n' "$storage" "$(json_field created "$work/manifest.json")" "$(json_field commit "$work/manifest.json")"
    return 0
  fi
  if ! "$yes"; then
    [[ -t 0 ]] || fail 'confirmation requise : relancer avec --yes.'
    printf 'Remplacer les données de %s%s par cette sauvegarde ? Une sauvegarde de l’état actuel est faite avant. Tapez RESTAURER : ' \
      "$data" "$([[ $storage == postgresql ]] && echo ' et la base PostgreSQL')"
    local answer; read -r answer
    [[ $answer == RESTAURER ]] || fail 'restauration annulée.'
  fi
  if service_running; then was_running=true; systemctl stop "$service"; fi
  restart() { if "$was_running"; then systemctl start "$service"; fi; }
  if [[ $storage == postgresql ]]; then
    # Le dump recrée son schéma d'origine : il doit être celui de la base configurée.
    (with_database --require-stopped
     [[ $(json_field schema "$work/manifest.json") == "$FABCORE_PG_SCHEMA" ]] || fail "schéma « $(json_field schema "$work/manifest.json") » de la sauvegarde différent du schéma configuré « $FABCORE_PG_SCHEMA »."
    ) || { restart; fail 'restauration annulée, rien n’a été modifié.'; }
  fi
  # Copie de l'état actuel avant tout remplacement ; en cas d'échec, rien n'est touché.
  if [[ -d $data ]] && [[ -n $(ls -A -- "$data") ]]; then
    backup_step avant-restauration || { restart; fail 'sauvegarde préalable impossible : restauration annulée.'; }
  fi
  stamp=$(date -u +%Y%m%d-%H%M%S)
  previous="$data.avant-restauration-$stamp"
  if [[ -e $data ]]; then mv -T -- "$data" "$previous"; fi
  mkdir -m 0700 -p -- "$data"
  if ! tar -C "$data" -xf "$work/data.tar"; then
    rm -rf -- "$data"; [[ -e $previous ]] && mv -T -- "$previous" "$data"
    restart; fail 'extraction impossible : données précédentes remises en place.'
  fi
  if [[ $storage == postgresql ]]; then
    with_database
    # Une seule transaction : en cas d'échec, la base reste inchangée.
    if ! "$pg_restore_bin" --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$PGDATABASE" "$work/database.dump"; then
      rm -rf -- "$data"; [[ -e $previous ]] && mv -T -- "$previous" "$data"
      restart; fail 'restauration PostgreSQL refusée : base et données précédentes conservées.'
    fi
  fi
  rm -rf -- "$previous"
  restart
  printf 'Sauvegarde restaurée (%s)%s.\n' "$storage" "$("$was_running" && echo ', service redémarré')"
)

cmd_status() {
  local last
  printf 'Version : %s\n' "$(git describe --always --dirty 2>/dev/null || echo inconnue)"
  if own_service; then printf 'Service %s : %s\n' "$service" "$(systemctl is-active "$service" 2>/dev/null || true)"; else echo 'Service : aucun service systemd pour ce dossier'; fi
  printf 'Données : %s\n' "$data"
  if [[ -n $database_url ]]; then echo 'Stockage : PostgreSQL (FABCORE_DATABASE_URL)'; else echo 'Stockage : state.json'; fi
  last=$(ls -1t -- "$backups"/fabcore-backup-*.tar.gz 2>/dev/null | head -n 1 || true)
  printf 'Dernière sauvegarde : %s\n' "${last:-aucune}"
}

cmd_update() {
  local check=false backup=true
  for argument in "$@"; do
    case $argument in
      --check) check=true ;;
      --no-backup) backup=false ;;
      *) fail "option inconnue : $argument" ;;
    esac
  done
  if "$check"; then exec bash scripts/update.sh --check; fi
  if "$backup"; then
    if [[ -d $data ]]; then backup_step avant-mise-a-jour || fail 'sauvegarde impossible : mise à jour annulée (--no-backup pour passer outre).'
    else echo 'Aucune donnée à sauvegarder.'; fi
  fi
  exec bash scripts/update.sh
}

# Tout-en-un (ADR 0007) : PostgreSQL ≥ 16 local, rôle et base `fabcore`, configuration 0600, import de state.json
# et bascule du service. Chaque étape est vérifiée ; avant la bascule, rien ne change pour le service en place.
cmd_database_setup() (
  local yes=false cluster version name port status password file dropin was_running=false candidate
  for argument in "$@"; do
    case $argument in --yes) yes=true ;; *) fail "option inconnue : $argument" ;; esac
  done
  (( EUID == 0 )) || fail 'à lancer en root (installation de paquets, rôle PostgreSQL, service).'
  [[ -z $database_url ]] || fail 'une base est déjà configurée : vérifier avec fabcore database check.'
  command -v apt-get >/dev/null && command -v node >/dev/null || fail 'Debian ou Ubuntu avec Node.js requis.'
  file=${FABCORE_DATABASE_ENV:-/etc/fabcore/database.env}
  # Jamais de rotation implicite du mot de passe d'une base déjà utilisée.
  [[ ! -e $file ]] || fail "$file existe déjà : base déjà préparée (fabcore database check). Le supprimer d'abord pour tout refaire."
  if ! "$yes"; then
    [[ -t 0 ]] || fail 'confirmation requise : relancer avec --yes.'
    printf 'Installer PostgreSQL local (paquets), créer le rôle et la base « fabcore », écrire %s,\npuis importer %s et basculer le service. Tapez POSTGRESQL : ' "$file" "$data/state.json"
    local answer; read -r answer
    [[ $answer == POSTGRESQL ]] || fail 'installation annulée.'
  fi

  # 1. Serveur : cluster en ligne ≥ 16, sinon installation (dépôt PGDG si la distribution fournit moins de 16).
  cluster() { pg_lsclusters --no-header 2>/dev/null | awk '$1 >= 16' | sort -k4,4r -k1,1nr | head -n 1; }
  if [[ -z $(cluster) ]]; then
    apt-get update -q
    candidate=$(apt-cache policy postgresql | awk '/Candidate:/ { print $2 }')
    if [[ ${candidate%%[!0-9]*} -ge 16 ]] 2>/dev/null; then apt-get install -y -q postgresql
    else
      apt-get install -y -q ca-certificates curl postgresql-common
      install -d /usr/share/postgresql-common/pgdg
      curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
      echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
      apt-get update -q && apt-get install -y -q postgresql-16
    fi
  fi
  read -r version name port status _ <<< "$(cluster)"
  [[ -n ${version:-} ]] || fail 'aucun cluster PostgreSQL 16 ou plus après installation.'
  if [[ $status != online ]]; then pg_ctlcluster "$version" "$name" start || fail "démarrage du cluster $version/$name impossible."; fi
  echo "PostgreSQL $version ($name, port $port)."

  # 2. Rôle et base ; mot de passe aléatoire transmis par l'entrée standard, jamais en argument.
  password=$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')
  runuser -u postgres -- psql -X -q -p "$port" -v ON_ERROR_STOP=1 -d postgres <<SQL || fail 'création du rôle ou de la base refusée.'
do \$\$ begin
  if exists (select from pg_roles where rolname = 'fabcore') then alter role fabcore login password '$password';
  else create role fabcore login password '$password'; end if;
end \$\$;
select 'create database fabcore owner fabcore' where not exists (select from pg_database where datname = 'fabcore') \gexec
SQL

  # 3. Configuration lue par systemd (EnvironmentFile, lu en root) ou par FABCORE_CONFIG : 0600, root.
  install -d -m 0755 "$(dirname -- "$file")"
  (umask 077; printf 'FABCORE_DATABASE_URL=postgresql://fabcore:%s@127.0.0.1:%s/fabcore\n' "$password" "$port" > "$file.tmp")
  mv -f -- "$file.tmp" "$file"
  FABCORE_CONFIG=$file node scripts/database.mjs check || fail "vérification de la base échouée ; configuration laissée dans $file, service inchangé."

  # 4. Bascule : arrêt, sauvegarde JSON, import transactionnel, puis service sur PostgreSQL.
  if service_running; then was_running=true; systemctl stop "$service"; fi
  restart_json() { if "$was_running"; then systemctl start "$service"; fi; }
  if [[ -f $data/state.json ]]; then
    backup_step avant-postgresql || { restart_json; fail 'sauvegarde impossible : bascule annulée, service inchangé.'; }
    FABCORE_CONFIG=$file node scripts/import-state.mjs --data "$data" --apply || { restart_json; fail 'import refusé (rapport ci-dessus) : service laissé sur state.json.'; }
  fi
  if own_service; then
    dropin="/etc/systemd/system/$service.service.d/database.conf"
    install -d -m 0755 "$(dirname -- "$dropin")"
    printf '[Service]\nEnvironmentFile=%s\n' "$file" > "$dropin"
    systemctl daemon-reload
    if ! systemctl start "$service" || ! { sleep 3; systemctl is-active --quiet "$service"; }; then
      rm -f -- "$dropin"; systemctl daemon-reload; restart_json
      fail "FabCore ne démarre pas sur PostgreSQL (journalctl -u $service) : retour à state.json, aucune donnée perdue."
    fi
    echo "FabCore utilise PostgreSQL (configuration : $file, service : $dropin)."
  else
    echo "Base prête. Démarrer FabCore avec FABCORE_CONFIG=$file (ou ses variables dans l'environnement)."
  fi
)

cmd_database() {
  case ${1:-} in
    check) exec node scripts/database.mjs check ;;
    setup) shift; cmd_database_setup "$@" ;;
    *) fail 'Usage : fabcore database check | setup [--yes]' ;;
  esac
}

cmd_import() {
  [[ -n $database_url ]] || fail 'FABCORE_DATABASE_URL non configuré.'
  exec node scripts/import-state.mjs --data "$data" "$@"
}

command=${1:-help}
shift || true
case $command in
  update) cmd_update "$@" ;;
  backup)
    if (( $# == 2 )) && [[ $1 == --label && $2 =~ ^[a-z-]{1,32}$ ]]; then cmd_backup "$2"
    elif (( $# == 0 )); then cmd_backup
    else fail 'Usage : fabcore backup'; fi ;;
  backups) cmd_backups ;;
  restore) cmd_restore "$@" ;;
  import) cmd_import "$@" ;;
  database) cmd_database "$@" ;;
  status) cmd_status ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
