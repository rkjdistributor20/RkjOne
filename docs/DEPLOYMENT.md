# RKJ One — Deployment Guide

Production deployment for Roti Kaya Junus ERP on **Supabase** + **Vercel**.

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

```bash
# From repo root
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or apply manually via **SQL Editor** in order (`00001` through `00018`):

1. `00001_extensions_enums.sql` … `00011_seed_data.sql`
2. `00012_pos_rpc.sql` … `00018_approvals_rpc.sql`

Quick bash (Git Bash / WSL / macOS):

```bash
chmod +x scripts/*.sh
./scripts/setup-web.sh
./scripts/push-db.sh YOUR_PROJECT_REF   # requires Supabase CLI
./scripts/dev.sh                        # http://localhost:3000
```

### Auth configuration

In Supabase Dashboard → **Authentication** → **Settings**:

| Setting | Value |
|---------|-------|
| Site URL | `https://your-app.vercel.app` |
| Redirect URLs | `https://your-app.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` |
| Enable email signup | **Off** (admin creates users) |

### Create HQ users

Create auth users via Dashboard or Admin API, then update profiles:

```sql
-- After creating auth user for Mat Isa
UPDATE profiles SET
  role = 'SUPER_ADMIN',
  employee_code = 'U001',
  full_name = 'Mat Isa',
  must_change_password = true
WHERE email = 'matisa@rkj.com';

-- Area managers — link to regions
UPDATE profiles SET role = 'AREA_MANAGER', region_id = (SELECT id FROM regions WHERE code = 'UTARA')
WHERE full_name = 'Safuan';
```

Repeat for: Norashikin (ADMIN), Mohd Ali (HR), Ibrahim (OPERATION_MANAGER), Muhammad (CEO_FACTORY), Hakim (TENGAH), Yati (SELATAN).

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
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server only — never expose to client
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Deploy

```bash
cd web
npm install
npm run build
```

Connect GitHub repo to Vercel, set **Root Directory** to `web`.

Or CLI:

```bash
cd web
npx vercel --prod
```

## 3. Post-Deploy Checklist

- [ ] Migrations applied successfully
- [ ] Seed data verified (36 branches, 16 products, 57 staff)
- [ ] Super Admin login works
- [ ] RLS policies tested per role
- [ ] PWA manifest loads on mobile
- [ ] Staging tested before kiosk rollout

## 4. Local Development

```bash
# Terminal 1 — Supabase local (optional)
supabase start

# Terminal 2 — Next.js
cd web
cp .env.example .env.local
# Fill in Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Staging vs Production

| Environment | Supabase | Vercel |
|-------------|----------|--------|
| Staging | Separate project | Preview deployments |
| Production | Production project | Production domain |

Import `master_data_seed.json` and CSV files to staging first. Validate POS on one kiosk before full rollout.

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
| RLS blocks queries | Verify profile has correct `organization_id` and role |
| Dashboard stats empty | POS transactions needed; view aggregates from `pos_daily_summaries` |
| Migration fails on auth schema | Run migrations after Supabase project is fully provisioned |
