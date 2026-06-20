#!/usr/bin/env bash
# RKJ One — production build check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npm run build
echo "==> Build OK"
