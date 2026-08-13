#!/bin/sh
# Thin shim that runs the npm `pnpm` package with the sibling embedded Node.
# Installed as <install-root>/pnpm/bin/pnpm so spawnSync('pnpm') hits this file
# when the desktop PATH wrapper prepends that directory.
set -eu

HERE="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
PNPM_ROOT="$(CDPATH= cd -- "$HERE/.." && pwd)"
INSTALL_ROOT="$(CDPATH= cd -- "$PNPM_ROOT/.." && pwd)"
NODE="$INSTALL_ROOT/node/bin/node"
PNPM_CJS="$PNPM_ROOT/node_modules/pnpm/bin/pnpm.cjs"

if [ ! -x "$NODE" ]; then
  echo "pnpm: embedded Node missing at $NODE" >&2
  exit 1
fi
if [ ! -f "$PNPM_CJS" ]; then
  echo "pnpm: package entry missing at $PNPM_CJS" >&2
  exit 1
fi

exec "$NODE" "$PNPM_CJS" "$@"
