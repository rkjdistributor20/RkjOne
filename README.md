# RKJ One — Roti Kaya Junus ERP

Production-ready ERP system for **Roti Kaya Junus** (HQ: Teluk Intan, 36 kiosk branches).

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, Shadcn UI |
| State | React Query, Zustand |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Deployment | Vercel |

## Project Structure

```
RKJ_ONE_Production_Pack/
├── app/                     # Next.js App Router (pages + API routes)
├── components/              # UI + module dashboards
├── lib/                     # Supabase, auth, module APIs
├── types/                   # Database & enum types
├── stores/                  # Zustand stores
├── public/                  # Static assets
├── supabase/
│   ├── migrations/          # 00001–00030 (schema + seed + RPC)
│   ├── config.toml
│   └── README.md
├── docs/
├── scripts/                 # setup-web.sh, dev.sh, push-db.sh
├── csv_import/
└── master_data_seed.json
```

## Modules

| # | Module | Status |
|---|--------|--------|
| 1 | Database schema + migrations | ✅ Complete |
| 2 | Seed data (36 branches, products, staff) | ✅ Complete |
| 3 | TypeScript types | ✅ Complete |
| 4 | Authentication + RBAC | ✅ Foundation |
| 5 | Dashboard | ✅ Foundation |
| 6 | POS | ✅ Complete |
| 7 | Inventory | ✅ Complete |
| 8 | Shift Management | ✅ Complete |
| 9 | Fleet | ✅ Complete |
| 10 | Warehouse (HQ) | ✅ Complete |
| 11 | Payroll | ✅ Complete |
| 12 | Finance | ✅ Complete |
| 13 | Reporting | ✅ Complete |
| 14 | Approvals | ✅ Complete |
| 15 | Admin Settings | ✅ Complete |

## User Roles

`SUPER_ADMIN` · `ADMIN` · `HR` · `OPERATION_MANAGER` · `CEO_FACTORY` · `AREA_MANAGER` · `DRIVER` · `STAFF` · `FINANCE`

## Quick Start

### 1. Database

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

See [docs/DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md) for full schema documentation.

### 2. Web App

```bash
cp .env.example .env.local
# Add Supabase URL and keys
npm install
npm run dev
```

### 3. Create first admin

1. Create user in Supabase Auth (email: `matisa@rkj.com`)
2. Update profile role to `SUPER_ADMIN`
3. Sign in at `/login`

## Deployment

Full guide: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)  
**Go-live checklist (BM):** [docs/GO_LIVE_CHECKLIST.md](./docs/GO_LIVE_CHECKLIST.md)

```bash
# Semak kesediaan sistem
npm run verify:go-live

# Windows — setup penuh (db + seed + verify)
.\scripts\go-live.ps1 -ProjectRef YOUR_PROJECT_REF
```

## Master Data

Production pack includes:

- 36 branch kiosks (Utara / Tengah / Selatan)
- 16 POS products
- 9 stock items with BOM formulas
- 5 drivers, 5 vehicles
- 57 staff records
- Payroll rules (foreign + local)
- Commission tiers (RM5 per RM1000 increment)
- Finance collection flows

Admin-editable fields (thresholds, emails, plate numbers) are intentionally left empty for HQ to configure.

## License

Proprietary — Roti Kaya Junus internal use.
