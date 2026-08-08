# Changelog

## 2026-08-08

- Applied the complete 169-migration repository history to the isolated Supabase staging project and verified a clean linked dry-run and schema lint.
- Created PR #12 for the POS/Fiuu payment lifecycle hardening work.
- Added a branch-scoped, Preview-only Fiuu sandbox pilot mapping for `BR001`; Production remains in manual QR mode.
- Enabled `POS_QR_PAYMENT_MODE=fiuu` only for the `codex/fiuu-live-readiness-hardening` Preview branch so the pilot can be validated without changing Production.
- Corrected the official-tablet middleware guard so kiosk-bound staff can remain on `/pos` without entering a `/dashboard` to `/pos` redirect loop; authentication, device validation and branch-scoped API controls remain enforced.
- Recovered access to the Roti Kaya Junus Fiuu sandbox account and sent a written OPA contract confirmation request under Ticket `2924959` without recording credentials in the repository.
