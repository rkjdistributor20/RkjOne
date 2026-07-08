# RKJ One Backup & Rollback SOP

Last updated: 2026-07-08

Purpose: safe recovery steps for production incidents.

## Golden Rules

- Do not edit production data manually without owner approval.
- Do not run destructive SQL without a reviewed rollback plan.
- Do not deploy a fix that has not passed `npm run lint -- --quiet` and `npm run build`.
- For payment issues, preserve provider references, receipts, and webhook payload evidence.

## Before UAT or Major Change

| Step | Owner | Status |
|------|-------|--------|
| Confirm latest Vercel deployment ID. | DevOps | Done for M6 |
| Confirm latest Supabase migration history. | Database AI | Done for M6 |
| Confirm production smoke passes. | QA | Done for M6 |
| Confirm payment provider mode and webhook secret. | Finance/DevOps | Pending provider UAT |
| Confirm Supabase backup/PITR availability in dashboard. | Owner/DevOps | Pending manual dashboard check |

## Vercel Rollback

Use when a deployment breaks the app but database state is still safe.

1. Identify last known-good deployment in Vercel dashboard.
2. Roll back through Vercel dashboard or CLI.
3. Confirm alias points back to the known-good deployment.
4. Run `npm run smoke:production`.
5. Check Vercel runtime errors after rollback.
6. Record rollback reason in release notes.

CLI pattern:

```powershell
npx vercel rollback
```

or:

```powershell
npx vercel rollback <deployment-url-or-id>
```

## Database Rollback

Use when a schema/data migration causes production issue.

Preferred order:

1. Stop or roll back app traffic if new code depends on broken schema.
2. Take note of the exact failing migration and error.
3. Create a forward-fix migration when possible.
4. Only restore from backup/PITR if data is corrupted or forward-fix is unsafe.

Do not run manual `drop table`, `delete`, or broad `update` statements without:

- affected table list
- row count estimate
- backup/PITR confirmation
- owner approval
- verified rollback SQL

## Payment Incident Rollback

Payment records must be audit-friendly.

If payment status is wrong:

1. Check provider dashboard first.
2. Compare provider reference with `gateway_ref` / `gateway_session_id`.
3. Use cancel/refund workflow where possible.
4. Avoid deleting payment rows.
5. Keep receipt, provider reference, and finance note.

## Release Tagging

After a stable production deployment:

```powershell
git tag -a m6-production-release -m "M6 production release"
git push origin m6-production-release
```

Use a new tag for later patches, for example:

```powershell
git tag -a m7-stabilization-uat -m "M7 stabilization and UAT baseline"
git push origin m7-stabilization-uat
```

## Recovery Communication

Send this summary to owner/team:

```text
Incident:
Impact:
Start time:
End time:
Root cause:
Fix/rollback:
Data impact:
Customer/staff action needed:
Prevention:
```
