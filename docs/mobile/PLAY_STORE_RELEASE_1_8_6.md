# RKJ One Staff 1.8.6 - Pelepasan kaunter Fiuu VT tepat

## Release

- Track: Production
- Version code: `24`
- Version name: `1.8.6`
- AAB SHA-256: `290A2BE17E9952B27DCCF25603477C89A2918AE58A64DE16B77D993A9EADCDD1`
- AAB size: `1,742,433 bytes`
- Signer certificate SHA-256: `36:CE:05:C5:36:19:D4:F4:29:32:D2:14:CD:DC:9B:5F:F5:D4:95:C3:A4:03:49:AB:0C:0F:16:A1:0B:CE:2A:02`

## Nota keluaran BM

Pembatalan atau tamat tempoh pembayaran Fiuu VT kini melepaskan kaunter selepas semakan STATUS terkawal dan kuarantin pelayan yang disahkan. Transaksi asal serta callback lewat kekal dipadankan secara tepat tanpa bercampur dengan pesanan pelanggan seterusnya. Jualan luar talian juga diketatkan kepada tunai sahaja dan diikat kepada staf, tablet rasmi serta syif asal.

## Release notes EN

Expired or cancelled Fiuu VT attempts now release the cashier only after bounded STATUS checks and a verified server-side quarantine. The original payment and any late callback remain exactly matched without affecting the next customer's order. Offline sales are also restricted to cash and bound to the original staff, official tablet and shift.

## Acceptance gates

- The complete Vitest suite, TypeScript, ESLint and Next.js production build pass.
- Both forward-only database migrations compile and pass transactional rollback tests.
- Only a verified `QUARANTINED` database result can release native terminal state.
- Active launch/callback leases and all provider-success evidence fail closed.
- A late callback changes only the original payment; the next checkout stays unchanged.
- The signed AAB certificate matches the accepted v1.8.5 upload certificate.
- Production migration and web deployment must be healthy before Play rollout.
- BR001 physical-tablet UAT remains mandatory before expansion beyond the pilot gate.

## Verified build evidence

- Gradle `bundleRelease` completed successfully on Temurin JDK 21.
- Standard Java signature verification passed; strict verification only reports the expected self-signed upload certificate and Android App Bundle ZIP/JAR compatibility warnings.
- The signer certificate SHA-256 is identical to the accepted v1.8.5 bundle.
