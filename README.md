# RKJ One - Roti Kaya Junus ERP

Production-ready ERP for **Roti Kaya Junus** (HQ: Teluk Intan, 36 kiosk branches).

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Shadcn UI |
| State | React Query, Zustand |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Deployment | Vercel |

## Quick Start (Local)

```powershell
cp .env.example .env.local
# Isi Supabase URL + keys
npm install
npm run dev
```

 ke http://localhost:3000

## Go-Live (Production)

```powershell
# Semak + storage + build
npm run finish:go-live

# Deploy
npx vercel login
npx vercel --prod
```

Full checklist: [docs/GO_LIVE_CHECKLIST.md](./docs/GO_LIVE_CHECKLIST.md) 
M7 UAT plan: [docs/M7_PRODUCTION_UAT_PLAN.md](./docs/M7_PRODUCTION_UAT_PLAN.md)
Monitoring: [docs/MONITORING_RUNBOOK.md](./docs/MONITORING_RUNBOOK.md)
Backup/rollback: [docs/BACKUP_ROLLBACK_SOP.md](./docs/BACKUP_ROLLBACK_SOP.md)
Deploy guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) 
Resume session: **[RESUME.md](./RESUME.md)** ← baca ini bila sambung

**Production:** https://rkj.one - commit `0af1df4`

### Verify / UAT (production)

```powershell
npm run verify:production
npm run verify:payroll
npm run verify:am
npm run uat:am
```

### First login

Default password: **`[REDACTED_TEMP_PASSWORD]`** - email `{staffcode}@rkj.com` (contoh: `s001@rkj.com`, `dist009@rkj.com`)

Owner: `matisa@rkj.com` - HR: `dist006@rkj.com` - AM: `dist009@` / `dist001@` / `dist010@rkj.com`

### Environment variables

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Optional |
| `NEXT_PUBLIC_APP_URL` | Yes |
| `NEXT_PUBLIC_API_URL` | Optional |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_URL` | Optional alias |
| `SUPABASE_ANON_KEY` | Optional alias |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server only) |
| `JWT_SECRET` | Optional |
| `STRIPE_SECRET_KEY` | Optional |
| `STRIPE_WEBHOOK_SECRET` | Optional when Stripe provider is enabled |
| `OPENAI_API_KEY` | Optional |
| `SALES_AGENT_PAYMENT_MODE` | Required for payment flow |
| `SALES_AGENT_PAYMENT_PROVIDER` | Required for payment flow |
| `SALES_AGENT_PAYMENT_WEBHOOK_SECRET` | Required for staging/production payment webhooks |
| `ALLOW_UNSIGNED_PAYMENT_WEBHOOKS` | Local dev only; never enable in staging/production |

## Modules

| Module | Status |
|--------|--------|
| POS (4 menus + stock bar) | ✅ |
| Inventory & transfers | ✅ |
| Fleet & delivery POD | ✅ |
| Shifts & attendance | ✅ |
| Warehouse (HQ) | ✅ |
| Payroll & commission | ✅ |
| Finance & bank-in | ✅ |
| Reports & approvals | ✅ |
| Admin settings | ✅ |
| Area Manager scope | ✅ |

## User Roles

`SUPER_ADMIN` - `ADMIN` - `HR` - `OPERATION_MANAGER` - `CEO_FACTORY` - `AREA_MANAGER` - `DRIVER` - `STAFF` - `FINANCE`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run verify:go-live` | Database & env checks |
| `npm run setup:storage` | Create Supabase buckets |
| `npm run seed:users` | Create auth users from CSV |
| `npm run finish:go-live` | Storage + verify + build |

## License

Proprietary - Roti Kaya Junus internal use.
