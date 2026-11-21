# RKJ One Staff 1.8.2 - Pantas pulih transaksi Fiuu VT

## Release

- Track: Production
- Version code: `20`
- Version name: `1.8.2`

## Nota keluaran BM

Proses bayaran Fiuu VT kini pulih dengan lebih cepat apabila QR tamat atau STATUS penyedia berulang kali gagal. Staf boleh mengkuarantin transaksi yang tidak pasti untuk semakan Finance/HQ dan terus melayan pelanggan seterusnya. Troli asal dikosongkan supaya bayaran yang sama tidak dicaj semula, sementara callback lewat, resit dan stok kekal dilindungi daripada pemprosesan berganda.

## Release notes EN

Fiuu VT checkout now recovers faster when a QR expires or provider STATUS checks repeatedly fail. Staff can quarantine an uncertain payment for Finance/HQ review and continue serving the next customer. The original cart is cleared to prevent a repeat charge, while late callbacks, receipts and stock remain protected from duplicate processing.

## Acceptance gates

- Database migration applied before the web deployment.
- Unit, route, TypeScript, lint and production-build checks pass.
- Signed AAB SHA-256 recorded and version code verified as `20`.
- BR001 physical-tablet smoke test confirms: expiry, repeated error, safe quarantine, original cart cleared, next checkout available, normal successful payment and receipt.
- Google Play Production submission is reviewed before full rollout.
