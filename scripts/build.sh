#!/usr/bin/env bash
# RKJ One — production build check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"
npm run build
echo "==> Build OK"
