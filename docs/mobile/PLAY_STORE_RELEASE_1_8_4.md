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

- 53 Vitest files and 555 tests pass.
- TypeScript, full ESLint, diff checks and the 166-page Next.js Production build pass.
- Supabase linked schema lint passes; dry-run lists only the two reviewed Fiuu VT migrations.
- Android unit tests and release lint pass with JDK 21.
- Independent final release audit reports `RELEASE-SAFE` with no blocking findings.
- The signed AAB was rebuilt from this exact source; `jarsigner` verification passes and the SHA-256 above matches the upload artifact.
- The matching database and web release must be live before BR001 physical-tablet smoke testing and Play Production rollout.
