# Fiuu 36-branch rollout readiness — 2026-11-03

## Decision

The 36-branch rollout is **prepared but NO-GO for activation**. Production must
remain `POS_QR_PAYMENT_MODE=manual` and `BR002` through `BR036` must not be
enabled until the BR001 signed-provider, receipt, stock, shift and settlement
gates pass. This report authorizes no Production migration, environment change,
deployment, terminal activation, charge or refund.

The preferred broad-rollout transport is signed **Fiuu OPA Dynamic DuitNow QR**
with one explicit provider mapping per branch. VT App-to-App and VT+ cloudECR
remain BR001-only fallbacks and must not be used as a bulk-rollout shortcut.

Staff instructions for the currently safe all-branch manual/static workflow and
the separate BR001 automatic pilot are maintained in
[`FIUU_BRANCH_STAFF_QUICK_GUIDE.md`](./FIUU_BRANCH_STAFF_QUICK_GUIDE.md).

## Prepared code package — not activated

Branch `codex/fiuu-production-rollout` now contains a fail-closed 36-branch OPA
package. It accepts canonical `BR001` through `BR036` only, requires an explicit
environment allowlist and complete seven-field server-only mapping
(`organizationId`, `branchId`, `applicationCode`, `secretKey`, `storeId` and
`terminalId`, plus non-secret `credentialVersion`), and adds a database rollout
record bound to organization, branch and a full SHA-256 configuration
fingerprint. The fingerprint covers `environment`, `applicationCode`, `storeId`,
`terminalId` and `credentialVersion`; `secretKey` is never hashed or stored in
the rollout registry. The migration creates no rollout row and activates no
branch.

New OPA intent creation and dynamic-mode advertising are both fail-closed behind
an explicit `is_pos_fiuu_opa_branch_active` database RPC check. The exact
tenant, branch and configuration fingerprint must be `ACTIVE`; missing, error,
false or any other lifecycle state cannot create or advertise a payable QR.
Lifecycle is `DRAFT -> VERIFIED -> ACTIVE -> DRAINING -> REVOKED`.
`DRAINING` blocks new intents but preserves reconciliation for already-issued
intents, and it may become `REVOKED` only after the unresolved queue is clear.

The final verification on 3 November 2026 passed:

- Vitest package suite: `264/264`, including `16/16` rollout-migration
  contract tests;
- TypeScript: `npx tsc --noEmit --pretty false`;
- targeted ESLint for every changed application/test file;
- Next.js production build: all `163` pages generated; and
- `git diff --check`.

### 4 November staging SQL repair

A fresh linked-staging database lint exposed PostgreSQL JSON extraction
precedence errors in five OPA runtime functions. Forward-only migration
`20261104120000_fix_fiuu_opa_json_precedence.sql` now parenthesizes every
fingerprint input before string concatenation without changing rollout rows,
payment rows, receipts, stock, branch/device records, credentials, function
identity, ownership, grants or trigger attachments.

The repair was applied to linked staging project `rkj-one-staging-my` only.
Post-apply verification returned an empty error-level database lint result,
matched every local and remote migration through `20261104120000`, and a fresh
dry-run reported the remote database up to date. The application package then
passed `284/284` Vitest tests, TypeScript, ESLint, the 163-page Next.js
production build and `git diff --check`.

Production was not changed. The complete Production Fiuu chain now consists of
nine unapplied forward migrations: the original six pilot migrations, two
36-branch rollout-control migrations and this precedence repair. Applying only
a subset is prohibited because the staging repair depends on the preceding OPA
functions being installed in order.

The complete migration first passed a real PostgreSQL transactional replay in
the linked staging project after the final trigger-readiness hardening. It was
executed as `BEGIN; <migration>; assertions; ROLLBACK;` and returned
`dry_run=passed`, `rollout_control_ready=true`, `rollout_rows=0` and
`persistent_change=false`. A separate follow-up probe returned
`rollback_verified=true`, `rollout_table_exists=false` and
`readiness_rpc_exists=false`.

After separate explicit staging-only approval on 3 November 2026, the same
reviewed migration was applied persistently to `rkj-one-staging-my`. The
post-commit result returned `staging_apply=passed`,
`rollout_table_exists=true`, `readiness_rpc_exists=true`,
`rollout_control_ready=true`, `rollout_rows=0` and `active_rows=0`. A fresh
independent query then returned `persistent_install=true`,
`all_branches_locked=true`, `rollout_control_ready=true`, `rollout_rows=0` and
`active_rows=0`. The current Preview `/api/health` response remained
`{"ok":true,"status":"ready"}`. No mapping, environment value or rollout row
was added, so BR001 and BR002-BR036 remain inactive. Production was not opened,
migrated, configured or deployed by this staging operation.

### 3 November continuation evidence

A fresh authenticated Preview preflight reached the branch-target mapping gate
and failed closed at `target-mapping-identifiers`. The branch-scoped Vercel
Secret is write-only and cannot be safely corrected without the complete
provider-issued sandbox tuple. The authenticated Fiuu Store Management view
contained no store/application record, and a focused search of the registered
merchant mailbox found the Application `121582` OPA ticket but no supplied
Application Code/Secret Key pair. The provider reply in that thread states that
Application `121582` did not have submitted store information and requests the
add-on-store workflow before a store can be provisioned.

The staging rollout table was then rechecked with a read-only query. It returned
`migration_installed=true`, `br001_rollout_rows=0`, `br001_active_rows=0`,
`br002_36_rollout_rows=0`, `br002_36_active_rows=0` and `all_active_rows=0`.
The targeted OPA migration, hardening, server-mapping and preflight suites pass
`53/53`, and TypeScript and targeted ESLint pass with no diagnostics. No
placeholder fingerprint was
inserted: activation remains blocked until Fiuu supplies one internally
consistent BR001 sandbox Application Code, Secret Key, Store ID and Terminal ID.
Production and `BR002`-`BR036` remain unchanged.

A follow-up migration then closed a database-level organization-status gap
without creating or transitioning rollout data. The rollout trigger now locks
the branch and its owning organization and refuses `ACTIVE` unless both remain
active. The runtime activation RPC independently requires an `ACTIVE` rollout,
branch and organization on every new-payment check. The issued-intent
generation matcher was deliberately left unchanged so already-issued payments
can still drain and reconcile after creation is disabled.

The linked CLI was verified as staging project `rkj-one-staging-my`
(`lktggxwgaormnzfwcogx`), not Production. The base migration was wrapped in an
explicit transaction so its fail-closed payment lock works through the
Supabase migration runner. Both migration versions `20261103120000` and
`20261103123000` were then recorded successfully in staging. A fresh independent
post-migration query returned `control_ready=true`,
`base_migration_recorded=true`, `organization_gate_recorded=true`,
`runtime_requires_active_organization=true`, `all_rollout_rows=0`,
`all_active_rows=0`, `br001_rollout_rows=0`, `br002_36_rollout_rows=0` and
`br002_36_active_rows=0`. Production was not opened or changed.

A staging-only transactional dry-run then exercised the organization gate with
temporary synthetic organization, region, branch and rollout records. The
trigger rejected activation while the organization was suspended, the runtime
gate returned true only while the organization, branch and rollout were all
active, and returned false again after the organization was suspended. The
transaction ended with `ROLLBACK`. A separate post-rollback query confirmed
`synthetic_organization_rows=0`, every rollout count still `0`, both migrations
still recorded and the runtime organization gate still present. A final linked
CLI dry-run reported the staging database up to date with no pending migration.

## Live read-only audit

The following operational counts were read from the linked projects on 3
November 2026. The subsequent staging-only schema installation described above
created no rollout row and changed no environment value, deployment or provider
setting.

| Gate | Staging | Production | Required before activation |
| --- | ---: | ---: | --- |
| Branch records | 36 active | 36 total; 35 active | 36 active |
| Branch exception | None | `BR012` inactive | None |
| Current tablet records | 36 | 35 | 36 |
| Active tablets | 1 | 7 | One verified active tablet per branch |
| Pending tablets | 35 | 28 | 0 for an activated batch |
| Seen in the last seven days | 1 | 0 | Every activated tablet |
| Native RKJ One app | 1 | 5 | Every activated tablet |
| Complete asset record | 1 | 7 | Every activated tablet |
| Hardware profile | 1 | 7 | Every activated tablet |
| Secure screen lock | 1 | 5 | Every activated tablet |
| Android Device Owner | 0 | 0 | Every activated tablet |
| Kiosk/lock-task active | 0 | 0 | Every activated tablet |
| Fiuu migration chain | 9 of 9 present; lint clean | 0 of 9 present | Apply the reviewed ordered package only after every Production gate passes |

Production `BR012` also has no current tablet record. Pending devices must never
be bulk-marked active; each physical tablet must be enrolled, attested and
tested at its assigned branch.

The linked Fiuu mailbox contains channel-activation notices for every
`masterkayajunus01` through `masterkayajunus36`. This confirms that all 36
submerchant/channel records were announced as activated by Fiuu. It does not
prove that the tenant-bound OPA mapping (`organizationId`, `branchId`,
`applicationCode`, `secretKey`, `storeId`, `terminalId`, `credentialVersion`)
has been issued and verified for each branch.

The linked BR001 Samsung tablet is reachable from the authorized PC. The
official Fiuu Virtual Terminal app reports version `3.5.13`; a fresh read-only
screen check shows an authenticated `MASTERKAYAJUNUS01` Quick Pay dashboard,
so installation, activation and the current BR001 VT session are present. This
is not evidence of an OPA signed callback, Device Owner, lock-task/kiosk
control, or readiness of the other 35 physical tablets.

Merchant Portal access remains an operational blocker: Google SSO returned an
HTTP 403 callback and the available direct-login record was not accepted. Do
not retry guessed passwords or weaken account controls; recover access through
the merchant's approved credential flow before any portal-side configuration.

## 4 November BR001 VT App-to-App evidence — rollout decision unchanged

One controlled physical BR001 Fiuu VT App-to-App payment for RM3.50 completed
in Preview/staging. RKJ One recorded the payment as `PAID` and its transaction
as `COMPLETED`, created exactly one receipt, four expected stock-deduction
records and four stock-movement records, updated the active-shift QR aggregate
once, and left no unresolved `PENDING` or `REPORTED` attempt. A matching Fiuu
payment-success email was observed, and the physical customer receipt printed
successfully. Identifiers, gateway references, QR payloads and credentials are
omitted.

This closes the BR001 operational payment, receipt, stock and shift evidence
for the VT App-to-App transport only. It does not prove a signed OPA
notification, OPA branch mapping, provider settlement, bank credit, Device
Owner/kiosk readiness, or readiness of BR002-BR036. No Production migration,
environment value, payment mode, deployment or non-BR001 activation changed.

At audit time, no new Fiuu settlement report or corresponding bank credit had
been matched to this RM3.50 transaction. The 30 October RM2.50 settlement
evidence below is historical and must not be reused for the 4 November payment.
Production therefore remains `POS_QR_PAYMENT_MODE=manual`, and BR002-BR036
remain inactive.

## 4 November repeat BR001 VT payment evidence — rollout decision unchanged

A second controlled physical BR001 Fiuu VT App-to-App payment for RM2.50
completed in Preview/staging. The payment reached `PAID`, its transaction
reached `COMPLETED`, provider SALE/status evidence was present, and RKJ One
created exactly one receipt, three expected stock-deduction rows and three
stock-movement rows. The active shift read RM11.00 QR across six transactions,
the provider reference appeared once, and no `PENDING` or `REPORTED` attempt
remained. A fresh Fiuu payment-success email matched the amount and time, and
the physical customer receipt printed successfully. Provider, order, receipt
and gateway identifiers remain redacted.

This repeat run confirms operational consistency of the BR001 VT path; it does
not turn the unsigned App-to-App result into signed OPA evidence. A read-only
mailbox check found no new settlement notification for the 4 November
payments, so Finance still must match both fresh transactions to their new
settlement report and corresponding bank credits. Production remains manual,
and BR002-BR036 remain inactive.

## Historical settlement evidence — 30 October 2026

The official Fiuu settlement report for 30 October 2026 contains two settled
RM2.50 provider transactions, each with RM2.48 net settlement:

| Provider transaction | RKJ order | Provider settlement | Local state |
| --- | --- | --- | --- |
| Redacted matched reference | Redacted order reference | `SETTLED` | `PAID`; one redacted sale, receipt, stock and shift fulfilled once by approved manual reconciliation |
| Redacted unresolved reference | Redacted order reference | `SETTLED` | Local intent remains `EXPIRED`, unlinked and unresolved |

The report totals RM4.96 net. Bank-account details and the original CSV are not
stored in Git. Settlement evidence closes the provider-settlement check for the
matched payment, but it does **not** prove an automatic signed callback. The
unresolved provider transaction requires a separate Finance decision; do not
create a sale or issue a refund without a specifically approved workflow.

## Remaining hard gates

1. Record the exact RKJ One `organizationId` and `branchId`, then obtain the
   provider-issued OPA `applicationCode`, `secretKey`, `storeId` and
   `terminalId` for every branch. Assign and record a non-secret
   `credentialVersion` for each exact credential generation. Keep secrets
   server-only.
2. Prove one fresh BR001 OPA payment with a valid signed notification, status
   `00`, exact amount and references, and exact-once receipt/stock/shift output.
3. Finance must match both fresh 2026-11-04 BR001 VT payments (RM3.50 and the
   repeat RM2.50) to their new Fiuu settlement report and corresponding bank
   credits. Until this passes, BR001 promotion and every BR002-BR036 activation
   remain `NO-GO`.
4. Resolve the redacted unresolved provider transaction through Finance and
   preserve its audit trail in the approved evidence store.
5. Activate `BR012`, create its current device record and verify its physical
   tablet.
6. Complete asset, native-app, screen-lock, Device Owner and kiosk attestation
   for every tablet in the intended rollout batch.
7. Pass signed callback, cross-branch, cross-tenant, duplicate-callback,
   timeout, expiry and recovery UAT in staging. The persistent staging schema
   installation is complete and its empty registry keeps every branch locked.
8. Provision and verify a BR001 staging-only rollout mapping before testing the
   `ACTIVE` RPC gate, and preserve evidence that a real scheduler invoked
   the authenticated reconciliation worker and produced monitored bounded-retry
   results. The readiness RPC already returns `true`; environment flags and a
   stored worker secret are not scheduler proof.
9. Create a current Production recovery point and name the rollback owner and
   monitoring window.
10. Obtain fresh owner confirmation immediately before each Production
   migration, environment change and deployment. A real payment or refund also
   requires its own action-time confirmation.

## Safe rollout sequence

1. Keep Production manual and the dynamic allowlist empty.
2. Complete and soak BR001 in staging/Preview, including readiness RPC and real
   scheduler evidence.
3. With fresh Production approval, apply the migration and deploy while still
   manual and with no dynamic branch enabled.
4. With a separate fresh approval, provision the exact BR001 seven-field
   mapping and matching configuration fingerprint, verify the explicit
   `ACTIVE` RPC gate, and enable BR001 only. Monitor callback latency,
   reconciliation, receipt, stock, shift and settlement, then complete Finance
   sign-off.
5. Roll out in small reversible batches only after each batch has complete
   provider mappings, fresh action-time approval and tablet attestation. Do not
   enable all 36 at once; `BR002`-`BR036` remain inactive until every BR001 gate
   is closed.
6. On any mismatch, transition the affected rollout from `ACTIVE` to
   `DRAINING` and return creation mode to manual with fresh approval. Retain the
   explicit allowlist, server-only mappings, callback path and recovery worker
   until all already-issued intents and settlement checks clear. Only then move
   `DRAINING -> REVOKED`, disable scheduling and preserve all payment evidence.
