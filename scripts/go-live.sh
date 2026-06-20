#!/usr/bin/env bash
# RKJ One — go-live automation (macOS / Linux / Git Bash)
# Usage: ./scripts/go-live.sh YOUR_PROJECT_REF

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT_REF="${1:-}"

echo ""
echo "=== RKJ One Go-Live ==="

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "Created .env.local — edit Supabase keys before continuing."
  exit 1
fi

echo "[1/4] Bundle migrations 00019-00030..."
node scripts/bundle-migrations.mjs

if [[ -n "$PROJECT_REF" ]]; then
  echo "[2/4] Push database..."
  supabase link --project-ref "$PROJECT_REF"
  supabase db push
else
  echo "[2/4] Push database (project must already be linked)..."
  supabase db push
fi

echo "[3/4] Seed auth users..."
npm run seed:users

echo "[4/4] Verify go-live..."
npm run verify:go-live

echo ""
echo "Seterusnya: deploy Vercel — docs/DEPLOYMENT.md"
echo ""
