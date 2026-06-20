# RKJ One — Deployment Guide

Production deployment for Roti Kaya Junus ERP on **Supabase** + **Vercel**.

> **Go-live checklist (BM):** [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md)

## Prerequisites

- [Supabase](https://supabase.com) project
- [Vercel](https://vercel.com) account
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local dev)
- Node.js 20+

## 1. Supabase Setup

### Create project

1. Create a new Supabase project (region: Singapore recommended).
2. Note **Project URL**, **anon key**, and **service_role key**.

### Run migrations

**All migrations:** `00001` through `00030` (30 files).

```bash
# From repo root
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Windows — automated go-live script:**

```powershell
.\scripts\go-live.ps1 -ProjectRef YOUR_PROJECT_REF
```

**If `db push` fails** (remote/local history mismatch):

1. Ensure `00001`–`00018` are already applied.
2. Supabase Dashboard → SQL Editor → run `docs/sql/00019_00030_manual_bundle.sql`
3. Regenerate bundle anytime: `npm run bundle:migrations`

**Migration index (00019–00030):**

| File | Purpose |
|------|---------|
| 00019 | Fleet master RLS |
| 00020 | Branch status RLS |
| 00021 | Opening stock HQ + kiosks |
| 00022 | Missing staff profiles |
| 00023 | POS stock validation RPC |
| 00024 | Benggali → Roti Benggali category |
| 00025 | Regions RLS read (profile fix) |
| 00026 | Product prices |
| 00027–00028 | Roti Kaya stock + BOM |
| 00029 | Kelapa/Kacang/Benggali stock + BOM |
| 00030 | Four POS menus only |

Quick bash (Git Bash / WSL / macOS):

```bash
chmod +x scripts/*.sh
./scripts/setup-web.sh
./scripts/push-db.sh YOUR_PROJECT_REF
./scripts/dev.sh
```

### Verify database

```bash
npm run verify:go-live
```

### Auth configuration

In Supabase Dashboard → **Authentication** → **Settings**:

| Setting | Value |
|---------|-------|
| Site URL | `https://your-app.vercel.app` |
| Redirect URLs | `https://your-app.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` |
| Enable email signup | **Off** (admin creates users) |

### Create all users

```bash
cp .env.example .env.local
# Fill Supabase keys
npm run seed:users
```

Default password: `RkjOne@2025` — users must change on first login.  
Full list: `csv_import/login_users_generated.csv`

HQ users can also be updated manually:

```sql
UPDATE profiles SET
  role = 'SUPER_ADMIN',
  employee_code = 'U001',
  full_name = 'Mat Isa',
  must_change_password = true
WHERE email = 'matisa@rkj.com';
```

### Storage buckets

Create buckets in Supabase Storage:

| Bucket | Public | Purpose |
|--------|--------|---------|
| `delivery-proof` | No | POD images |
| `bank-slips` | No | Bank-in receipts |
| `receipts` | No | Digital receipt PDFs |

### Enable Realtime (optional)

Enable Realtime on: `notifications`, `pos_transactions`, `inventory_balances`.

## 2. Vercel Deployment

### Environment variables

In Vercel project settings:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Deploy

```bash
npm install
npm run build
```

Connect GitHub repo to Vercel — **Root Directory** is the repo root (`.`).

Or CLI:

```bash
npx vercel --prod
```

## 3. Post-Deploy Checklist

- [ ] Migrations 00001–00030 applied
- [ ] `npm run verify:go-live` passes
- [ ] Seed users created (`npm run seed:users`)
- [ ] Super Admin login works (`matisa@rkj.com`)
- [ ] POS: 4 menus, prices, stock bar visible
- [ ] Fleet delivery → kiosk stock → POS sale flow tested
- [ ] RLS tested per role
- [ ] Pilot 3 branches before full rollout (see GO_LIVE_CHECKLIST.md)

## 4. Local Development

```bash
cp .env.example .env.local
# Fill in Supabase keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Staging vs Production

| Environment | Supabase | Vercel |
|-------------|----------|--------|
| Staging | Separate project | Preview deployments |
| Production | Production project | Production domain |

Validate POS on one kiosk before full rollout.

## 6. Security Notes

- Never commit `.env.local` or service role keys
- Disable public signup in Supabase Auth
- Use RLS on all tables (already configured)
- Rotate keys if exposed
- HQ users must change default passwords on first login

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| Auth redirect loop | Check Site URL and callback URL in Supabase |
| Profile not found | Run migration 00025 |
| RLS blocks queries | Verify profile has correct `organization_id` and role |
| No POS products | Run 00030; check product status ACTIVE |
| Prices RM 0 | Run migration 00026 |
| Empty POS stock | Run 00021 + fleet delivery to kiosk |
| `get_pos_product_availability` missing | Run migration 00023 |
| Dashboard stats empty | POS transactions needed; view aggregates from `pos_daily_summaries` |
| Migration fails on auth schema | Run migrations after Supabase project is fully provisioned |
| `db push` fails | Use `docs/sql/00019_00030_manual_bundle.sql` |
