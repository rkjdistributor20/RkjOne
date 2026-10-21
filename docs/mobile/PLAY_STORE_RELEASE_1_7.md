# RKJ One Staff 1.7.0 - Fiuu VT BR001 Pilot

Release candidate date: 2026-10-15

- Version name: `1.7.0`
- Version code: `17`
- Package: `com.rkjone.staff`
- Initial track: Internal Testing only

## Included

- Native explicit handoff to the official Fiuu VT package for a server-allowlisted branch.
- Package visibility and package-specific callback scheme for Android debug/Production isolation.
- Managed Google Play installer check before Fiuu VT can be launched.
- SALE → STATUS matching for order ID, Transaction ID, amount, MYR and DuitNow channel.
- Durable recovery of an unresolved payment after WebView or app restart.
- Service-role-only, row-locked and idempotent POS fulfillment.
- Static QR/manual fallback for an old build, missing/untrusted VT app, and every non-pilot branch.

## Safety boundary

The Fiuu VT v1.2 deep-link result is not cryptographically signed. `STATUS=00` therefore records a durable reported success before RKJ One automatically invokes the service-role-only fulfillment endpoint. This removes the cashier confirmation click while retaining official-device, user, shift, exact transaction, freshness, row-lock and idempotency controls. Describe it as automatic operational confirmation, not cryptographic provider verification.

## Internal Testing acceptance

1. Install RKJ One and Fiuu VT from Managed Google Play on the official BR001 tablet.
2. Confirm Device Owner, lock task, screen lock and branch enrollment are green.
3. Activate the Fiuu VT BR001 sub-account without sharing credentials with branch staff.
4. Test success, cancel, expired QR, pending, app kill/reopen, duplicate callback and mixed payment.
5. Confirm exactly one POS transaction, receipt and stock deduction for each confirmed payment.
6. Reconcile Fiuu transaction/settlement against RKJ One and the company bank account.
7. Verify BR002 still uses its static QR/manual Finance review path.

Production promotion and expansion beyond BR001 remain blocked until the pilot and settlement reconciliation pass. Cryptographic provider verification still requires signed OPA, cloudECR or another authenticated Fiuu server status/callback contract.
