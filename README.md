# RKJ One — Roti Kaya Junus ERP

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

→ http://localhost:3000

## Go-Live (Production)

```powershell
# Semak + storage + build
npm run finish:go-live

# Deploy
npx vercel login
npx vercel --prod
```

Full checklist: [docs/GO_LIVE_CHECKLIST.md](./docs/GO_LIVE_CHECKLIST.md)  
Deploy guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)  
Resume session: [RESUME.md](./RESUME.md)

### Environment variables

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server only) |
| `NEXT_PUBLIC_APP_URL` | Yes (auth redirects) |

### First login

Default password: `RkjOne@2025` — users are **required** to change password on first login.

HQ admin: `matisa@rkj.com`

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

`SUPER_ADMIN` · `ADMIN` · `HR` · `OPERATION_MANAGER` · `CEO_FACTORY` · `AREA_MANAGER` · `DRIVER` · `STAFF` · `FINANCE`

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

Proprietary — Roti Kaya Junus internal use.
