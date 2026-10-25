# RKJ One Fiuu DuitNow QR POS Setup

Last updated: 2026-10-26

## Authoritative BR001 operating runbook

Use [FIUU_BR001_UAT_RUNBOOK.md](./FIUU_BR001_UAT_RUNBOOK.md) for OPA environment safety, BR001 go/no-go gates, preflight, controlled UAT evidence and rollback. It is deliberately credential-free and does not authorize a migration, deployment, Production environment change, real charge or outlet rollout.

The three Fiuu integration paths are separate:

- **OPA Dynamic DuitNow QR** is the primary BR001 path. It is server-to-server and has its own Application Code, Store ID, Terminal ID and Secret Key.
- **Fiuu VT+ + cloudECR** uses package `com.fiuu.cloudecrvt` and the signed cloudECR REST contract. It is retained as a prepared fallback.
- **Legacy Fiuu VT App-to-App** uses package `com.rms.mobile.razervt` and unsigned `razervt://` deep-link responses. It is retained only as a separate legacy path.

Never reuse credentials, identifiers, activation/binding material or readiness evidence between these paths.

## Current BR001 decision (2026-10-25)

The controlled RM2.50 BR001 static DuitNow QR sale passed. Transaction `TX-20261021-00001` completed once under shift `SH-20261021-0001`, the expected stock was deducted, the shift total reconciled to RM2.50 and Finance manually marked the related payment record paid. This confirms the existing RKJ One static-QR/manual sale pipeline only; it is not proof of Fiuu VT, Fiuu VT+ or cloudECR automatic confirmation.

The preferred BR001 integration is now **OPA Dynamic DuitNow QR**. It works through RKJ One and Fiuu servers, so the existing Samsung and HONOR tablets do not need NFC, a compatible legacy VT package or a working VT+ application. RKJ One already has the signed request/callback, fail-closed branch mapping, idempotent receipt and stock path required for this route. No Production migration, environment variable, payment mode, deployment, merchant configuration or outlet rollout was changed.

### Device and Play evidence recorded on 2026-10-24

- Windows Phone Link reports the connected BR001 tablet as Samsung model `SM-X406B` running Android `16`.
- Google Play account `rkjdistributor20@gmail.com` has registered two relevant devices: Samsung `SM-X406B` and HONOR `ELN2-L29`, identified by Google Play as **HONOR Pad X9a**. The HONOR device is not model `NDL2-L09` and is not an HONOR Pad X8b.
- The standard **Fiuu Virtual Terminal** listing/package used by the legacy App-to-App path is unavailable for both registered devices.
- The current **Fiuu VT+** listing is available to all devices registered under the same Google Play account. Availability establishes only Play eligibility; it does not establish an activated VT+ terminal, cloudECR entitlement, binding or payment readiness.
- The official Fiuu VT+ package was installed from Play on the physical BR001 Samsung, but remained at its blue splash screen after a clean launch. The same tablet reached `https://cloudecr.fiuu.com` over HTTPS and received the expected API-style response, so DNS/TLS/network access is working and the remaining blocker is inside the provider application/runtime or its provisioning.
- An earlier support diagnosis referred to Android 10 and an X8b device. That diagnosis appears to have used a different or assumed device profile and does not match the device metadata now observed directly in Phone Link and Google Play. Future provider troubleshooting must use the verified `SM-X406B`/Android 16 and `ELN2-L29`/HONOR Pad X9a inventory so all parties diagnose the same hardware.

The existing tablets do not need replacement for OPA. The cloudECR/VT+ fallback remains blocked until its application opens beyond the splash screen and these concrete gates pass:

1. In Merchant Portal, create or identify the BR001 VT+ terminal under **VT Activation → List → New VT Terminal**, enable cloudECR, and create or identify its POS API account. Retrieve credentials only through the portal or another approved secure channel.
2. BR001 VT+ must be activated, cloudECR-enabled and bound to the intended POS account; Play availability alone is insufficient.
3. Fiuu must confirm the per-submerchant mapping for `masterkayajunus01` through `masterkayajunus36`, including which `merchantId`, `posId`, terminal/device identifier, MID/TID and settlement context apply. Only BR001 may be activated during the pilot.
4. A physical BR001 sale, timeout/Get Last or pending inquiry recovery, exact-once RKJ receipt/stock update and Finance settlement reconciliation must pass.
5. Any required migration, Production environment value or deployment remains subject to a fresh owner confirmation immediately before the Production change.

Do not enable all outlets yet. Keep Production static/manual while OPA is configured and tested for BR001 in a controlled environment. BR002-BR036 remain outside the pilot until BR001 signed callback, receipt, stock, shift and settlement reconciliation all pass.

## Historical provider status (through 2026-10-20)

- Fiuu confirmed on 2026-10-06 that the 36 add-on stores were ready. Their branch-specific static DuitNow QR registrations have been received, validated and bundled into RKJ One.
- Fiuu confirmed on 2026-10-08 that VT App-to-App was activated. At that date, the implementation track was the BR001-only `fiuu_vt` pilot rather than the earlier OPA request draft. The direct 2026-10-24 device/Play evidence above supersedes that route recommendation because the standard Fiuu VT package is unavailable on both registered devices.
- On 2026-10-15 RKJ asked Pn Aida/Fiuu for an authenticated server status API or signed callback so a payment can be finalized without staff judgement. Pn Aida said the technical team would check. A reminder was sent on 2026-10-19; no technical answer had arrived in either registered merchant mailbox or WhatsApp by 2026-10-20.
- An older email draft requesting OPA credentials and 36-store mapping remains unsent. Do not send it as written because it predates Fiuu's VT App-to-App direction.
- Fiuu notified both merchant accounts on 2026-10-09 that **card payment channel services** were temporarily suspended until further notice. This notice does not state that DuitNow QR or VT is suspended, but card/debit must not be offered through Fiuu until written reinstatement is received.
- The 2026-10-16 FPX compliance notice requires action by 2026-12-31 only for merchants that render or manage the issuer-bank list themselves. RKJ's Fiuu Agent Payment adapter posts to Fiuu Hosted Payment Page, so Fiuu owns that list. Reassess only if a direct/seamless FPX checkout is introduced.
- Vercel currently scopes the BR001 VT settings to Preview branch `codex/fiuu-production-rollout`. No Fiuu POS mode or credential was added to Production.

## Production branch and tablet readiness audit (2026-10-20)

The owner authorized activation for all outlets, but that authorization is a rollout approval and does not replace physical tablet enrolment or payment UAT. A read-only Production audit found:

- 35 active Roti Kaya Junus branch records: `BR001`-`BR011` and `BR013`-`BR036`; `BR012` is missing or inactive and must be resolved before claiming a 36-outlet rollout;
- 6 official tablet records are `ACTIVE` (`BR001`, `BR017`, `BR018`, `BR021`, `BR023`, `BR035`) and 29 are still `PENDING`;
- all 6 active tablet records have verified asset details, but only `BR001` was seen in the last seven days;
- 4 of the 6 active tablets report the native app (`BR001`, `BR018`, `BR021`, `BR035`);
- 0 tablets report Android Device Owner, kiosk permission or active kiosk enforcement.

Do not bulk-update tablet records to `ACTIVE` and do not enable `POS_FIUU_VT_BRANCHES=BR001,...,BR036` in Production. Those changes would bypass device enrolment and falsely represent unverified tablets as payment-ready. Static QR/manual confirmation remains the Production fallback for every active branch with a matching branch record. The bundled `BR012` static QR asset cannot be operationally assigned until the branch record is restored or its inactive status is confirmed.

Use rollout batches only after the preceding gate passes: `BR001` physical payment and Finance reconciliation, then the remaining five already-enrolled tablets after native-app/kiosk remediation, then the 29 pending tablets after individual asset and Android Enterprise enrolment. Retain static QR/manual fallback and immediate rollback throughout.

## Legacy Fiuu VT App-to-App BR001 pilot (2026-10-15)

Fiuu supplied the official VT App-to-App v1.2 specification and confirmed on 2026-10-08 that the function was activated. RKJ One now has a separate `fiuu_vt` transport for a strictly allowlisted managed Android tablet. It requires Fiuu VT to be installed through Managed Google Play, launches package `com.rms.mobile.razervt` explicitly, requests merchant-presented DuitNow QR through channel `RPP_DuitNowQR-Offline`, and performs a second `STATUS` operation after the SALE result.

The VT deep-link response does **not** contain HMAC, a digital signature, nonce or server-verifiable proof. For that reason:

- SALE never creates a sale, receipt or stock movement;
- STATUS must match the random order ID, Transaction ID, amount, `MYR` and exact DuitNow channel;
- `22`, `33` and `45` remain pending; `11` and `44` close the attempt;
- `55` remains locked as pending until the bounded reconciliation grace ends, so a second payable attempt cannot overlap a late success;
- STATUS is rejected unless the matching SALE result and immutable Transaction ID were recorded first;
- STATUS `00` is recorded durably as `REPORTED`, cannot be expired into a second payable attempt and immediately directs the RKJ One client to automatic fulfillment;
- the automatic request still requires the same authenticated user, official device, branch and active shift, plus a fresh exact STATUS match;
- the service-role-only, row-locked RPC then creates at most one sale, one receipt and one stock deduction;
- shift closure locks the shift before calculating totals and remains blocked while a `REPORTED` payment awaits confirmation;
- all POS mixed payments require an exact cash-plus-QR split with no cash change, preventing drawer totals from being overstated across dynamic and static/manual fallback;
- BR002-BR036 continue using their static QR/manual workflow.

This is automatic operational confirmation, not cryptographic provider verification. A forged deep link would still need the private pending order context and exact transaction details on the enrolled device, but the Fiuu v1.2 response itself is unsigned. Signed OPA or cloudECR remains the preferred server-verifiable path for broad rollout. Configure the pilot only with:

```dotenv
POS_QR_PAYMENT_MODE=fiuu_vt
POS_FIUU_VT_BRANCHES=BR001
POS_FIUU_VT_VALIDITY_SECONDS=900
```

Do not add all branches to the allowlist before BR001 device UAT and Finance settlement reconciliation pass. Owner approval for all outlets has been recorded, but each physical device must still satisfy the Production readiness audit above. A native Android 1.7.0 (version code 17) build is required; the web/PWA alone cannot launch and validate the Fiuu VT app.

## Static QR operational fallback (2026-10-06)

Fiuu static DuitNow QR registrations for `BR001` through `BR036` are now bundled into RKJ One as versioned public payment assets. The POS resolves the selected branch through an authenticated, organization- and branch-scoped endpoint before displaying its assigned QR. In `manual` mode the cashier must verify the successful customer payment, matching amount and recipient name `ROTI KAYA JUNUS`, then tick the confirmation before RKJ One records the sale for Finance reconciliation.

All 36 generated assets were decoded and compared byte-for-byte with the Fiuu EMV payload manifest. This fallback is immediately usable without exposing any Fiuu secret. It does not convert a static QR into an automatically confirmed transaction: signed OPA callback UAT and provider-issued branch credentials remain required before `POS_QR_PAYMENT_MODE=fiuu` may be enabled in Production.

## Verified design

- Merchant: Roti Kaya Junus (`rotikayajunus` in the merchant portal).
- Product: Fiuu Offline Payment API, Pre-Create Transaction QR.
- Channel: DuitNow QR Offline, channel ID `24`, currency `MYR`.
- Merchant portal status verified on 2026-08-05: `DuitNow QR Offline` is already `Activated` at `0.80%` for this merchant account.
- Earlier portal checks showed other merchant channels as activated, but the 2026-10-09 suspension notice overrides that evidence for card payments until Fiuu confirms reinstatement in writing.
- The generic merchant Return URL, Notification URL and Callback URL are currently empty.
- Application ID `121582` is the Roti Kaya Junus POS merchant application. Its registered merchant email is `isaeee94@gmail.com`.
- Application ID `121583` is the RKJ Distributor Agent Payment merchant application. Its registered merchant email is `rkjdistributor20@gmail.com`.
- Applications `121582` and `121583` are separate merchant accounts and their credentials, callbacks, transactions and settlement evidence must never be mixed.
- The dedicated sandbox account for Roti Kaya Junus is accessible. Its Merchant ID, Verify Key and Secret Key are available in the sandbox portal. Values remain secret and are not recorded in the repository.
- Fiuu Ticket `2971942` confirms that merchant `rotikayajunus` has the offline e-Wallet channel required for OPA. Fiuu will create a separate sandbox Application Code after RKJ confirms that its sandbox account already exists; the Merchant ID must not be assumed to be that Application Code.
- Fiuu's 2026-08-21 reply said Application `121582` had no store information at that time. Fiuu subsequently confirmed on 2026-10-06 that the 36 add-on stores were ready, and the 36 static QR payloads were received. The signed cloudECR contract is documented and implemented locally. Provider-side VT+ provisioning, exact sub-account/terminal mapping, refund procedure and settlement mapping remain **To be confirmed**.
- The public Fiuu Offline Payment API v2.1.18 specification confirms the configured sandbox and Production pre-create URLs, `applicationCode` as a provider-issued OPA identifier, `storeId` and `terminalId` as merchant identifiers, `channelId=24` for DuitNow QR, form-encoded POST requests and HMAC-SHA256 support. It does not establish that the sandbox Merchant ID is an OPA `applicationCode` for this account.
- RKJ One currently supports verified branch static QR/manual confirmation for all 36 branches. Signed OPA is the primary automatic-confirmation path for BR001, while the signed cloudECR + Fiuu VT+ adapter remains a prepared fallback. Neither is enabled in Production.
- BR001-BR036 remain in static/manual mode. Do not enable `fiuu_vt`, cloudECR or VT+ payment handling in Production until the relevant physical UAT and settlement reconciliation pass and the owner confirms the exact Production action.
- The POS client now preserves an unresolved dynamic-QR intent across a page reload for the same branch and shift. It does not offer a second QR while the original intent can still receive a signed late callback.
- A database uniqueness guard also permits only one pending Fiuu intent per organization, branch, shift and cashier, covering concurrent tabs or requests beyond the client-side recovery guard.
- OPA status polling remains read-only. In BR001 cloudECR mode, status polling may acquire a database lease and call `getLast`; concurrent tabs can cause at most one provider reconciliation attempt every 180 seconds. The lease is longer than the server request window so a second query cannot replace the first query reference while it is still running.
- The BR001 target is an 80-second cloudECR transaction timeout, with the hosting route budget set higher by a safe margin. A deployment is **NO-GO** if configuration or code rejects `80000`, if the platform ends the request earlier, or if pending/`getLast` recovery is not proven. A timeout must retain the durable intent and must never trigger a second SALE automatically.
- Every cloudECR SALE uses a unique 20-character reference stored as transaction metadata. Every `getLast` uses a different unique query reference; a successful recovery is accepted only when the signed response returns the original SALE reference in metadata and matches the configured POS ID, Device ID, Terminal SN, amount, currency and DuitNow channel.
- A signed `00/00` response is persisted first as `REPORTED` with its Fiuu Transaction ID and exact verified response payload. Receipt, stock and shift fulfilment is then idempotently retried from that durable state without sending another SALE. A failed or ambiguous `getLast` never converts the original payment to `FAILED`.
- Only one unresolved cloudECR SALE may exist for the configured POS ID, Device ID and Terminal SN across all RKJ tablets. A server-side price snapshot plus deterministic product-row locks prevents a concurrent catalogue change from producing a receipt with a different amount. Stock is revalidated during fulfilment; any mismatch stays `REPORTED` for Finance/manual resolution.
- After the visible QR expires, RKJ One keeps the intent locked during the database-enforced 20-minute reconciliation grace period; only after that period can the attempt become safely retryable.
- Production OPA QR creation requires an explicit branch entry with provider-issued Application Code, Secret Key, Store ID and Terminal ID. Global credentials or an invented identifier cannot activate a Production branch.
- Callback verification remains available after creation mode is rolled back to `manual`, allowing an already-issued QR to complete safely.

Merchant portal credentials shown on the portal home page must not be assumed to be OPA Application Code/Secret Key. Obtain the OPA credentials and notification setup from Fiuu for the intended store/branch arrangement.

## Immediate BR001 OPA actions

1. Retrieve the BR001 sandbox OPA Application Code and Secret Key from the authenticated Fiuu portal or an approved secure channel. Do not substitute the portal Merchant ID, Verify Key or cloudECR Secret Key.
2. Record the provider-approved BR001 Store ID and Terminal ID. Production will remain fail-closed unless both are explicit in the branch mapping.
3. Enter a `BR001`-only mapping directly into the Vercel Preview environment; never paste the real values into Git or chat.
4. Configure the Preview notification URL:
   `https://<vercel-preview-host>/api/pos/qr-payments/webhook`
5. Complete a signed sandbox transaction using channel `24` and a validity of 60–180 seconds. Verify the callback, exact-once receipt, stock movement, shift update, late/duplicate handling and settlement.
6. Keep every other branch on static QR/manual until BR001 passes, and request fresh confirmation immediately before any Production action.

## cloudECR/VT+ fallback actions

Do not spend the pilot window on cloudECR until the official VT+ app opens beyond its splash screen. When it does, use the prepared BR001-only adapter and run the separate terminal/POS binding, 80-second SALE, signed response, `getLast` recovery and settlement gates in the runbook.

Do not submit another DuitNow QR Offline channel request while the existing channel remains activated.

The merchant and sandbox credentials were exposed during earlier support correspondence. The Roti Kaya Junus sandbox password was reset on 2026-08-08. Production portal credentials must also be rotated before activation, and replacement credentials must never be placed in chat, screenshots or repository files.

On 2026-08-08, a detailed technical request was sent to Fiuu under Ticket `2924959` asking for the official OPA endpoints, identifier mapping, request/notification signature rules, callback acknowledgement and retries, branch/store arrangement, Extended VCode requirement and refund/reversal procedure. Keep Production in manual mode until Fiuu answers and signed sandbox UAT passes.

On 2026-08-08, the branch-scoped Vercel Preview completed official-device enrolment, STAFF login, open-shift membership and opening-stock SOP for synthetic branch `BR001`. A controlled RM2.50 sandbox pre-create request reached Fiuu but returned HTTP `404`. The Fiuu specification defines `404` as Application Code or transaction not found. RKJ One returned a safe gateway failure, created no sale, deducted no stock and left Production unchanged. This is evidence that a provider-issued OPA Application Code or OPA enablement is still required; the Merchant ID must not be substituted or guessed.

On 2026-08-17, both monitored merchant email accounts were checked and no provider response had been received after the 2026-08-08 technical request. A further escalation was sent under Ticket `2924959`, requesting confirmation of OPA enablement, the provider-issued Application Code, Store/Terminal ID arrangement, callback registration and channel/signature settings. Preview remains configured for sandbox validation only; Production remains in manual mode.

On 2026-08-21, the authenticated Production merchant portal was re-verified as `ROTI KAYA JUNUS`, portal user `ROTIKAYAJUNUS`, Merchant ID `rotikayajunus`. Verify Key and Secret Key values were not read or copied. A second controlled RM2.50 staging pre-create attempt again returned HTTP `404`; RKJ One created no sale, receipt or stock movement. Database checks confirmed authenticated users retain read-only access to online-payment rows, service-role-only fulfilment remains enforced, and the organization-scoped idempotency constraint is present. An escalation was then sent from the registered POS merchant email `isaeee94@gmail.com` to Fiuu Support and Merchant Operations for Application `121582`, requesting OPA enablement, the provider-issued sandbox Application Code, Store/Terminal mapping, signed callback contract and settlement/refund procedure. Production remains in `manual` mode pending a successful signed callback and Finance reconciliation.

Later on 2026-08-21, Fiuu replied under Ticket `2971942`. Fiuu confirmed that `rotikayajunus` has offline e-Wallet enabled and may integrate OPA, but that OPA requires a separately created Application Code and Secret Key. Fiuu requested confirmation that the sandbox account already exists before creating the Application Code for retrieval from the sandbox merchant portal. Fiuu also confirmed that Application `121582` has no submitted store information and that multiple branches require new add-on store applications. Endpoint registration is performed in Merchant Portal **Transaction Settings → Endpoints**. Fiuu describes Notification URL as the real-time server callback and Callback URL as the deferred/asynchronous callback used for QR payments; when the required acknowledgement is absent, Fiuu retries a callback up to three times at 15-minute intervals. Duplicate notifications must be handled idempotently. The exact OPA v2.1.18 Pre-Create Transaction QR HMAC canonicalisation, ACK content, refund/reversal procedure and settlement fee/reference mapping still require a focused written answer.

RKJ replied under the same ticket confirming that the dedicated Roti Kaya Junus sandbox merchant account already exists and requesting creation of the provider-issued sandbox Application Code for Application `121582`. The reply limited the first UAT to one `BR001` pilot store/device, requested the add-on store procedure, clarified that the HMAC question concerns OPA v2.1.18 Pre-Create Transaction QR channel `24`, and requested the exact ACK, refund and settlement reconciliation contract. No secret or callback protection token was transmitted by email.

## Server environment

Use Vercel server-only environment variables. `POS_FIUU_APPLICATIONS_JSON` is preferred for branch isolation:

```dotenv
POS_QR_PAYMENT_MODE=fiuu
POS_FIUU_OPA_BRANCHES=BR001
POS_FIUU_ENVIRONMENT=sandbox
```

The payment-mode selector is not sufficient by itself. OPA creation is also protected by `POS_FIUU_OPA_BRANCHES`, and the present pilot implementation fails closed unless the normalized allowlist contains exactly the hard-locked pilot branch `BR001`. Wildcards, malformed entries and `BR002`–`BR036` are rejected.

```json
{
  "BRANCH_CODE": {
    "applicationCode": "provider-issued-code",
    "secretKey": "provider-issued-secret",
    "storeId": "provider-approved-store-id",
    "terminalId": "provider-approved-terminal-id"
  }
}
```

Do not commit the real JSON. Keep `POS_QR_PAYMENT_MODE=manual` until UAT passes. Staging must use `POS_FIUU_ENVIRONMENT=sandbox`; Production must use `production` only after written approval and pilot sign-off. A `POS_FIUU_PRECREATE_URL` override must use the approved host for the selected environment; localhost is accepted only during non-production development.

A valid signed `STATUS=00` notification is handled in two committed phases: first persist sanitized provider evidence and mark the payment `REPORTED`, then perform receipt, stock, shift and sale fulfilment idempotently. The callback and both database RPCs independently enforce the BR001 pilot identity. If the second phase fails, the durable `REPORTED` row remains and either a duplicate valid Fiuu notification or authenticated payment-status polling can retry fulfilment without issuing another charge. Fulfilment locks the referenced products and refuses a receipt if the active catalogue no longer matches the server-side pricing snapshot.

## UAT acceptance

- QR amount exactly matches the server-calculated QR portion.
- QR expires and can be regenerated without creating a sale.
- Invalid signature, amount, currency, channel, application or provider transaction ID is rejected.
- A valid callback creates exactly one sale, one receipt and the expected stock movements.
- A duplicated valid callback returns the existing receipt and creates no duplicate transaction.
- Retrying one QR creation attempt with the same idempotency key returns the same payment; changing its branch, shift, creator, amount or sale payload is rejected.
- Cross-branch users cannot view the payment or QR image.
- No sale is completed when Fiuu generation or callback fulfilment fails.
- Cash, mixed payment, discount, change, shift totals and Malaysia business date reconcile.
- Reloading or reopening the payment dialog restores the same unresolved payment and does not create a second payable QR.
- A signed callback received during the bounded expiry grace creates at most one sale; after the grace ends, a new attempt can be created without accepting the old intent.

## Rollout and rollback

The detailed decision table and evidence checklist are in [FIUU_BR001_UAT_RUNBOOK.md](./FIUU_BR001_UAT_RUNBOOK.md).

1. Apply the migration to staging and run the full UAT list.
2. Enable Fiuu only in the Preview environment.
3. Pilot one branch/device with low-value controlled payments and Finance present.
4. Reconcile Fiuu settlement, RKJ One payment, POS receipt, shift summary and inventory movement.
5. For rollback, set `POS_QR_PAYMENT_MODE=manual`. Do not delete payment rows, gateway references or receipts.
6. Production activation requires owner confirmation at the moment the Fiuu subscription, production credentials and Production environment change are submitted.

Staging migration status on 2026-08-08: all `169` repository migrations are applied and the linked schema lint reports no error. Vercel Preview contains a branch-scoped sensitive `POS_FIUU_APPLICATIONS_JSON` mapping for pilot branch `BR001` only. No Fiuu credential was added to Production.

Validation on 2026-08-26: all `171` repository migrations, including the new callback/concurrency hardening, are applied to the isolated local Supabase database and the separate `rkj-one-staging-my` Supabase project. The local index and security-definer function state were verified, and local schema lint completed with unrelated pre-existing warnings only. Staging migration history is synchronized at `171/171`; a subsequent linked schema-lint attempt was blocked by the CLI database credential and did not change the staging database. Repository tests (`31/31`), TypeScript, ESLint and the Next.js Production build pass locally. The migration has not been applied to Production. Provider-issued OPA credentials, the approved branch Store/Terminal mapping, signed sandbox callback UAT and Finance settlement reconciliation remain mandatory before enabling Production.

Validation on 2026-10-26: the BR001 OPA allowlist and durable two-phase notification implementation pass all repository tests (`116/116`), TypeScript, error-only ESLint and the Next.js Production build (`162` pages). Migrations `20261024120000_add_fiuu_cloudecr_br001_pilot.sql` and `20261026120000_durable_fiuu_opa_notification.sql` are applied to the isolated `rkj-one-staging-my` Supabase project, and linked migration history is synchronized through `20261026120000`. Linked schema lint completes with unrelated pre-existing warnings only and reports no issue in the new Fiuu functions. A fresh local replay could not be run because the Docker engine was unavailable. Neither migration has been applied to Production, and no Production environment, credential, provider or outlet setting was changed.

## Play Store

The Android application is a Capacitor shell that loads `https://rkj.one`. This server-side integration does not by itself require a new Play Store bundle. A new AAB is required only if native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes.
