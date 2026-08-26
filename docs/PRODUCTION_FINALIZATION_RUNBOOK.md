# RKJ One Production Finalization Runbook

Last verified: 2026-08-26 (Asia/Kuala_Lumpur)

This runbook records the remaining gates before RKJ One is handed to staff. It contains no passwords, tokens or API keys.

## Environment identity

| Environment | Supabase project | Reference | Region | Use |
|---|---|---|---|---|
| Production | RKJ One Production | `mtygxueknokcihofdttl` | Sydney (`ap-southeast-2`) | Existing live data; no migration without an explicit recovery gate. |
| Staging | rkj-one-staging-my | `lktggxwgaormnzfwcogx` | Singapore | Migration rehearsal, Preview environment and synthetic UAT only. |

Never reuse Production keys in Preview, local development or staging. Never link a working directory until the project name and reference have both been checked.

## Verified state

- The 149-migration baseline replayed successfully in isolated local Supabase after four migration-history corrections. Before reconciliation markers, the integrated repository contained 152 migrations including the later Fiuu and legal-entity work; the 11 Production history markers bring the canonical history to 163 files.
- Staging includes the Fiuu schema migrations and `20260805170000_backfill_profile_legal_entity_from_staff.sql`.
- Staging migration history matches the repository through `20260808135000`; a linked `db push --dry-run` reports that staging is up to date.
- The staging legal-entity audit reports zero active non-admin profiles without a legal entity and one active ADMIN.
- The 2026-08-05 read-only Production audit found 11 historical versions (`20260722114542` through `20260722154920`) that were originally absent from the repository. `supabase migration fetch` recovered their SQL to an external audit directory. Each version maps to a later replay-safe repository migration, and the differences were reviewed. The repository now uses explicit no-op history markers for the Production-only version IDs; the broken historical SQL is not replayed. The later canonical migrations remain responsible for applying the corrected behavior.
- All 172 migration files currently in the integration branch replay successfully from an empty local database. This includes the active-profile, tenant-boundary and completed-POS immutability hardening migration `20260826234500_harden_active_tenant_pos_boundaries.sql`. On 2026-08-26 that migration was applied to the independently identified Singapore staging project; a subsequent linked dry-run reported the staging database up to date. Production application remains a separate approval gate.
- The 2026-08-05 Production dry-run listed 14 pending canonical migrations. That result is now a historical checkpoint; Production must be audited again because six newer staging migrations were added afterward.
- Production daily physical backups were observed previously. The last recorded observation (`04 Aug 2026 14:54:14 UTC`) is historical and is not acceptable evidence for a new rollout.
- Point-in-time recovery was not enabled at the previous check. Current backup, restore authority and recovery-point availability must be re-confirmed in the Supabase dashboard. Database backups do not include Storage objects.
- Production has 107 active profiles. The audit found zero active ADMIN accounts, 68 profiles that had never signed in, two Operation Manager profiles missing a legal entity and one Distributor staff profile with no verified branch assignment.
- Fiuu merchant approval does not by itself prove the application-facing OPA contract. Provider-issued Application Code, Store/Terminal mapping, signed callback UAT and settlement reconciliation remain mandatory before dynamic QR mode is enabled.
- Android `1.6.9` (version code `16`) compiles locally and includes direct Bluetooth receipt printing plus cash-drawer handling. Its current Google Play track and exact uploaded bundle remain **To be confirmed** in Play Console; promotion remains gated by a Play-delivered physical-device acceptance test.

## Production GO gates

All items below are mandatory:

1. Owner confirms the individual who will hold the active ADMIN role and their permitted company scope.
2. Owner/HR confirms branch and region assignments that cannot be derived from an existing staff record.
3. Role UAT passes for SUPER_ADMIN, ADMIN, OM, AM, Finance, HR, POS staff, driver, factory and sales agent.
4. A current Production recovery point is available immediately before migration, with a named person authorized to restore it.
5. A fresh Production migration list and dry-run are reviewed immediately before rollout. The earlier 14-migration checkpoint is historical and must not be reused because six newer staging migrations now exist.
6. Staging Preview passes login, access isolation, POS, inventory, finance, fleet, HR and negative security smoke tests.
7. Fiuu remains `manual` unless OPA credentials, signed callback, idempotency, receipt, stock movement, shift summary and settlement all reconcile.
8. The exact Vercel deployment and Supabase project references are recorded before release.

Any missing item is a NO-GO for Production migration or staff-wide rollout.

## Intended migration order — suspended pending history reconciliation

After all GO gates are met, deploy the 14 dry-run-verified migrations to Production in filename order during a maintenance window:

1. `20260722195500_supabase_security_advisor_hardening.sql`
2. `20260722201500_security_definer_execution_grants.sql`
3. `20260722203500_restore_internal_function_grants.sql`
4. `20260722204500_core_foreign_key_indexes.sql`
5. `20260722210000_optimize_rls_auth_initplan.sql`
6. `20260722213000_secure_operational_rpc_boundaries.sql`
7. `20260722214500_secure_factory_fleet_rpc_boundaries.sql`
8. `20260722220000_complete_foreign_key_indexes.sql`
9. `20260722221500_consolidate_overlapping_rls_policies.sql`
10. `20260722223000_finish_rls_policy_consolidation.sql`
11. `20260722224500_block_profile_privilege_escalation.sql`
12. `20260804144500_explicit_data_api_table_grants.sql`
13. `20260804235500_fiuu_pos_dynamic_qr.sql`
14. `20260805170000_backfill_profile_legal_entity_from_staff.sql`

Before execution, run a linked migration list and dry-run against the independently verified Production reference. Stop if any additional migration appears. Never use `migration repair` merely to make the version lists look equal. The historical Production SQL was recovered and reviewed outside the repository; only the no-op version markers belong in clean replay because the later canonical migrations contain the required corrections.

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
