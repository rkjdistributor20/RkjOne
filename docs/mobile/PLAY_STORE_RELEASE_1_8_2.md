# RKJ One Staff 1.8.2 - Pantas pulih transaksi Fiuu VT

## Release

- Track: Production
- Version code: `20`
- Version name: `1.8.2`

## Nota keluaran BM

Proses bayaran Fiuu VT kini pulih dengan lebih cepat apabila QR tamat atau STATUS penyedia berulang kali gagal. Staf boleh memarkir transaksi bermasalah untuk semakan HQ, mengekalkan troli dan meneruskan jualan tanpa menggandakan resit atau stok. Semakan callback lewat dan keselamatan transaksi turut dipertingkat.

## Release notes EN

Fiuu VT checkout now recovers faster when a QR expires or provider STATUS checks repeatedly fail. Staff can safely park a stalled payment for HQ review, keep the cart, and continue selling without duplicating receipts or stock. Late-callback and transaction-safety checks are also improved.

## Acceptance gates

- Database migration applied before the web deployment.
- Unit, route, TypeScript, lint and production-build checks pass.
- Signed AAB SHA-256 recorded and version code verified as `20`.
- BR001 physical-tablet smoke test confirms: expiry, repeated error, safe park, cart retained, new checkout available, normal successful payment and receipt.
- Google Play Production submission is reviewed before full rollout.
