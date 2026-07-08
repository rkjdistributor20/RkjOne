# RKJ One M6 Production Release Notes

Release date: 2026-07-08

Production URL: https://rkj-one.vercel.app

Deployment ID: `dpl_55k1i1FNbsmaMnEHwfHkpj41yKQJ`

## Summary

M6 completed the production release gate for RKJ One after booking, admin dashboard, payment lifecycle, QA, security review, database migration, and production deploy work.

## Included Work

- AI project governance docs and role guide.
- Booking API and booking UI workflow.
- Admin dashboard with user, booking, transaction/order, and analytics summaries.
- Sales agent payment lifecycle:
  - session creation
  - provider metadata
  - status endpoint
  - cancel pending payment
  - manual refund recording
  - webhook handling
- Payment webhook security hardening.
- Supabase production migrations:
  - `harden_auth_role_and_booking_scope`
  - `m5_payment_lifecycle`
- M6 QA and security release reports.
- Vercel production deployment and smoke verification.

## Verification

| Check | Result |
|-------|--------|
| `npm run lint -- --quiet` | Pass |
| `npm run build` | Pass |
| `npm audit --omit=dev --audit-level=moderate` | Pass |
| Secret scan | Pass |
| Supabase migration/object verification | Pass |
| Vercel production deployment | Ready |
| Production smoke test | Pass |
| Vercel runtime errors after deploy | Clean |

## Known Follow-Up

- Run signed live-provider callback UAT for Billplz/iPay88/Stripe before opening live payment volume.
- Run role-based UAT with real users according to `docs/M7_PRODUCTION_UAT_PLAN.md`.
- Keep daily monitoring according to `docs/MONITORING_RUNBOOK.md`.
- Review backup/PITR availability in Supabase dashboard according to `docs/BACKUP_ROLLBACK_SOP.md`.
