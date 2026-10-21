# RKJ One Fiuu DuitNow QR POS Setup

Last updated: 2026-10-22

## Current BR001 decision (2026-10-22)

The controlled RM2.50 BR001 static DuitNow QR sale passed. Transaction `TX-20261021-00001` completed once under shift `SH-20261021-0001`, the expected stock was deducted, the shift total reconciled to RM2.50 and Finance manually marked the related payment record paid. This confirms the existing RKJ One static-QR/manual sale pipeline only; it is not proof of Fiuu VT automatic or App-to-App confirmation.

Fiuu VT Production remains blocked by four concrete gates:

1. The official **Fiuu Virtual Terminal** package `com.rms.mobile.razervt` is not installed or activated on BR001. Fiuu's official download page links to the exact Google Play listing, but Google Play currently reports that the app is not available for the selected device/account.
2. Production `rkj.one` is still deployed from `master` commit `b5118e9`; the reviewed rollout branch commit `ea5cd2a` exists only as a Ready preview.
3. Production Supabase project `mtygxueknokcihofdttl` has no row for migration `20261015120000_add_fiuu_vt_br001_pilot.sql`; the migration has not been applied.
4. Vercel Production has no `POS_QR_PAYMENT_MODE`, `POS_FIUU_VT_BRANCHES`, `POS_FIUU_VT_VALIDITY_SECONDS` or `POS_FIUU_ENVIRONMENT` values for the VT pilot. The corresponding values are scoped to the reviewed Preview branch only.

Do not claim automatic confirmation or enable all outlets. Keep Production static/manual until the official VT app is installed and activated, the BR001-only Production change is explicitly approved, and the dynamic SALE → STATUS → cashier-confirmation payment plus Finance settlement reconciliation passes.

## Current provider status (2026-10-20)

- Fiuu confirmed on 2026-10-06 that the 36 add-on stores were ready. Their branch-specific static DuitNow QR registrations have been received, validated and bundled into RKJ One.
- Fiuu confirmed on 2026-10-08 that VT App-to-App was activated. The active implementation track is therefore the BR001-only `fiuu_vt` pilot, not the earlier OPA request draft.
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

## Fiuu VT App-to-App BR001 pilot (2026-10-15)

Fiuu supplied the official VT App-to-App v1.2 specification and confirmed on 2026-10-08 that the function was activated. RKJ One now has a separate `fiuu_vt` transport for a strictly allowlisted managed Android tablet. It requires Fiuu VT to be installed through Managed Google Play, launches package `com.rms.mobile.razervt` explicitly, requests merchant-presented DuitNow QR through channel `RPP_DuitNowQR-Offline`, and performs a second `STATUS` operation after the SALE result.

The VT deep-link response does **not** contain HMAC, a digital signature, nonce or server-verifiable proof. For that reason:

- SALE never creates a sale, receipt or stock movement;
- STATUS must match the random order ID, Transaction ID, amount, `MYR` and exact DuitNow channel;
- `22`, `33` and `45` remain pending; `11` and `44` close the attempt;
- `55` remains locked as pending until the bounded reconciliation grace ends, so a second payable attempt cannot overlap a late success;
- STATUS is rejected unless the matching SALE result and immutable Transaction ID were recorded first;
- STATUS `00` is recorded durably as `REPORTED`, not `PAID`, and cannot be expired into a second payable attempt;
- a cashier must verify the successful Fiuu VT screen and explicitly confirm once;
- only then may the service-role-only, row-locked RPC create one sale, one receipt and one stock deduction;
- shift closure locks the shift before calculating totals and remains blocked while a `REPORTED` payment awaits confirmation;
- all POS mixed payments require an exact cash-plus-QR split with no cash change, preventing drawer totals from being overstated across dynamic and static/manual fallback;
- BR002-BR036 continue using their static QR/manual workflow.

This is a safe usable pilot, not fully automatic cryptographic confirmation. Fully automatic rollout requires Fiuu to provide an authenticated server status API or signed callback. Configure the pilot only with:

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
- Fiuu's 2026-08-21 reply said Application `121582` had no store information at that time. Fiuu subsequently confirmed on 2026-10-06 that the 36 add-on stores were ready, and the 36 static QR payloads were received. Provider-side VT sub-account identifiers, an authenticated server status/callback contract, refund procedure and settlement mapping remain **To be confirmed**.
- The public Fiuu Offline Payment API v2.1.18 specification confirms the configured sandbox and Production pre-create URLs, `applicationCode` as a provider-issued OPA identifier, `storeId` and `terminalId` as merchant identifiers, `channelId=24` for DuitNow QR, form-encoded POST requests and HMAC-SHA256 support. It does not establish that the sandbox Merchant ID is an OPA `applicationCode` for this account.
- RKJ One currently supports verified branch static QR/manual confirmation for all 36 branches and a separately gated VT App-to-App dynamic pilot for BR001. Signed OPA remains an optional alternative, not the active rollout path.
- BR002-BR036 remain in static/manual mode. BR001 may use `fiuu_vt` in Preview only until device UAT and settlement reconciliation pass.
- The POS client now preserves an unresolved dynamic-QR intent across a page reload for the same branch and shift. It does not offer a second QR while the original intent can still receive a signed late callback.
- A database uniqueness guard also permits only one pending Fiuu intent per organization, branch, shift and cashier, covering concurrent tabs or requests beyond the client-side recovery guard.
- Status polling does not mutate the payment row. After the visible QR expires, RKJ One keeps reconciling during the database-enforced 20-minute callback grace period; only after that period can the attempt become safely retryable.
- Production QR creation requires an explicit branch entry with provider-issued Application Code, Secret Key and Store ID. Global credentials or an invented Store ID cannot activate a Production branch.
- Callback verification remains available after creation mode is rolled back to `manual`, allowing an already-issued QR to complete safely.

Merchant portal credentials shown on the portal home page must not be assumed to be OPA Application Code/Secret Key. Obtain the OPA credentials and notification setup from Fiuu for the intended store/branch arrangement.

## Immediate BR001 VT actions

1. Resolve eligibility for and install the exact official Fiuu VT package `com.rms.mobile.razervt` on the registered BR001 tablet; activate merchant `masterkayajunus01` through the provider-approved process. Do not use an unrelated app or unverified APK.
2. After explicit Production approval, apply only migration `20261015120000_add_fiuu_vt_br001_pilot.sql`, configure only the BR001 VT environment values and promote the reviewed rollout branch. Keep BR002-BR036 on static/manual QR.
3. Complete SALE then STATUS testing on the physical device. Treat `STATUS=00` as `REPORTED` and require the one explicit cashier confirmation; do not label it fully automatic.
4. Reconcile the Fiuu transaction, RKJ One receipt, stock movement, shift total, Fiuu settlement report and company bank credit with Finance present.
5. Test timeout, cancel, duplicate callback/deep-link, app switch, network loss and late-status recovery before allowing a second payable attempt.
6. Keep every other active branch on its static QR/manual workflow until BR001 passes; owner approval exists, but advance only the next technically ready batch.
7. If Fiuu supplies authenticated server proof, implement and UAT it in staging before removing the cashier confirmation step.

## Required provider setup for signed OPA alternative

1. Confirm the Fiuu Booster/OPA application status in an authenticated Booster session or directly with Fiuu.
2. Confirm whether Fiuu issues one OPA application per branch/store or one application for the company.
3. Obtain sandbox Application Code and Secret Key without placing them in Git, chat, screenshots or mobile code.
4. Configure the staging notification URL after Fiuu issues the OPA credentials:
   `https://<vercel-preview-host>/api/pos/qr-payments/webhook`
5. Complete a signed sandbox transaction and verify the provider callback payload against the current Fiuu OPA specification.
6. Pilot one branch and one official POS device before enabling more branches.

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

```json
{
  "BRANCH_CODE": {
    "applicationCode": "provider-issued-code",
    "secretKey": "provider-issued-secret",
    "storeId": "provider-approved-store-id"
  }
}
```

Do not commit the real JSON. Keep `POS_QR_PAYMENT_MODE=manual` until UAT passes. Staging must use `POS_FIUU_ENVIRONMENT=sandbox`; Production must use `production` only after written approval and pilot sign-off. A `POS_FIUU_PRECREATE_URL` override must use the approved host for the selected environment; localhost is accepted only during non-production development.

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

1. Apply the migration to staging and run the full UAT list.
2. Enable Fiuu only in the Preview environment.
3. Pilot one branch/device with low-value controlled payments and Finance present.
4. Reconcile Fiuu settlement, RKJ One payment, POS receipt, shift summary and inventory movement.
5. For rollback, set `POS_QR_PAYMENT_MODE=manual`. Do not delete payment rows, gateway references or receipts.
6. Production activation requires owner confirmation at the moment the Fiuu subscription, production credentials and Production environment change are submitted.

Staging migration status on 2026-08-08: all `169` repository migrations are applied and the linked schema lint reports no error. Vercel Preview contains a branch-scoped sensitive `POS_FIUU_APPLICATIONS_JSON` mapping for pilot branch `BR001` only. No Fiuu credential was added to Production.

Validation on 2026-08-26: all `171` repository migrations, including the new callback/concurrency hardening, are applied to the isolated local Supabase database and the separate `rkj-one-staging-my` Supabase project. The local index and security-definer function state were verified, and local schema lint completed with unrelated pre-existing warnings only. Staging migration history is synchronized at `171/171`; a subsequent linked schema-lint attempt was blocked by the CLI database credential and did not change the staging database. Repository tests (`31/31`), TypeScript, ESLint and the Next.js Production build pass locally. The migration has not been applied to Production. Provider-issued OPA credentials, the approved branch Store/Terminal mapping, signed sandbox callback UAT and Finance settlement reconciliation remain mandatory before enabling Production.

## Play Store

The Android application is a Capacitor shell that loads `https://rkj.one`. This server-side integration does not by itself require a new Play Store bundle. A new AAB is required only if native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes.
