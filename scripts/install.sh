#!/usr/bin/env bash
set -euo pipefail

bootstrap=false
if [[ -n ${BASH_SOURCE[0]:-} ]]; then
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
else
  bootstrap=true
  if [[ -e FabCORE || -L FabCORE ]]; then
    echo 'FabCORE existe déjà. Pour relancer cette installation, exécutez bash FabCORE/scripts/install.sh.' >&2
    exit 1
  fi
fi

if ! command -v apt-get >/dev/null || ! command -v dpkg >/dev/null; then
  echo 'Cet installateur nécessite Debian ou Ubuntu.' >&2
  exit 1
fi

required=(ca-certificates curl ffmpeg git util-linux)
packages=()
for package in "${required[@]}"; do
  if [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) != 'install ok installed' ]]; then
    packages+=("$package")
  fi
done

if (( ${#packages[@]} )); then
  apt=(apt-get)
  if (( EUID != 0 )); then
    if ! command -v sudo >/dev/null; then
      printf 'Installez ces paquets depuis un compte administrateur, puis relancez le script : %s\n' "${packages[*]}" >&2
      exit 1
    fi
    apt=(sudo apt-get)
  fi
  "${apt[@]}" update
  "${apt[@]}" install -y --no-install-recommends "${packages[@]}"
fi

if "$bootstrap"; then
  git clone -- https://github.com/enamaryn/FabCORE.git FabCORE
  cd -- FabCORE
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null ||
    ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  node_version=v24.22.3
  case "$(dpkg --print-architecture)" in
    amd64) node_arch=x64 ;;
    arm64) node_arch=arm64 ;;
    *) echo 'Installez Node.js 24 et npm pour cette architecture, puis relancez cette commande.' >&2; exit 1 ;;
  esac

  cache="${XDG_CACHE_HOME:-$HOME/.cache}/fabcore"
  node_dist="node-${node_version}-linux-${node_arch}"
  mkdir -p -- "$cache"
  if [[ ! -x "$cache/$node_dist/bin/node" ]]; then
    staging=$(mktemp -d "$cache/install.XXXXXXXX")
    trap 'rm -rf -- "$staging"' EXIT
    (
      cd -- "$staging"
      release_url="https://nodejs.org/dist/$node_version"
      archive="$node_dist.tar.gz"
      curl -fsSL --retry 2 -O "$release_url/SHASUMS256.txt" -O "$release_url/$archive"
      awk -v archive="$archive" '$2 == archive { print }' SHASUMS256.txt | sha256sum --check --strict
      tar -xzf "$archive"
      mv -T -- "$node_dist" "$cache/$node_dist"
    )
    rm -rf -- "$staging"
    trap - EXIT
  fi
  export PATH="$cache/$node_dist/bin:$PATH"
fi

npm ci --include=dev --no-audit --no-fund
ffmpeg -version >/dev/null
if (( EUID == 0 )); then
  update_bin=/usr/local/bin
else
  update_bin="$HOME/.local/bin"
fi
mkdir -p -- "$update_bin"
# `fabcore` : commande d'administration (update, backup, restore…) ; `fabcore-update` reste un alias de `fabcore update`.
write_launcher() {
  local name=$1 launcher
  shift
  launcher=$(mktemp "$update_bin/.$name.XXXXXXXX")
  trap 'rm -f -- "$launcher"' EXIT
  {
    printf '#!/usr/bin/env bash\n'
    printf 'export PATH=%q:"$PATH"\n' "$(dirname -- "$(command -v node)")"
    printf 'exec bash %q %s"$@"\n' "$(pwd -P)/scripts/fabcore.sh" "$*"
  } > "$launcher"
  chmod 0755 "$launcher"
  mv -Tf -- "$launcher" "$update_bin/$name"
  trap - EXIT
}
write_launcher fabcore
write_launcher fabcore-update 'update '

# Proxmox can enter a minimal LXC with /usr/bin but without /usr/local/bin.
for name in fabcore fabcore-update; do
  if (( EUID == 0 )) && [[ :$PATH: != *:"$update_bin":* && :$PATH: == *:/usr/bin:* &&
      ! -e /usr/bin/$name && ! -L /usr/bin/$name ]]; then
    ln -s -- "$update_bin/$name" "/usr/bin/$name"
  fi
done

if [[ $(command -v fabcore) == "$update_bin/fabcore" ||
    $(readlink -f -- "$(command -v fabcore || true)") == "$update_bin/fabcore" ]]; then
  echo 'Administration : fabcore help (mise à jour : fabcore update, sauvegarde : fabcore backup)'
else
  printf 'Administration : %q help\n' "$update_bin/fabcore"
fi
exec npm start
