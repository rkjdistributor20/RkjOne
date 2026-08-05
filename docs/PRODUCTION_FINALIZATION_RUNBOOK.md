# RKJ One Production Finalization Runbook

Last verified: 2026-08-05 (Asia/Kuala_Lumpur)

This runbook records the remaining gates before RKJ One is handed to staff. It contains no passwords, tokens or API keys.

## Environment identity

| Environment | Supabase project | Reference | Region | Use |
|---|---|---|---|---|
| Production | RKJ One Production | `mtygxueknokcihofdttl` | Sydney (`ap-southeast-2`) | Existing live data; no migration without an explicit recovery gate. |
| Staging | rkj-one-staging-my | `lktggxwgaormnzfwcogx` | Singapore | Migration rehearsal, Preview environment and synthetic UAT only. |

Never reuse Production keys in Preview, local development or staging. Never link a working directory until the project name and reference have both been checked.

## Verified state

- The 149-migration baseline replayed successfully in isolated local Supabase after four migration-history corrections.
- Staging includes the Fiuu schema migrations and `20260805170000_backfill_profile_legal_entity_from_staff.sql`.
- The staging legal-entity audit reports zero active non-admin profiles without a legal entity and one active ADMIN.
- Production has not received the two Fiuu migrations or the legal-entity backfill migration.
- Production daily physical backups are available. The latest backup observed was `04 Aug 2026 14:54:14 UTC`.
- Point-in-time recovery was not enabled when checked. Database backups do not include Storage objects.
- Production has 107 active profiles. The audit found zero active ADMIN accounts, 68 profiles that had never signed in, two Operation Manager profiles missing a legal entity and one Distributor staff profile with no verified branch assignment.
- Fiuu DuitNow QR Offline is activated at the merchant. OPA credentials, signed callback UAT and settlement reconciliation remain unconfirmed.
- Google Play currently serves RKJ One Staff `1.4` (version code `5`) at full rollout. Server-only payment work does not require a new Android bundle.

## Production GO gates

All items below are mandatory:

1. Owner confirms the individual who will hold the active ADMIN role and their permitted company scope.
2. Owner/HR confirms branch and region assignments that cannot be derived from an existing staff record.
3. Role UAT passes for SUPER_ADMIN, ADMIN, OM, AM, Finance, HR, POS staff, driver, factory and sales agent.
4. A current Production recovery point is available immediately before migration, with a named person authorized to restore it.
5. A migration dry-run lists only the three expected pending migrations.
6. Staging Preview passes login, access isolation, POS, inventory, finance, fleet, HR and negative security smoke tests.
7. Fiuu remains `manual` unless OPA credentials, signed callback, idempotency, receipt, stock movement, shift summary and settlement all reconcile.
8. The exact Vercel deployment and Supabase project references are recorded before release.

Any missing item is a NO-GO for Production migration or staff-wide rollout.

## Approved migration order

After the GO gates are met, deploy to Production in filename order during a maintenance window:

1. `20260804144500_explicit_data_api_table_grants.sql`
2. `20260804235500_fiuu_pos_dynamic_qr.sql`
3. `20260805170000_backfill_profile_legal_entity_from_staff.sql`

Before execution, run a linked migration list and dry-run against the independently verified Production reference. Stop if any additional migration appears.

## Rollback strategy

- Application issue only: restore the last known-good Vercel deployment and keep `POS_QR_PAYMENT_MODE=manual`.
- Fiuu issue: keep all payment audit rows, provider references and receipts; do not delete or rewrite transactions.
- Legal-entity backfill: the migration only fills `profiles.legal_entity_id` where it is null and a same-organization linked staff record has a verified legal entity. Record affected profile IDs before Production execution so an approved forward correction can be applied if HR identifies a mismatch.
- Schema/data corruption: stop writes and use the confirmed recovery point. Do not improvise destructive rollback SQL.

## Staff rollout order

1. Confirm ADMIN identity and owner access.
2. Resolve unmatched legal entity, branch and region assignments.
3. Onboard one role at a time and record first-login evidence.
4. Pilot one branch and one official POS device using manual QR.
5. Reconcile shift, sales, stock, payments and finance.
6. Expand by area only after the prior batch has no unresolved P0/P1 issue.

## Fiuu activation order

1. Rotate the previously exposed merchant portal password.
2. Confirm Booster/OPA status and obtain provider-issued OPA credentials through a secure channel.
3. Store credentials only in staging server-side environment variables.
4. Configure the staging webhook URL and run signed sandbox UAT.
5. Reconcile a controlled low-value pilot with Finance.
6. Obtain explicit owner approval before adding Production credentials or changing Production payment mode.

## Play Store rule

Do not publish a new Android bundle for server-only changes. A new AAB is required only when native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes. Before any future Play Store release, run the mobile readiness audit and verify the signed release artifact on a physical Android device.
