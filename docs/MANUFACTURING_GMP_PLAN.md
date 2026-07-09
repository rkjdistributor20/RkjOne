# Manufacturing GMP Plan

RKJ Manufacturing module now treats the factory as a GMP-ready operation for five product families:

1. Roti Kaya / Planta
2. Roti Kelapa
3. Roti Kacang
4. Roti Benggali
5. Pelbagai / Kaya Butter Pack

## GMP Records

Each production day should record:

- Pre-operation sanitation.
- Raw material lot trace.
- Weighing record.
- Process QC/CCP checks.
- Packing and label trace.
- Finished goods release.
- Non-conformance and CAPA when needed.

## Staff Structure

Recommended overlay under Roti Kaya Junus Manufacturing Sdn Bhd:

- Accountable leadership: MFG008, MFG010, MFG003.
- Production control: MFG012 plus MFG002, MFG011, MFG014, MFG015, MFG020.
- GMP, QA and safety: MFG016.
- Store, stock card and lot trace: MFG007, MFG013, MFG019.
- HR, training and document control: MFG018.
- Finance and costing: MFG017.
- Hygiene and sanitation: MFG004.

## HR/Data Actions

- MFG001, MFG005, MFG006 and MFG009 are logistics/driver staff currently tied to RKJ Distributor work. Keep them in Distributor for route/DO, with factory logistics support tagging when needed.
- DIST012 is under Manufacturing despite a Distributor-style code. HR should confirm whether to move legal entity or rename staff code.
- Product-line assignment should be UAT-tested as an overlay before staff master is changed.

## Files Added

- `lib/manufacturing/gmp.ts`
- `components/warehouse/factory-gmp-dashboard.tsx`
- `app/api/production/gmp/route.ts`
- `app/api/production/gmp/[id]/route.ts`
- `supabase/migrations/20260709060551_manufacturing_gmp_records.sql`

## API Workflow

- `GET /api/production/gmp`: list GMP products, recent batch records, record stages and summary.
- `POST /api/production/gmp`: create a GMP batch record for one of the five product families.
- `PATCH /api/production/gmp/[id]`: update batch status or actual quantity.

If the migration has not been applied, `GET` returns `migration_ready: false` so the dashboard can stay usable as SOP/readiness without crashing. Write endpoints return `424` until the GMP tables exist.

## Database Safety

The migration is a draft in source control. It has not been applied to production. Review RLS, staff assignments and workflow ownership before running `supabase db push`.
