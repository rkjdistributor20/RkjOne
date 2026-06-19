#!/usr/bin/env bash
# RKJ One — install web dependencies
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"

echo "==> Installing web dependencies..."
cd "$WEB"

if [[ ! -f .env.local ]] && [[ -f .env.example ]]; then
  cp .env.example .env.local
  echo "==> Created web/.env.local from .env.example — add your Supabase keys."
fi

npm install
echo "==> Done. Run: cd web && npm run dev"
