# Changelog

## 2026-08-26 - Fiuu POS dynamic-QR safety hardening

- Preserved unresolved branch-and-shift QR attempts across reloads and blocked duplicate QR creation throughout late-callback reconciliation, including a server/database guard against concurrent tabs.
- Added visible polling, image, expiry, cancellation and receipt-recovery states to the POS payment dialog.
- Kept delayed callback verification operational after a rollback to manual creation mode, while requiring explicit Store-mapped branch credentials for Production creation.
- Limited callback request bodies, validated callback payment identifiers before lookup and removed shared-IP throttling that could reject legitimate Fiuu callbacks before signature verification.
- Added a migration to serialize Malaysia-business-day POS numbering, verify the stored Fiuu gateway reference and enforce a bounded late-callback/shift-close grace period.
- Local validation passed: all 171 migrations, 31 tests, TypeScript, ESLint and the Next.js Production build. The new migration and provider UAT remain unapplied to staging and Production.

## 2026-08-21 - Fiuu Agent Preview callback hardening

- Added environment-specific, allowlisted Fiuu Agent callback and Return URLs
  so protected Preview deployments can receive provider callbacks without
  weakening Production deployment protection.
- Added the verified agent contact phone to the Hosted Payment Page request.

- Added a staging-first Fiuu Hosted Payment Page adapter for RKJ Distributor Agent Payment, with a dedicated signed callback/return boundary, merchant/amount/MYR verification, single-PENDING idempotency, host allowlisting and separate server-only credentials from the Roti Kaya Junus POS merchant. Production remains disabled pending signed provider UAT and Finance reconciliation.

## 2026-08-17

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
