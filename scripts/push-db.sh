#!/usr/bin/env bash
# RKJ One — push all Supabase migrations (00001–00030)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

PROJECT_REF="${1:-}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "Usage: ./scripts/push-db.sh YOUR_PROJECT_REF"
  echo "  Or link first: supabase link --project-ref YOUR_PROJECT_REF"
  exit 1
fi

supabase link --project-ref "$PROJECT_REF"
supabase db push
echo "==> Migrations applied."
