# Changelog

## 2026-10-24 - Fiuu device inventory and BR001 cloudECR/VT+ preparation

- Recorded Phone Link metadata for the connected BR001 tablet: Samsung `SM-X406B` running Android 16.
- Recorded the Google Play device inventory under `rkjdistributor20@gmail.com`: Samsung `SM-X406B` and HONOR `ELN2-L29`, identified as HONOR Pad X9a rather than `NDL2-L09`/X8b.
- Confirmed that the standard Fiuu VT listing is unavailable for both registered devices, while Fiuu VT+ is available to all devices on the account.
- Documented professionally that the earlier Android 10/X8b support diagnosis does not match the verified current inventory and should be revisited using the exact model/OS evidence.
- Added a fail-closed `fiuu_cloudecr` transport for a BR001-only allowlist, server-side token handling, HMAC request/response verification, unique 20-character references, signed SALE and safe `getLast` recovery.
- Added an additive migration and atomic fulfillment RPC that accepts only an exact successful response for the expected POS, device, reference, amount, currency and DuitNow channel before issuing one receipt and stock movement.
- Hardened recovery so every `getLast` has a new reference, must return the original SALE reference in signed metadata, and must match the configured Terminal SN. A 180-second database lease exceeds the server request window and prevents overlapping provider calls across tabs.
- Locked unresolved cloudECR transactions globally by POS ID, Device ID and Terminal SN; preserved the exact HMAC-verified payload; restricted the API origin to `https://cloudecr.fiuu.com`; and stored a server pricing snapshot before SALE.
- Persisted each validated `00/00` success as durable `REPORTED` evidence before idempotent receipt/stock fulfillment; ambiguous `getLast` responses remain pending rather than reopening a payable attempt.
- Added POS UI/readiness wiring and automated tests. Provisioned POS/VT+ accounts, secure credentials, binding, per-submerchant mapping, physical UAT and Finance settlement remain mandatory gates.
- No migration, environment value, deployment, merchant configuration or BR002-BR036 rollout was applied to Production.

## 2026-10-22 - Fiuu VT automatic operational confirmation

- Changed the BR001 VT flow so a fresh matching Fiuu `STATUS=00` automatically invokes the existing service-role-only fulfillment RPC; no cashier confirmation click is required.
- Retained the durable `REPORTED` intermediate state, same-user/device/branch/shift checks, exact order/Transaction ID/amount/MYR/channel matching, five-minute STATUS freshness, row locks and idempotent receipt/stock fulfillment.
- Retained a manual retry control only as recovery after network or app interruption; it cannot create a second sale.
- Clarified that this is automatic operational confirmation from the official Fiuu VT app, not cryptographic provider proof. Signed OPA or cloudECR remains the preferred server-verifiable path for broad rollout.
- Rechecked Play eligibility on the physical BR001 device. Fiuu's public listing advertises tablet/non-EMV support generally, but the native Play Store on Samsung SM-X406B reports `Your device isn't compatible with this version`; BR001 therefore still needs a Fiuu-approved managed build or confirmed compatible device before VT UAT.
- Local validation passed: 63 tests, targeted ESLint and the Next.js Production build. Production database, environment and deployment remain unchanged pending the BR001 action gate.

## 2026-10-20 - Fiuu operational evidence review

- Reconciled both registered merchant inboxes and the Pn Aida WhatsApp thread against the implemented BR001 VT pilot.
- Recorded that all 36 add-on stores/static QR registrations are ready and that Fiuu activated VT App-to-App, while authenticated server confirmation remains pending with Fiuu technical.
- Marked the older unsent OPA email draft as obsolete for the current VT track.
- Recorded the separate temporary card-channel suspensions for `rotikayajunus` and `rkjdistributors` and kept DuitNow QR/VT scope distinct.
- Verified that the Fiuu Agent Payment adapter uses Hosted Payment Page, so the 2026-12-31 FPX issuer-list/KFH maintenance notice does not require an RKJ checkout change unless a direct/seamless FPX flow is introduced.
- Confirmed the BR001 Fiuu settings remain Preview-only; no Production payment mode, credential or rollout was changed.
- Recorded owner authorization for an eventual all-outlet rollout while retaining the technical safety gates.
- Added a read-only Production readiness audit: 35 active branch records with `BR012` missing/inactive, 6 active and 29 pending official tablets, only 1 tablet seen in seven days, 4 native-app installations and no Device Owner/kiosk-compliant tablets.
- Kept bulk activation blocked; rollout must proceed from BR001 UAT to the remaining enrolled tablets and then individually enrolled pending devices, with static QR/manual fallback throughout.

## 2026-10-15 - BR001 Fiuu VT App-to-App pilot

- Added Android 1.7.0 native handoff to the Managed Google Play Fiuu VT app with package-specific callback routing.
- Added a BR001-only server allowlist while preserving static QR/manual processing for BR002-BR036 and older Android/PWA clients.
- Added durable payment intent recovery, SALE-to-STATUS validation, unique order/Transaction IDs, one-active-device guards and an atomic service-role fulfillment RPC.
- Kept unsigned VT `STATUS=00` as `REPORTED` until a cashier explicitly confirms the successful Fiuu screen; fully automatic rollout remains blocked pending signed server proof from Fiuu.
- Added the Fiuu VT linked-app Android Enterprise policy, provisioning/UAT documentation and 1.7.0 Internal Testing release checklist.
- Local validation passed: 51 tests, TypeScript, ESLint, Next.js Production build, system hardening audit and Android debug APK build. No Production database, environment, Play track or branch was changed.

## 2026-10-06 - 36 Fiuu static DuitNow QR in RKJ One POS

- Added the verified branch-specific Fiuu DuitNow QR assets for `BR001` through `BR036` to the RKJ One deployment.
- Added an authenticated, branch-scoped POS QR configuration endpoint so a cashier only receives the QR assigned to the selected branch.
- Replaced the generic manual QR placeholder with the correct branch QR, branch identity, recipient check and explicit staff confirmation before a manual QR sale can be completed.
- Preserved the hardened dynamic Fiuu OPA flow: when dynamic mode is enabled, RKJ One continues to generate amount-specific QR and waits for the signed provider callback; otherwise the registered static branch QR is used safely.
- Regenerated all 36 QR images from the Fiuu EMV payloads and verified all 36 decoded payloads exactly against the source manifest.

## 2026-08-26 - Consolidated release and tenant boundary hardening

- Consolidated the current Fiuu reconciliation line with Android 1.6.9 Bluetooth receipt and cash-drawer behavior on a fresh branch based on the latest remote master.
- Made application profile loading fail closed for inactive accounts and validated every personnel branch assignment against the caller organization.
- Added migration-backed active-profile RLS helpers, organization-bound branch access and direct Data API immutability for completed POS transactions, items, payments and receipts.
- Changed the owner readiness dashboard to fail closed for role UAT, audit trail, backup/restore, POS pilot and monitoring; row counts or configured environment variables no longer masquerade as operational evidence.
- Built the signed Android 1.6.9 release bundle locally and corrected the stale Capacitor instrumentation package; Play-delivered device acceptance remains required before promotion.
- Replayed all 172 migrations locally and verified active same-tenant access, cross-tenant denial, inactive-user denial and absence of authenticated POS update privilege.
- Applied the new boundary migration to the independently verified Singapore staging project and confirmed a clean post-deployment dry-run; Production was not linked or changed.

## 2026-08-26 - Fiuu POS dynamic-QR safety hardening

- Preserved unresolved branch-and-shift QR attempts across reloads and blocked duplicate QR creation throughout late-callback reconciliation, including a server/database guard against concurrent tabs.
- Added visible polling, image, expiry, cancellation and receipt-recovery states to the POS payment dialog.
- Kept delayed callback verification operational after a rollback to manual creation mode, while requiring explicit Store-mapped branch credentials for Production creation.
- Limited callback request bodies, validated callback payment identifiers before lookup and removed shared-IP throttling that could reject legitimate Fiuu callbacks before signature verification.
- Added a migration to serialize Malaysia-business-day POS numbering, verify the stored Fiuu gateway reference and enforce a bounded late-callback/shift-close grace period.
- Local validation passed: all 171 migrations, 31 tests, TypeScript, ESLint and the Next.js Production build. The new migration is synchronized to the isolated staging project but remains unapplied to Production; signed provider UAT is still pending.

## 2026-08-21 - Fiuu Agent Preview callback hardening

- Added environment-specific, allowlisted Fiuu Agent callback and Return URLs
  so protected Preview deployments can receive provider callbacks without
  weakening Production deployment protection.
- Added the verified agent contact phone to the Hosted Payment Page request.

- Added a staging-first Fiuu Hosted Payment Page adapter for RKJ Distributor Agent Payment, with a dedicated signed callback/return boundary, merchant/amount/MYR verification, single-PENDING idempotency, host allowlisting and separate server-only credentials from the Roti Kaya Junus POS merchant. Production remains disabled pending signed provider UAT and Finance reconciliation.

## 2026-08-20

- Prepared Android 1.6.7 (`versionCode 14`) with per-tablet ESC/POS cash-drawer setup for the Bluetooth receipt printer.
- Added two drawer-kick signal options, a physical test action, and an explicit auto-open setting that only runs after a confirmed transaction containing cash.
- Added duplicate protection so reopening or re-rendering the same receipt cannot reopen the cash drawer; QR-only sales and training sales never trigger it.
- Kept drawer failures isolated from payment, sale, receipt, stock and receipt printing. A compatible DK/RJ11 printer port and physical drawer cable remain required.

## 2026-08-20

- Prepared Android 1.6.3 (`versionCode 10`) with per-tablet verified printer setup and optional auto-print after a confirmed POS payment.
- Added a final bonded-device RFCOMM channel 1 compatibility attempt for generic POS-5890U-L-class printers after standard secure and insecure SPP attempts fail.
- Added native duplicate protection so the same confirmed receipt is not auto-printed twice, while intentional manual reprint remains available.
- Kept printer failures isolated from payment, sale, receipt and stock records; physical Internal Testing on the photographed printer remains required before Production promotion.

## 2026-08-17

- Prepared Android 1.6.2 (`versionCode 9`) so an unconfigured native printer no longer falls through silently to the Android system print path; the receipt action now opens the printer setup with a clear instruction.
- Added an eight-second Bluetooth RFCOMM connection timeout per attempt and a bonded-device insecure RFCOMM fallback for compatible generic `POS-5890U-L` units, while retaining explicit selection and safe failure handling.
- Prepared Android 1.6.1 (`versionCode 8`) after Play Console reported `CalledFromWrongThreadException` in the 1.5 kiosk enforcement path; native kiosk window and lock-task operations are now marshalled onto the Android UI thread.
- Added Android 1.6 direct Bluetooth receipt printing for the photographed `POS-5890U-L` 58 mm branch printer, including one-time pairing, saved per-tablet selection, test printing, accessible status/errors and system-print fallback.
- Standardized POS receipt output to a 32-column, 58 mm ESC/POS layout and documented the physical branch acceptance gate; direct iOS Bluetooth remains To be confirmed pending verified vendor compatibility.
- Revalidated the Fiuu POS Preview configuration, payment-security tests, TypeScript and lint checks without changing Production.
- Confirmed that no Fiuu reply had been received after the controlled sandbox pre-create returned HTTP `404`; escalated Ticket `2924959` for OPA enablement and the provider-issued Application Code.
- Kept Production POS QR in manual mode because signed callback UAT and settlement reconciliation remain blocked by the provider-side OPA configuration.

## 2026-08-08

- Applied the complete 169-migration repository history to the isolated Supabase staging project and verified a clean linked dry-run and schema lint.
- Created PR #12 for the POS/Fiuu payment lifecycle hardening work.
- Added a branch-scoped, Preview-only Fiuu sandbox pilot mapping for `BR001`; Production remains in manual QR mode.
- Enabled `POS_QR_PAYMENT_MODE=fiuu` only for the `codex/fiuu-live-readiness-hardening` Preview branch so the pilot can be validated without changing Production.
- Corrected the official-tablet middleware guard so kiosk-bound staff can remain on `/pos` without entering a `/dashboard` to `/pos` redirect loop; authentication, device validation and branch-scoped API controls remain enforced.
- Recovered access to the Roti Kaya Junus Fiuu sandbox account and sent a written OPA contract confirmation request under Ticket `2924959` without recording credentials in the repository.
- Completed a synthetic BR001 Preview POS rehearsal through official-device enrolment, STAFF login, shift membership and opening-stock SOP. The first controlled Fiuu sandbox pre-create request failed safely with provider HTTP `404` (Application Code or transaction not found); no sale, receipt or stock deduction was created and Production was not changed.
