#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
current=$(git rev-parse HEAD)

case "${1:-}" in
  --check)
    if (( $# != 1 )); then exit 2; fi
    remote=$(git ls-remote --exit-code origin refs/heads/main)
    printf 'Installée : %s\nGitHub main : %s\n' "$current" "${remote%%$'\t'*}"
    exit 0
    ;;
  '') if (( $# == 0 )); then :; else exit 2; fi ;;
  *) echo 'Usage : fabcore-update [--check]' >&2; exit 2 ;;
esac

git_dir=$(git rev-parse --absolute-git-dir)
exec 9>"$git_dir/fabcore-update.lock"
flock -n 9 || { echo 'Une mise à jour est déjà en cours.' >&2; exit 1; }
current=$(git rev-parse HEAD)
branch=$(git branch --show-current)
if [[ -n $(git status --porcelain) || ( -n $branch && $branch != main ) ]]; then
  echo 'Utilisez une installation sans modifications locales, sur main ou en HEAD détachée.' >&2
  exit 1
fi

git fetch origin refs/heads/main
target=$(git rev-parse FETCH_HEAD)
if [[ $target == "$current" ]]; then
  echo 'FabCore est déjà à jour.'
  exit 0
fi

if [[ -n $branch ]] && ! git merge-base --is-ancestor "$current" "$target"; then
  echo 'La branche locale main ne peut pas avancer directement vers GitHub main.' >&2
  exit 1
fi

stage=$(mktemp -d "$git_dir/fabcore-update.XXXXXXXX")
trap 'if [[ ! -e "$stage/previous" ]]; then rm -rf -- "$stage"; fi' EXIT
git show "$target:package.json" > "$stage/package.json"
git show "$target:package-lock.json" > "$stage/package-lock.json"
npm ci --include=dev --prefix "$stage" --no-audit --no-fund

restart=false
if command -v systemctl >/dev/null &&
    [[ $(systemctl show fabcore -p WorkingDirectory --value 2>/dev/null) == "$PWD" ]] &&
    systemctl is-active --quiet fabcore; then
  restart=true
fi

if [[ -n $branch ]]; then
  git merge --ff-only "$target"
else
  git switch --detach "$target"
fi

rollback() {
  if [[ -e "$stage/previous" || ! -e "$stage/node_modules" ]]; then
    rm -rf -- node_modules
  fi
  if [[ -e "$stage/previous" ]]; then
    mv -T -- "$stage/previous" node_modules
  fi
  git reset --keep "$current"
  if "$restart"; then systemctl restart fabcore; fi
  echo 'Mise à jour interrompue, version précédente rétablie.' >&2
  exit 1
}

if [[ -e node_modules ]]; then
  mv -T -- node_modules "$stage/previous" || rollback
fi
mv -T -- "$stage/node_modules" node_modules || rollback

if "$restart"; then
  systemctl restart fabcore || rollback
  sleep 2
  systemctl is-active --quiet fabcore || rollback
else
  echo 'Pour relancer FabCore dans le terminal, utilisez bash scripts/install.sh depuis son dossier.'
fi
rm -rf -- "$stage/previous"
printf 'FabCore mis à jour : %s\n' "$target"
