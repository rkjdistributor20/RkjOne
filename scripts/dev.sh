#!/usr/bin/env bash
# RKJ One — local dev server
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Error: .env.local missing. Run ./scripts/setup-web.sh first."
  exit 1
fi

npm run dev
