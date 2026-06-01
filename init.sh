#!/usr/bin/env bash
set -euo pipefail
# init.sh — idempotent session boot: install -> verify baseline -> ready.
# Safe to re-run at the start of every session. Pinned versions come from
# .nvmrc / package.json / pnpm-lock.yaml.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

echo "==> Node $(node -v)  pnpm $(pnpm -v)"

echo "==> [1/3] Install dependencies"
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

echo "==> [2/3] Verify baseline (MUST pass before any new work): pnpm check"
pnpm check

echo "==> [3/3] Ready."
echo "    Dev server : pnpm dev          # http://localhost:3000"
echo "    E2E smoke  : pnpm test:e2e     # boots its own server"
echo "    Local DB   : pnpm db:up        # optional; not needed for pnpm check"

# Optional: ./init.sh --serve  to boot the dev server (blocking).
if [ "${1:-}" = "--serve" ]; then
  echo "==> Starting dev server (Ctrl-C to stop)"
  exec pnpm dev
fi
