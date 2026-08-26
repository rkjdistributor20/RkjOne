# Changelog

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
