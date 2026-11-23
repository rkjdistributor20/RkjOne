# RKJ One Staff 1.8.5 - Pemulihan Fiuu VT terkawal

## Release

- Track: Production
- Version code: `23`
- Version name: `1.8.5`
- AAB SHA-256: `C235CA00E126EB633D9B73BE4B0AA1F1C26489F0BF89F5C25E523C2B85E1DBA4`
- AAB size: `1,742,433 bytes`

## Nota keluaran BM

Pemulihan pembayaran Fiuu VT kini menghentikan cubaan STATUS berulang selepas had selamat atau tamat tempoh QR, sambil mengekalkan transaksi asal untuk pengesahan bayaran lewat tanpa mencampurkannya dengan pesanan pelanggan seterusnya. Aplikasi juga mengesan versi web baharu dan memuat semula hanya apabila troli kosong, tiada proses pembayaran aktif dan tiada jualan luar talian belum dihantar.

## Release notes EN

Fiuu VT recovery now stops repeated STATUS launches after a bounded retry limit or QR expiry while retaining the original transaction for exact late-payment reconciliation. The app also detects a newer hosted frontend and reloads only when the cart is empty, no payment recovery is active and no offline sale is waiting to sync.

## Acceptance gates

- The full Vitest suite, TypeScript, ESLint and the Next.js Production build must pass.
- The forward-only database migration must pass a clean/local application and transactional integration tests for budget exhaustion, expiry and concurrent last-slot claims.
- The signed AAB certificate must match the previously accepted RKJ One Staff upload certificate.
- Production migration and web deployment must be healthy before Play rollout.
- BR001 physical-tablet UAT remains mandatory before expanding beyond the pilot gate.

## Verified build evidence

- Gradle `bundleRelease` completed successfully on Temurin JDK 21.
- Standard Java signature verification passed.
- The signer certificate SHA-256 is identical to the accepted v1.8.4 bundle.
