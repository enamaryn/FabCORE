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
  status                          Version, service, stockage et dernière sauvegarde
  help                            Cette aide

Variables : FABCORE_DATA (données, .fabcore par défaut), FABCORE_DATABASE_URL (PostgreSQL),
FABCORE_BACKUPS (archives, .fabcore-backups par défaut), FABCORE_BACKUP_KEEP (10 par défaut).
EOF
}

# Service systemd de cette installation seulement (même dossier de travail).
own_service() {
  [[ $service != none ]] && command -v systemctl >/dev/null &&
    [[ $(systemctl show "$service" -p WorkingDirectory --value 2>/dev/null) == "$root" ]]
}
service_running() { own_service && systemctl is-active --quiet "$service"; }

# Valeur d'une variable : environnement, puis Environment= et EnvironmentFile= du service.
config() {
  local name=$1 value=${!1:-} file line
  if [[ -n $value ]]; then printf '%s' "$value"; return; fi
  own_service || return 0
  local words=()
  read -r -a words <<< "$(systemctl show "$service" -p Environment --value 2>/dev/null)"
  for line in "${words[@]}"; do
    if [[ $line == "$name="* ]]; then value=${line#*=}; fi
  done
  while read -r file _; do
    file=${file#-}
    [[ -r $file ]] || continue
    while IFS= read -r line; do
      line=${line#export }
      if [[ $line == "$name="* ]]; then value=${line#*=}; value=${value#[\"\']}; value=${value%[\"\']}; fi
    done < "$file"
  done < <(systemctl show "$service" -p EnvironmentFiles --value 2>/dev/null | tr ' ' '\n' | grep -v '^(' || true)
  printf '%s' "$value"
}

absolute() { if [[ $1 == /* ]]; then printf '%s' "$1"; else printf '%s' "$root/$1"; fi; }
data=$(absolute "$(config FABCORE_DATA)"); [[ $data != "$root/" ]] || data="$root/.fabcore"
backups=$(absolute "${FABCORE_BACKUPS:-.fabcore-backups}")
database_url=$(config FABCORE_DATABASE_URL)

with_database() {
  [[ -n $database_url ]] || fail 'FABCORE_DATABASE_URL non configuré.'
  command -v node >/dev/null || fail 'Node.js introuvable.'
  local env
  env=$(FABCORE_DATABASE_URL=$database_url node scripts/pg-env.mjs "$@") || fail 'base PostgreSQL inaccessible ou encore utilisée.'
  eval "$env"
}

need_pg_tools() {
  local tool
  for tool in pg_dump pg_restore; do
    command -v "$tool" >/dev/null || fail "$tool introuvable : installer le client PostgreSQL 16 (paquet postgresql-client)."
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
    need_pg_tools
    with_database
    storage=postgresql
    pg_dump --format=custom --no-owner --no-privileges --schema="$FABCORE_PG_SCHEMA" --file="$work/database.dump"
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
    need_pg_tools
    tar -C "$work" -xzf "$archive" database.dump || fail 'dump PostgreSQL absent de l’archive.'
    pg_restore --list "$work/database.dump" >/dev/null || fail 'dump PostgreSQL illisible.'
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
    if ! pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$PGDATABASE" "$work/database.dump"; then
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

cmd_import() {
  [[ -n $database_url ]] || fail 'FABCORE_DATABASE_URL non configuré.'
  FABCORE_DATABASE_URL=$database_url exec node scripts/import-state.mjs --data "$data" "$@"
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
  status) cmd_status ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
