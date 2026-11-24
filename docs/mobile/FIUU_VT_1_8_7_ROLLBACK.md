# Fiuu VT 1.8.7 production recovery plan

Prepared: 2026-11-24

## Recovery evidence before migration

- Linked database project: `RKJ One Production`.
- Latest verified managed physical backup: `2026-11-23 14:58:23 UTC`; Supabase exposes a restore action for it.
- Point-in-time recovery is not enabled.
- A fresh schema-only production snapshot was stored outside the repository in the protected local RKJ One backup directory.
- Schema snapshot SHA-256: `361DC91A5D12333D056A6188DFDDA339A64B4A3761FC0D59B3EE31D89B80040A`.
- The two release migrations are additive: they add one partial index, two received-callback recovery RPCs, one service-role heartbeat table and two heartbeat RPCs. They do not rewrite sales, payments, receipts or stock rows.

## Preferred rollback

1. Keep `POS_FIUU_VT_CASHIER_RELEASE_BRANCHES` empty so no new cashier lane can be detached.
2. Disable `FIUU_VT_RECOVERY_ENABLED` if the worker itself is producing invalid results.
3. Promote the last verified Vercel production deployment and verify `/api/health` and `/api/release`.
4. Leave the additive database objects in place. The previous application ignores them, avoiding a destructive database rollback.
5. Reconcile every `PENDING`, `REPORTED` and review-required Fiuu VT payment before reopening any branch gate.

## Emergency database object rollback

Use only after the previous application deployment is restored and the recovery worker is disabled. In one reviewed transaction, remove these release-only objects:

- `public.recover_pos_fiuu_vt_received_attempt(uuid)`
- `public.list_pos_fiuu_vt_received_attempts(uuid[], text[], integer)`
- `public.idx_pos_fiuu_vt_attempts_received_recovery`
- `public.has_recent_pos_fiuu_vt_recovery_success(integer)`
- `public.record_pos_fiuu_vt_recovery_success()`
- `public.pos_fiuu_vt_recovery_heartbeat`

Do not delete or alter `pos_online_payments`, `pos_fiuu_vt_attempts`, POS transactions, receipts or stock movements. Repair the Supabase migration ledger only after the reviewed DDL rollback succeeds.

## Restore escalation

Use the managed physical restore only for a database-wide incident that cannot be repaired with the additive-object rollback. A physical restore can lose changes after the backup timestamp and does not restore Storage objects; Finance/HQ must first preserve provider and payment evidence created after that timestamp.
