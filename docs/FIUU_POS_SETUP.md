# RKJ One Fiuu DuitNow QR POS Setup

Last updated: 2026-08-05

## Verified design

- Merchant: Roti Kaya Junus (`rotikayajunus` in the merchant portal).
- Product: Fiuu Offline Payment API, Pre-Create Transaction QR.
- Channel: DuitNow QR Offline, channel ID `24`, currency `MYR`.
- RKJ One uses dynamic transaction QR, not a static merchant QR.
- The application remains in `manual` mode until the provider channel and sandbox callback are approved and tested.

Merchant portal credentials shown on the portal home page must not be assumed to be OPA Application Code/Secret Key. Obtain the OPA credentials and notification setup from Fiuu for the intended store/branch arrangement.

## Required provider setup

1. Subscribe to DuitNow QR Offline in the Fiuu merchant portal after the owner accepts the displayed commercial terms.
2. Confirm whether Fiuu issues one OPA application per branch/store or one application for the company.
3. Obtain sandbox Application Code and Secret Key without placing them in Git, chat, screenshots or mobile code.
4. Configure the staging notification URL:
   `https://<vercel-preview-host>/api/pos/qr-payments/webhook`
5. Complete a signed sandbox transaction and verify the provider callback payload against the current Fiuu OPA specification.
6. Pilot one branch and one official POS device before enabling more branches.

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

Do not commit the real JSON. Keep `POS_QR_PAYMENT_MODE=manual` until UAT passes. Staging must use `POS_FIUU_ENVIRONMENT=sandbox`; Production must use `production` only after written approval and pilot sign-off.

## UAT acceptance

- QR amount exactly matches the server-calculated QR portion.
- QR expires and can be regenerated without creating a sale.
- Invalid signature, amount, currency, channel, application or provider transaction ID is rejected.
- A valid callback creates exactly one sale, one receipt and the expected stock movements.
- A duplicated valid callback returns the existing receipt and creates no duplicate transaction.
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

## Play Store

The Android application is a Capacitor shell that loads `https://rkj.one`. This server-side integration does not by itself require a new Play Store bundle. A new AAB is required only if native code, permissions, package metadata, signing, target SDK or Capacitor configuration changes.
