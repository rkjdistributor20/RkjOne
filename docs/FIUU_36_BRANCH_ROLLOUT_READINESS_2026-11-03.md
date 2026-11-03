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

## Prepared code package — not activated

Branch `codex/fiuu-production-rollout` now contains a fail-closed 36-branch OPA
package. It accepts canonical `BR001` through `BR036` only, requires an explicit
environment allowlist and complete six-field server-only mapping
(`organizationId`, `branchId`, `applicationCode`, `secretKey`, `storeId` and
`terminalId`), and adds a database
rollout record bound to organization, branch and a SHA-256 Application Code
fingerprint. The migration creates no rollout row and activates no branch.

The final verification on 3 November 2026 passed:

- Vitest package suite: `239/239`, including `14/14` rollout-migration
  contract tests;
- TypeScript: `npx tsc --noEmit --pretty false`;
- targeted ESLint for every changed application/test file;
- Next.js production build: all `163` pages generated; and
- `git diff --check`.

The complete migration also passed a real PostgreSQL transactional replay in
the linked staging project. It was executed as
`BEGIN; <migration>; ROLLBACK;`, returned `Success. No rows returned`, and a
follow-up `to_regclass('public.pos_fiuu_opa_branch_rollouts')` check returned
`false`. This proves the migration parsed and completed against the staging
schema without leaving the rollout table or any rollout row behind. It does
not authorize or perform a persistent staging/Production migration, deploy an
environment change, or provision an `ACTIVE` rollout row.

## Live read-only audit

The following counts were read from the linked projects on 3 November 2026. No
row, environment value, deployment or provider setting was changed.

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
| Fiuu pilot migrations | Present in staging | 0 of 6 present | Reviewed forward-only package |

Production `BR012` also has no current tablet record. Pending devices must never
be bulk-marked active; each physical tablet must be enrolled, attested and
tested at its assigned branch.

The linked Fiuu mailbox contains channel-activation notices for every
`masterkayajunus01` through `masterkayajunus36`. This confirms that all 36
submerchant/channel records were announced as activated by Fiuu. It does not
prove that the tenant-bound OPA mapping (`organizationId`, `branchId`,
`applicationCode`, `secretKey`, `storeId`, `terminalId`) has been issued and
verified for each branch.

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

## Settlement evidence

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
   `terminalId` for every branch. Keep secrets server-only.
2. Prove one fresh BR001 OPA payment with a valid signed notification, status
   `00`, exact amount and references, and exact-once receipt/stock/shift output.
3. Produce and inspect the physical BR001 customer receipt; the database
   receipt row alone does not close the print/format gate.
4. Resolve the redacted unresolved provider transaction through Finance and
   preserve its audit trail in the approved evidence store.
5. Activate `BR012`, create its current device record and verify its physical
   tablet.
6. Complete asset, native-app, screen-lock, Device Owner and kiosk attestation
   for every tablet in the intended rollout batch.
7. Apply the reviewed forward-only migration persistently in staging during an
   approved rollout window, then pass signed callback, cross-branch,
   cross-tenant, duplicate-callback, timeout, expiry and recovery UAT. The
   non-persistent transactional staging replay is already complete.
8. Create a current Production recovery point and name the rollback owner and
   monitoring window.
9. Obtain fresh owner confirmation immediately before each Production
   migration, environment change and deployment. A real payment or refund also
   requires its own action-time confirmation.

## Safe rollout sequence

1. Keep Production manual and the dynamic allowlist empty.
2. Complete and soak BR001 in staging/Preview.
3. With fresh Production approval, apply the migration and deploy while still
   manual and with no dynamic branch enabled.
4. Enable BR001 only, monitor callback latency, reconciliation, receipt, stock,
   shift and settlement, then complete Finance sign-off.
5. Roll out in small reversible batches only after each batch has complete
   provider mappings and tablet attestation. Do not enable all 36 at once.
6. On any mismatch, stop new QR creation by returning to manual mode, but retain
   the explicit allowlist, server-only mappings and callback path until all
   already-issued intents and settlement checks clear. Disable new recovery
   scheduling only after the unresolved queue is drained, and preserve all
   payment evidence.
