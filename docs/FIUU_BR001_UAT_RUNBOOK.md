# Fiuu BR001 OPA Dynamic DuitNow QR UAT and rollback runbook

Last updated: 2026-10-25

## Decision and authority

The primary integration for the existing RKJ tablets is **Fiuu OPA Dynamic DuitNow QR**. It is server-to-server, uses signed requests and notifications, and does not depend on NFC, Android package compatibility, VT+ activation or terminal binding inside the tablet.

Fiuu VT+ with cloudECR remains a prepared fallback. On the physical BR001 Samsung `SM-X406B`, the official Play installation is available but the application remains on its blue splash screen despite a working Fiuu HTTPS/network path. That provider-app runtime issue is not a reason to replace the tablet or weaken RKJ One verification.

This runbook does not authorize a Production action. The safe default remains:

- Production `POS_QR_PAYMENT_MODE=manual`;
- no Production OPA/cloudECR secrets, migration or deployment change without fresh owner confirmation immediately before the action;
- no real payment without fresh owner confirmation immediately before the charge;
- only `BR001` is in scope; `BR002` through `BR036` remain unchanged; and
- secrets, credentials, activation links and all QR payloads stay out of Git, chat, screenshots and logs.

## Transport decision table

| Path | Hardware dependency | Verification | BR001 decision |
| --- | --- | --- | --- |
| **OPA Dynamic DuitNow QR** | Browser/PWA and network only | HMAC-SHA256 request/response plus signed server notification | **Primary path** |
| **Fiuu VT+ + cloudECR** | Official `com.fiuu.cloudecrvt`, activation, secret and POS binding | HMAC-SHA256 server API | Prepared fallback; physical app currently splash-blocked |
| **Legacy VT App-to-App** | Official `com.rms.mobile.razervt` | Unsigned Android deep-link SALE/STATUS | Not selected; unavailable on the registered tablets |
| **Static branch QR** | Browser/PWA only | Cashier confirmation and Finance reconciliation | Operational fallback only; not automatic verification |

Credentials and readiness evidence are not interchangeable between these paths.

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
POS_FIUU_ENVIRONMENT=sandbox
POS_FIUU_CHANNEL_ID=24
POS_FIUU_QR_VALIDITY_SECONDS=180
```

The official DuitNow pre-create validity range is 60–180 seconds. RKJ One defaults to 180 and rejects/falls back from values outside that range.

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
5. Confirm RKJ One creates exactly one payment, sale, receipt, shift-total increment and expected stock movement.
6. Reload and repeat read-only checks. No duplicate sale, receipt or stock movement may appear.

### Recovery and negative cases

- Invalid signature, application, reference, amount, currency, channel or transaction ID: reject and fulfil nothing.
- Expired/cancelled QR with no successful notification: no sale, receipt, stock movement or shift increment.
- Duplicate valid notification: return the existing result and create nothing twice.
- Late valid callback within the bounded reconciliation grace: fulfil at most once.
- Provider success with local fulfilment error: retain `REPORTED` evidence, block a second payable attempt and reconcile; never relabel it unpaid to retry.
- Reused idempotency key with different branch, shift, creator, amount or basket: reject.
- Cross-branch user or device: reject.

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
