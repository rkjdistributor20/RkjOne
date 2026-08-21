# RKJ One Fiuu DuitNow QR POS Setup

Last updated: 2026-08-21

## Verified design

- Merchant: Roti Kaya Junus (`rotikayajunus` in the merchant portal).
- Product: Fiuu Offline Payment API, Pre-Create Transaction QR.
- Channel: DuitNow QR Offline, channel ID `24`, currency `MYR`.
- Merchant portal status verified on 2026-08-05: `DuitNow QR Offline` is already `Activated` at `0.80%` for this merchant account.
- Other merchant channels shown in the portal are also activated, and extended payment verification is enabled.
- The generic merchant Return URL, Notification URL and Callback URL are currently empty.
- Application ID `121582` is the Roti Kaya Junus POS merchant application. Its registered merchant email is `isaeee94@gmail.com`.
- Application ID `121583` is the RKJ Distributor Agent Payment merchant application. Its registered merchant email is `rkjdistributor20@gmail.com`.
- Applications `121582` and `121583` are separate merchant accounts and their credentials, callbacks, transactions and settlement evidence must never be mixed.
- The dedicated sandbox account for Roti Kaya Junus is accessible. Its Merchant ID, Verify Key and Secret Key are available in the sandbox portal. Values remain secret and are not recorded in the repository.
- Fiuu Ticket `2971942` confirms that merchant `rotikayajunus` has the offline e-Wallet channel required for OPA. Fiuu will create a separate sandbox Application Code after RKJ confirms that its sandbox account already exists; the Merchant ID must not be assumed to be that Application Code.
- Application `121582` currently has no store information submitted. Fiuu states that serving multiple Roti Kaya Junus branches requires new add-on store applications. The exact approved Store/Terminal mapping, pre-create/callback signature contract, refund procedure and settlement mapping remain **To be confirmed**.
- The public Fiuu Offline Payment API v2.1.18 specification confirms the configured sandbox and Production pre-create URLs, `applicationCode` as a provider-issued OPA identifier, `storeId` and `terminalId` as merchant identifiers, `channelId=24` for DuitNow QR, form-encoded POST requests and HMAC-SHA256 support. It does not establish that the sandbox Merchant ID is an OPA `applicationCode` for this account.
- RKJ One uses dynamic transaction QR, not a static merchant QR.
- The application remains in `manual` mode until the provider channel and sandbox callback are approved and tested.

Merchant portal credentials shown on the portal home page must not be assumed to be OPA Application Code/Secret Key. Obtain the OPA credentials and notification setup from Fiuu for the intended store/branch arrangement.

## Required provider setup

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

## Rollout and rollback

1. Apply the migration to staging and run the full UAT list.
2. Enable Fiuu only in the Preview environment.
3. Pilot one branch/device with low-value controlled payments and Finance present.
4. Reconcile Fiuu settlement, RKJ One payment, POS receipt, shift summary and inventory movement.
5. For rollback, set `POS_QR_PAYMENT_MODE=manual`. Do not delete payment rows, gateway references or receipts.
6. Production activation requires owner confirmation at the moment the Fiuu subscription, production credentials and Production environment change are submitted.

Staging migration status on 2026-08-08: all `169` repository migrations are applied and the linked schema lint reports no error. Vercel Preview contains a branch-scoped sensitive `POS_FIUU_APPLICATIONS_JSON` mapping for pilot branch `BR001` only. No Fiuu credential was added to Production.

## Play Store

The Android application is a Capacitor shell that loads `https://rkj.one`. This server-side integration does not by itself require a new Play Store bundle. A new AAB is required only if native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes.
