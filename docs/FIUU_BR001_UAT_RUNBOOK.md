# Fiuu BR001 Dynamic DuitNow QR UAT and rollback runbook

Last updated: 2026-10-27

## Decision and authority

The immediate BR001 UAT transport is the official **Fiuu VT App-to-App** application because it is now installed and opens on the physical Samsung `SM-X406B`. Signed **Fiuu OPA Dynamic DuitNow QR** remains the preferred architecture for wider rollout, but its dedicated Application Code and Secret Key have not been provisioned.

Fiuu VT+ with cloudECR remains a separate prepared fallback. Its package, activation and credentials are not interchangeable with the standard Fiuu VT application.

This runbook does not authorize a Production action. The safe default remains:

- Production `POS_QR_PAYMENT_MODE=manual`;
- no Production VT/OPA/cloudECR setting, secret, migration, terminal activation or deployment change without fresh owner confirmation immediately before the action;
- no real payment without fresh owner confirmation immediately before the charge;
- only `BR001` is in scope; `BR002` through `BR036` remain unchanged; and
- secrets, credentials, activation links and all QR payloads stay out of Git, chat, screenshots and logs.

## Read-only checkpoint — 2026-10-27

The reviewed branch is `codex/fiuu-production-rollout`. The official standard
VT package `com.rms.mobile.razervt` is installed and reaches its activation
screen on the BR001 Samsung. This confirms device compatibility only; it does
**not** prove that the app is activated to `masterkayajunus01`, that the
terminal settles to BR001, or that a payable QR may be generated.

The current Preview remains **NO-GO** for a payable BR001 VT UAT until the
provider supplies an activation code/QR explicitly mapped to
`masterkayajunus01`, the intended BR001 terminal and BR001 settlement. An
activation link found for the root merchant is not acceptable evidence for
that mapping and must not be used. Activation material and QR payloads remain
secret and must not be copied into Git, chat, screenshots or logs.

No Production setting, Production database, real payment, Fiuu portal setting,
or BR002-BR036 branch was changed during this audit. The next controlled stage
is staging/Preview only: deploy the BR001 server/database hard lock, activate
the VT application with provider-approved BR001 material, enable the BR001-only
Preview mode and repeat the preflight before a real payment. A real payment and
every Production action require separate action-time confirmation.

## Transport decision table

| Path | Hardware dependency | Verification | BR001 decision |
| --- | --- | --- | --- |
| **OPA Dynamic DuitNow QR** | Browser/PWA and network only | HMAC-SHA256 request/response plus signed server notification | Preferred broad-rollout path; credentials unavailable |
| **Fiuu VT+ + cloudECR** | Official `com.fiuu.cloudecrvt`, activation, secret and POS binding | HMAC-SHA256 server API | Prepared fallback; physical app currently splash-blocked |
| **VT App-to-App** | Official `com.rms.mobile.razervt`, provider activation and RKJ native app | Unsigned Android deep-link SALE followed by STATUS | **Selected BR001 UAT path; activation mapping pending** |
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

Before enabling OPA in Preview/staging, obtain the following provider-issued BR001 values through an approved secure channel:

- OPA Application Code;
- OPA Secret Key;
- Store ID;
- Terminal ID; and
- confirmation that DuitNow QR channel `24` is active for the same application/store.

One Application Code is treated as one store. RKJ One Production requires an explicit branch mapping containing all four values; it will not invent a Store ID or Terminal ID. Store ID and Terminal ID must each be 4–20 permitted characters.

The server-only mapping shape is:

```json
{
  "BR001": {
    "applicationCode": "provider-issued-code",
    "secretKey": "provider-issued-secret",
    "storeId": "provider-approved-store-id",
    "terminalId": "provider-approved-terminal-id"
  }
}
```

Never commit the real mapping. Enter it directly into the intended Vercel environment as `POS_FIUU_APPLICATIONS_JSON`. Do not paste it into chat.

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

No Production schedule is included in this change. In Preview, invoke the
endpoint only after the BR001 QR expiry plus ten seconds. One authenticated
invocation handles one BR001 payment and, while the provider keeps returning a
signed pending status, performs at most six inquiries at +10, +20, +30, +40,
+50 and +60 seconds. It never performs a seventh inquiry or an automatic
reversal. The route has a 180-second execution budget, so the selected hosting
plan must support that duration before UAT.

`POS_QR_PAYMENT_MODE=fiuu` alone does not expose dynamic QR. The server also requires the explicit OPA branch allowlist and currently hard-locks it to `BR001`; empty, wildcard, malformed or non-BR001 entries fail closed. The official DuitNow pre-create validity range is 60–180 seconds. RKJ One defaults to 180 and rejects/falls back from values outside that range.

Configure the Fiuu real-time notification endpoint for the intended Preview host:

```text
https://<preview-host>/api/pos/qr-payments/webhook
```

Do not point Fiuu at Production while testing Preview. Keep the webhook available after creation mode is returned to `manual` so an already-issued valid callback can reconcile safely.

## Read-only preflight

Complete these checks before generating any payable QR:

1. Confirm the deployment uses the intended non-Production database and Production remains `manual`.
2. Confirm the secure mapping contains `BR001` only and includes Application Code, Secret Key, Store ID and Terminal ID.
3. Confirm the OPA environment and pre-create host match; no custom or sandbox host is accepted in Production.
4. Confirm channel ID is exactly `24`, currency is `MYR`, and QR validity is 60–180 seconds.
5. Confirm the notification URL is configured for the same Preview deployment.
6. Exercise HMAC verification, invalid-signature rejection, host allowlisting and idempotency using fixtures.
7. Confirm the official BR001 device, authenticated staff, active UAT shift and opening stock are ready.
8. Confirm Finance is available to inspect the provider portal and later settlement.

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

The package must include migration
`20261026133000_add_fiuu_opa_inquiry_recovery.sql`, a server-only recovery
secret, and an approved scheduler/monitoring method. Applying the migration,
adding the secret, enabling a schedule or changing the payment mode are all
separate Production actions that require fresh confirmation at the moment of
execution.

Request fresh owner confirmation immediately before any Production migration, environment change, deployment or real charge.

Rollback procedure:

1. Stop creating new dynamic QR intents.
2. Inventory unresolved payments and provider references.
3. With action-time approval, set Production back to `POS_QR_PAYMENT_MODE=manual`.
4. Keep callback reconciliation available for already-issued QR codes.
5. Preserve payment, receipt, stock, audit and settlement evidence.
6. Reconcile or refund through the documented provider process; never fabricate a local failure.

## cloudECR/VT+ fallback gate

Do not activate the cloudECR fallback until the official VT+ app opens beyond its splash screen and all of these are provider-confirmed for BR001: merchant/POS account, Device ID, Terminal SN/TID, matching VT+/server Secret Key, connected terminal and DuitNow channel. The implementation uses an 80-second transaction window, exact signed response matching, one unresolved SALE per terminal, durable `REPORTED` evidence and controlled `getLast` recovery. Those controls are ready locally but do not override the physical app blocker.

## Final rollout rule

BR001 is the only dynamic-payment pilot. A passing BR001 OPA payment, receipt, stock, shift and settlement UAT creates evidence for a later rollout proposal; it does not authorize `BR002-BR036`.
