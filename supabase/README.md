# Supabase — RKJ One

PostgreSQL schema, RLS, RPC functions, and seed data for Roti Kaya Junus ERP.

## Structure

```
supabase/
├── config.toml          # Local CLI config (auth, ports)
└── migrations/          # Apply in numeric order — do not reorder
    ├── 00001_extensions_enums.sql
    ├── 00002_core_organization.sql
    ├── …
    └── 00030_four_menus_only.sql
```

## Apply migrations

**Remote (production):**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Windows go-live (db + seed + verify):**

```powershell
.\scripts\go-live.ps1 -ProjectRef YOUR_PROJECT_REF
```

**Manual bundle (if `db push` fails):**

```bash
npm run bundle:migrations
# Then paste docs/sql/00019_00030_manual_bundle.sql in SQL Editor
```

**Local:**

```bash
supabase start
supabase db reset   # runs all migrations + optional seed
```

**Manual:** Supabase Dashboard → SQL Editor → run each file in order.

## Migration index

| File | Contents |
|------|----------|
| `00001` | Extensions, enums (`user_role`, `worker_type`, etc.) |
| `00002` | Organizations, regions, branches, profiles, staff, RBAC |
| `00003` | Products, stock items, BOM, shift templates, payroll rules, commission tiers |
| `00004` | Inventory locations, balances, movements, transfers, adjustments, counts |
| `00005` | POS shifts, transactions, items, payments, daily summaries |
| `00006` | Staff shifts, attendance, payroll runs, finance collections, reconciliations |
| `00007` | Fleet vehicles, delivery orders, legs, POD, warehouse audits |
| `00008` | Approval requests, notifications, offline sync queue, audit logs |
| `00009` | Row Level Security policies + `auth.*` helper functions |
| `00010` | Triggers, commission/shift pay calculators, `dashboard_stats` view |
| `00011` | Seed data — 36 branches, 16 products, 57 staff, rules, permissions |
| `00012` | POS RPC — `process_pos_sale`, void, refund, open/close shift |
| `00013` | Inventory RPC — receive, transfer, adjust, count, write-off |
| `00014` | Shift RPC — create/approve shift, clock in/out |
| `00015` | Fleet + warehouse RPC — delivery orders, POD, audits |
| `00016` | Payroll RPC — generate/approve runs, update rules |
| `00017` | Finance RPC — collections, bank-in, reconciliation, daily report |
| `00018` | Approvals RPC — `resolve_approval_request` (unified approve/reject) |
| `00019` | Fleet master RLS (drivers, vehicles) |
| `00020` | Branch status RLS |
| `00021` | Opening stock — HQ warehouse + branch kiosks |
| `00022` | Missing staff profile records |
| `00023` | POS stock validation — `validate_pos_sale_stock`, `get_pos_product_availability` |
| `00024` | Product category Benggali → Roti Benggali |
| `00025` | Regions RLS read policy (profile/session fix) |
| `00026` | Product prices for POS |
| `00027` | Roti Kaya BOM (Planta raw material) |
| `00028` | Stock item rename Planta → Roti Kaya |
| `00029` | Kelapa, Kacang, Benggali stock items + full BOM |
| `00030` | Four POS menus only — deactivate other product categories |

## Verify after migrate

```bash
npm run verify:go-live
```

## Storage buckets (create in Dashboard)

| Bucket | Purpose |
|--------|---------|
| `delivery-proof` | Fleet POD images |
| `bank-slips` | Bank-in receipts |
| `receipts` | POS receipt PDFs |

## Auth

- Signup disabled — admins create users via `npm run seed:users`
- Profile auto-created via `handle_new_user()` trigger (`00010`)
- Default password: `RkjOne@2025` — change on first login

See also:

- [docs/GO_LIVE_CHECKLIST.md](../docs/GO_LIVE_CHECKLIST.md)
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
- [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md)
