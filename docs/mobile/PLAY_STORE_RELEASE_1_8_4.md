# RKJ One Staff 1.8.4 - Pemulihan jualan baharu Fiuu VT

## Release

- Track: Production
- Version code: `22`
- Version name: `1.8.4`
- AAB SHA-256: `4B9A54346E954FEB852A904493106EF5AAF59EED34CBD054726175AAF3FF43FA`
- AAB size: `1,742,244 bytes`

## Nota keluaran BM

Pelepasan terminal Fiuu VT kini kekal selamat walaupun aplikasi atau WebView dimuat semula. Transaksi lama disahkan atau dikuarantin secara atomik sebelum terminal dilepaskan, resit dipulihkan daripada rekod server, dan SALE baharu hanya dibenarkan selepas antrean callback benar-benar kosong. Pemulihan callback syif terdahulu turut dihadkan kepada tablet rasmi dan identiti satu-kali yang sepadan tepat.

## Release notes EN

Fiuu VT terminal release now remains safe across app or WebView reloads. Previous transactions are atomically finalized or quarantined before terminal release, receipts are restored from authoritative server records, and a new SALE is allowed only after the callback queue is proven empty. Prior-shift callback recovery is also restricted to the same official tablet and an exact one-time identity.

## Acceptance gates

- 56 Vitest files and 610 tests pass.
- TypeScript, full ESLint, diff checks and the 166-page Next.js Production build pass.
- Supabase linked schema lint passes; dry-run lists only
  `20261123150000_release_fiuu_vt_cashier_after_void_launch.sql`.
- A clean local Supabase reset applies the full migration chain through
  `20261123150000` successfully.
- A transactional local database integration test proves the released original
  payment and an immediate new payment can coexist for the same cashier, shift
  and official tablet. Exact replay is idempotent, a different VOID attempt is
  rejected, and existing `STATUS 00` evidence blocks cashier release. The test
  transaction is rolled back.
- The existing signed 1.8.4 AAB checksum matches the artifact above. Standard
  signature verification recognizes the upload signature; strict Java
  verification reports the expected self-signed upload-certificate and missing
  timestamp warnings, so it is not recorded as a strict-clean result.
- This hotfix changes the database and the web/PWA hosted at `https://rkj.one`;
  it does not change native Android code. The 1.8.4 wrapper already points to
  that host, so a replacement AAB is not required for the cashier-release fix.
- Production migration, web deployment, BR001 physical-tablet UAT and the
  installed-version inventory remain release gates. Do not describe the fleet
  as updated until those checks are recorded per tablet.
