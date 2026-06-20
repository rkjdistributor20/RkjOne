#!/usr/bin/env bash
# RKJ One — install dependencies
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]] && [[ -f .env.example ]]; then
  cp .env.example .env.local
  echo "==> Created .env.local from .env.example — add your Supabase keys."
fi

npm install
echo "==> Done. Run: npm run dev"
