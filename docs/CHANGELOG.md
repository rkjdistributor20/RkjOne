# Changelog

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
