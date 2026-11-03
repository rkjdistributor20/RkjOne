# Fiuu BR001 Dynamic DuitNow QR UAT and rollback runbook

Last updated: 2026-11-03

## Decision and authority

The current BR001 UAT target is signed **Fiuu OPA Dynamic DuitNow QR**, which is
also the preferred architecture for wider rollout. Its tenant-bound seven-field
mapping of `organizationId`, `branchId`, Application Code, Secret Key, Store ID,
Terminal ID and non-secret `credentialVersion` still has not been securely
provisioned. The official **Fiuu
VT App-to-App** application is installed and
opens on the physical Samsung `SM-X406B`, but the completed VT payment did not
return a native `STATUS=00`; it therefore remains a BR001-only fallback rather
than accepted proof of automatic verification.

Fiuu VT+ with cloudECR remains a separate prepared fallback. Its package, activation and credentials are not interchangeable with the standard Fiuu VT application.

This runbook does not authorize a Production action. The safe default remains:

- Production `POS_QR_PAYMENT_MODE=manual`;
- no Production VT/OPA/cloudECR setting, secret, migration, terminal activation or deployment change without fresh owner confirmation immediately before the action;
- no real payment without fresh owner confirmation immediately before the charge;
- only `BR001` is in scope; `BR002` through `BR036` remain unchanged; and
- secrets, credentials, activation links and all QR payloads stay out of Git, chat, screenshots and logs.

## Controlled checkpoint — 2026-10-27

The reviewed branch is `codex/fiuu-production-rollout`. The official standard
VT package `com.rms.mobile.razervt` is installed on the BR001 Samsung and was
activated, with fresh owner confirmation, under the Fiuu portal account
`masterkayajunus01`. The portal and the application both show the terminal as
active. No activation code, terminal identifier, credential or QR payload is
recorded in Git or this runbook.

RKJ One Staff `1.7.0` is also installed from Google Play. That store build is a
Production wrapper whose Capacitor host is `https://rkj.one`; it must not be
used for Preview UAT. The current Preview therefore remains **NO-GO** for a
payable BR001 VT UAT until a Preview-bound `1.7.0-debug` build is installed and
the remaining branch, device, shift and unresolved-payment checks pass.

The Fiuu terminal activation was the only provider-side Production mutation
completed in this stage. No RKJ Production environment, database, migration or
deployment was changed, no real payment was made and BR002-BR036 remain
unchanged. The next controlled stage is staging/Preview only: deploy the BR001
server/database hard lock and live-terminal warning, install the Preview-bound
native build, enable the BR001-only Preview mode and repeat the preflight. A
real payment and every further Production action require separate action-time
confirmation.

## Controlled payment checkpoint — 2026-10-28

The owner completed one RM2.50 DuitNow QR payment for a Preview order. Fiuu's
official payment-success email matches merchant `RNR Juru Arah Selatan`, amount
RM2.50 and 28 October 2026 at 02:05 MYT. The real order and provider transaction
identifiers are redacted from Git. No second charge was initiated during
reconciliation.

The native VT SALE/STATUS return did not reach RKJ One, so this payment does
**not** pass automatic App-to-App `STATUS=00` verification. After explicit
action-time owner approval, the existing paid intent was reconciled once in
staging using an atomic, fail-closed database transaction. The stored evidence
is deliberately labelled `FIUU_PAYMENT_SUCCESS_EMAIL`,
`MANUAL_RECONCILIATION` and `automaticVerification=false`; no synthetic native
callback or `STATUS=00` evidence was created.

Post-commit verification returned:

- payment `PAID` with its provider/gateway reference retained only in the approved evidence store;
- one completed sale for RM2.50, with its identifier redacted from Git;
- one receipt;
- three BOM stock deductions and three stock movements;
- shift totals RM32.50 gross, RM2.50 QR and three transactions; and
- one occurrence only of the provider transaction reference.

An earlier provider-paid transaction, whose identifier is redacted from Git,
remains intentionally unlinked to a local sale: its local intent is still
`EXPIRED`, with no local transaction or gateway reference. Finance must decide its separate
reconciliation/refund treatment before settlement sign-off. Do not silently
create a second sale or refund it without a separately approved provider
workflow.

The exact-once local sale/receipt/stock/shift path therefore passes under
controlled manual recovery, while automatic VT confirmation and settlement
remain **NO-GO**. Production, `BR002` through `BR036`, Production migrations,
environment values and deployments remain unchanged.

## Settlement and fleet checkpoint — 2026-11-03

Fiuu's official 30 October 2026 settlement report contains both RM2.50 provider
transactions. Each settled at RM2.48 net, for RM4.96 total. The matched
transaction reconciles to the staging sale, so its provider settlement
evidence passes. The second transaction is also provider-settled but still
locally `EXPIRED` and unlinked. Both real identifiers are redacted from Git.
This discrepancy remains a Finance
blocker and must not be converted into a sale or refund without a separately
approved workflow. The settlement file's bank details are deliberately not
recorded in Git.

A fresh read-only fleet audit found 36 active staging branches but only one
active staging tablet. Production has 36 branch rows, with `BR012` inactive;
35 current tablet rows; seven active and 28 pending tablets; zero recently seen
tablets; five native-app installations; seven complete asset records; and zero
Device Owner or kiosk-compliant tablets. None of the six Fiuu pilot migrations
is present in Production. The detailed evidence and gate sequence are in
`docs/FIUU_36_BRANCH_ROLLOUT_READINESS_2026-11-03.md`.

Provider settlement for the matched payment is no longer the blocking item.
Automatic signed confirmation, the unresolved settled transaction, BR012,
per-branch provider mappings, tablet compliance and the Production migration
gate remain **NO-GO**. Production and `BR002` through `BR036` remain unchanged.

## Transport decision table

| Path | Hardware dependency | Verification | BR001 decision |
| --- | --- | --- | --- |
| **OPA Dynamic DuitNow QR** | Browser/PWA and network only | HMAC-SHA256 request/response plus signed server notification | Preferred broad-rollout path; credentials unavailable |
| **Fiuu VT+ + cloudECR** | Official `com.fiuu.cloudecrvt`, activation, secret and POS binding | HMAC-SHA256 server API | Prepared fallback; physical app currently splash-blocked |
| **VT App-to-App** | Official `com.rms.mobile.razervt`, provider activation and RKJ native app | Unsigned Android deep-link SALE followed by STATUS | **BR001 physical payment completed; native callback missing, so automatic verification did not pass** |
| **Static branch QR** | Browser/PWA only | Cashier confirmation and Finance reconciliation | Operational fallback only; not automatic verification |

Credentials and readiness evidence are not interchangeable between these paths.

## VT App-to-App activation gate

Before enabling `fiuu_vt` in Preview, all of the following must be true:

- the Fiuu VT activation code or QR was issued for submerchant `masterkayajunus01` and the intended BR001 terminal;
- Fiuu confirms the MID/TID or terminal identity and settlement belong to BR001;
- the official tablet reports the standard VT package installed and trusted;
- RKJ One native Android 1.7.0 is installed; Chrome/PWA is not used for App-to-App launch;
- migration `20261027120000_harden_fiuu_vt_br001_pilot.sql` is applied to staging;
- Preview contains exactly `POS_QR_PAYMENT_MODE=fiuu_vt`, `POS_FIUU_VT_BRANCHES=BR001` and `POS_FIUU_VT_VALIDITY_SECONDS=900`; and
- there is no unresolved `PENDING` or `REPORTED` Fiuu payment for the BR001 shift/device.

The VT activation screen's four fields are an activation code, not the Merchant
ID, portal password, Verify Key, Secret Key, OPA Application Code or VT+ binding
code. Never guess or substitute one of those values.

Staging evidence on 2026-10-27: migration
`20261027120000_harden_fiuu_vt_br001_pilot.sql` is applied to
`rkj-one-staging-my`, linked migration history is synchronized and error-level
schema lint is clean. The related code passes `168/168` tests, TypeScript,
ESLint and the 163-page Next.js build. Production was not changed.

## OPA configuration gate

Before enabling OPA in Preview/staging, obtain the following BR001 values
through approved internal/provider channels:

- RKJ One organization UUID (`organizationId`);
- RKJ One BR001 UUID (`branchId`);
- OPA Application Code;
- OPA Secret Key;
- Store ID;
- Terminal ID;
- a non-secret `credentialVersion` label for this exact credential generation;
  and
- confirmation that DuitNow QR channel `24` is active for the same application/store.

One Application Code is treated as one store. Every environment requires an
explicit tenant-bound branch mapping containing all seven values; RKJ One will
not infer organization, branch, Store ID or Terminal ID. The two internal IDs
must be valid UUIDs. Store ID and Terminal ID must each be 4–20 permitted
characters. `credentialVersion` is a required non-secret 1–32 character label
using only letters, numbers, `.`, `_` or `-`.

The server-only mapping shape is:

```json
{
  "BR001": {
    "organizationId": "organization-uuid",
    "branchId": "branch-uuid",
    "applicationCode": "provider-issued-code",
    "secretKey": "provider-issued-secret",
    "storeId": "provider-approved-store-id",
    "terminalId": "provider-approved-terminal-id",
    "credentialVersion": "v1"
  }
}
```

The rollout configuration fingerprint binds the exact `environment`,
`applicationCode`, `storeId`, `terminalId` and `credentialVersion`. The Secret
Key is never hashed into that fingerprint or stored in the rollout registry.

Never commit the real mapping. Enter it directly into the intended Vercel
environment as `POS_FIUU_APPLICATIONS_JSON`. Do not paste it into chat. The
deprecated global OPA variables `POS_FIUU_APPLICATION_CODE`,
`POS_FIUU_SECRET_KEY`, `POS_FIUU_STORE_ID` and `POS_FIUU_TERMINAL_ID` must
remain unset; runtime health ignores them.

## Environment separation

| Deployment | Payment mode | Provider endpoint | Branch scope |
| --- | --- | --- | --- |
| Local automated tests | `manual` or fixtures | Mock only | Synthetic data |
| Preview/staging UAT | `fiuu` | Official OPA sandbox | Exactly `BR001` |
| Production before sign-off | `manual` | None used for creation | No dynamic branch |
| Production after all gates and fresh approval | `fiuu` | Official OPA Production | Explicit `BR001` mapping only |

Required non-secret settings for the Preview/staging pilot:

```dotenv
POS_QR_PAYMENT_MODE=fiuu
POS_FIUU_OPA_BRANCHES=BR001
POS_FIUU_ENVIRONMENT=sandbox
POS_FIUU_CHANNEL_ID=24
POS_FIUU_QR_VALIDITY_SECONDS=180
FIUU_RECONCILIATION_ENABLED=true
```

`FIUU_RECONCILIATION_ENABLED` is a dedicated default-off gate; set it only in
the intended Preview environment after the migration is applied. Also create a
server-only `FIUU_RECONCILIATION_SECRET` containing at least 32
random characters. Never expose it to the browser, repository, chat or
screenshots. The protected recovery endpoint is:

```text
POST https://<preview-host>/api/internal/pos/fiuu-opa/reconcile
Authorization: Bearer <server-only reconciliation secret>
```

No Production schedule is included in this change. A configured flag and
secret do not prove that a scheduler is running. Before UAT, retain redacted
evidence of an observed scheduler invocation, authenticated worker response,
bounded retry result and monitoring/alert path. In Preview, invoke the endpoint
only after the BR001 QR expiry plus ten seconds. One authenticated
invocation handles one BR001 payment and, while the provider keeps returning a
signed pending status, performs at most six inquiries at +10, +20, +30, +40,
+50 and +60 seconds. It never performs a seventh inquiry or an automatic
reversal. The route has a 180-second execution budget, so the selected hosting
plan must support that duration before UAT.

`POS_QR_PAYMENT_MODE=fiuu` alone does not expose dynamic QR. The server also
requires an explicit canonical `BR001`-`BR036` allowlist, a complete per-branch
seven-field provider mapping and a positive
`is_pos_fiuu_opa_branch_active` result for the same organization, branch and
full rollout configuration fingerprint. This explicit database RPC gate runs
before payment insertion/provider contact and before `/api/pos/qr-config`
advertises dynamic QR. Missing/error/false results and non-`ACTIVE` records fail
closed. For this UAT the allowlist and database rollout scope must contain
**BR001 only**. The official DuitNow
pre-create validity range is 60–180 seconds. RKJ One defaults to 180 and
rejects/falls back from values outside that range.

Rollout lifecycle is `DRAFT -> VERIFIED -> ACTIVE -> DRAINING -> REVOKED`.
Only `ACTIVE` creates new intents. `DRAINING` blocks new intents but permits
already-issued intents to receive signed callbacks, reconcile and fulfil.
`DRAINING -> REVOKED` is permitted only after no unresolved intent remains.

Configure the Fiuu real-time notification endpoint for the intended Preview host:

```text
https://<preview-host>/api/pos/qr-payments/webhook
```

Do not point Fiuu at Production while testing Preview. Keep the webhook available after creation mode is returned to `manual` so an already-issued valid callback can reconcile safely.

## Read-only preflight

Complete these checks before generating any payable QR:

1. Confirm the deployment uses the intended non-Production database and Production remains `manual`.
2. Confirm the secure mapping contains `BR001` only and includes the exact RKJ One `organizationId`, BR001 `branchId`, Application Code, Secret Key, Store ID, Terminal ID and non-secret `credentialVersion`.
3. Confirm the OPA environment and pre-create host match; no custom or sandbox host is accepted in Production.
4. Confirm channel ID is exactly `24`, currency is `MYR`, and QR validity is 60–180 seconds.
5. Confirm the notification URL is configured for the same Preview deployment.
6. Confirm `is_pos_fiuu_opa_rollout_control_ready()` returns `true`, then verify
   the exact BR001 configuration returns `true` from
   `is_pos_fiuu_opa_branch_active`.
7. Confirm an observed scheduler run successfully reached the authenticated
   recovery worker; environment configuration alone is insufficient.
8. Exercise HMAC verification, invalid-signature rejection, host allowlisting and idempotency using fixtures.
9. Confirm the official BR001 device, authenticated staff, active UAT shift and opening stock are ready.
10. Confirm Finance is available to inspect the provider portal and later settlement.

Save only redacted evidence: timestamp, deployment, commit, non-secret branch/store labels and pass/fail result.

## Controlled BR001 UAT

### Preparation

1. Obtain fresh owner approval for the exact low-value test and time window.
2. Confirm no unresolved BR001 Fiuu payment exists.
3. Open a clearly labelled UAT shift on the official BR001 tablet.
4. Use a known low-value basket and record its expected stock decrement.
5. Record the deployment commit and provider environment without recording secrets.

### Happy path

1. Generate one dynamic DuitNow QR from RKJ One.
2. Confirm the displayed amount and currency match the server-calculated sale exactly.
3. Complete one payment; do not refresh, regenerate or start another payment.
4. Accept provider success only from a valid signed notification with status `00` matching the stored Application Code, reference, amount, currency, channel and provider transaction ID.
5. Confirm the verified notification is first committed as durable, sanitized `REPORTED` evidence, then fulfilled in a separate idempotent database transaction.
6. Confirm RKJ One creates exactly one payment, sale, receipt, shift-total increment and expected stock movement.
7. Reload and repeat read-only checks. No duplicate sale, receipt or stock movement may appear.

### Recovery and negative cases

- Invalid signature, application, reference, amount, currency, channel or transaction ID: reject and fulfil nothing.
- Expired/cancelled QR with no successful notification: no sale, receipt, stock movement or shift increment.
- Duplicate valid notification: return the existing result and create nothing twice.
- Late valid callback within the bounded reconciliation grace: fulfil at most once.
- Provider success with local fulfilment error: retain `REPORTED` evidence, return a retryable acknowledgement failure, block a second payable attempt and let either a duplicate valid callback or authenticated status polling safely retry fulfilment; never relabel it unpaid or send another SALE.
- Catalogue price changed after QR creation: keep the payment `REPORTED` for Finance resolution; never issue a receipt whose totals differ from the paid, server-side pricing snapshot.
- Reused idempotency key with different branch, shift, creator, amount or basket: reject.
- Cross-branch user or device: reject.
- Missing callback after expiry: invoke the authenticated BR001 recovery worker
  once after `expires_at + 10 seconds`; confirm it accepts only a signed,
  identity-matched inquiry response and preserves all six attempts in the
  service-only audit table.
- Signed inquiry status `01` or `11`: keep the intent locked and continue only
  within the six-attempt cadence. Signed status `99`: mark the attempt failed
  without creating a sale. Six unresolved attempts: move to
  `AWAITING_REVERSAL`, block shift closure and require Finance review.
- Transport error, malformed response, signature mismatch or incomplete
  identity fields: treat the payment outcome as unknown; never create a sale,
  never issue another payable QR and never auto-reverse.

## Settlement gate

BR001 remains NO-GO until Finance matches:

- RKJ payment ID and provider transaction ID;
- merchant portal date/time, gross amount, channel and currency;
- provider Store/Terminal context;
- RKJ sale and receipt;
- exact stock movements and shift summary;
- fee, tax, adjustment and net settlement;
- settlement batch/reference and expected value date; and
- company bank credit.

Any unexplained variance is a stop condition. Store evidence only in an approved restricted location and redact credentials, customer data and bank details.

## Production decision and rollback

A BR001 Production package must identify the reviewed commit, migration list, intended environment-variable names, completed UAT/settlement evidence, rollback owner and monitoring window. It must explicitly state that `BR002-BR036` remain unchanged.

The package must include migrations
`20261026133000_add_fiuu_opa_inquiry_recovery.sql` and
`20261103120000_fiuu_opa_branch_rollout.sql`, a server-only recovery secret,
and an approved scheduler/monitoring method with observed operational proof.
Applying either migration, adding
the secret, enabling a schedule, provisioning a rollout row or changing the
payment mode are separate Production actions that require fresh confirmation
at the moment of execution.

Request fresh owner confirmation immediately before any Production migration, environment change, deployment or real charge.

Rollback procedure:

1. With fresh action-time approval, move the exact BR001 rollout from `ACTIVE`
   to `DRAINING`; this stops new intents while preserving recovery.
2. Inventory unresolved payments and provider references.
3. With action-time approval, set Production back to `POS_QR_PAYMENT_MODE=manual`.
4. Keep the branch allowlist, server-only seven-field provider mapping and callback
   reconciliation available until every already-issued intent and settlement
   check has cleared; removing them early would disable safe recovery.
5. Preserve payment, receipt, stock, audit and settlement evidence.
6. Reconcile or refund through the documented provider process; never fabricate a local failure.
7. Only after the unresolved queue is empty, and with fresh approval for that
   Production action, transition `DRAINING -> REVOKED`.

## cloudECR/VT+ fallback gate

Do not activate the cloudECR fallback until the official VT+ app opens beyond its splash screen and all of these are provider-confirmed for BR001: merchant/POS account, Device ID, Terminal SN/TID, matching VT+/server Secret Key, connected terminal and DuitNow channel. The implementation uses an 80-second transaction window, exact signed response matching, one unresolved SALE per terminal, durable `REPORTED` evidence and controlled `getLast` recovery. Those controls are ready locally but do not override the physical app blocker.

## Final rollout rule

BR001 is the only dynamic-payment pilot. A passing BR001 OPA payment, receipt, stock, shift and settlement UAT creates evidence for a later rollout proposal; it does not authorize `BR002-BR036`.
