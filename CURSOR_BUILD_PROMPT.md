# Cursor Build Prompt - RKJ One

Build RKJ One ERP/POS using this production pack.

## Tech Stack
- Next.js 15
- TypeScript
- Tailwind CSS
- Shadcn UI
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Vercel deployment
- PWA support for Android Phone/Tablet

## Required roles
- Super Admin
- HQ Admin
- HR
- Operation Manager
- CEO Factory
- Area Manager
- Driver
- Staff

## Required modules
1. POS Cash Counter
2. Flexible Shift Management
3. Inventory HQ / Fleet / Kiosk
4. Factory to HQ stock transfer
5. Fleet Delivery & POD
6. Manager Approval
7. Payroll Rules
8. Commission Rules
9. Cash Collection Tracking
10. QR Company Collection
11. Reporting Dashboard
12. Admin Master Data Settings

## Data
Use:
- `master_data_seed.json`
- `csv_import/*.csv`
- `supabase_seed.sql`

## Important
Leave all unknown fields editable in Admin Settings.
Do not hardcode stock threshold, staff assignment, driver vehicles, or prices.
