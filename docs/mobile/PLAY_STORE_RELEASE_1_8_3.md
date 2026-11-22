# RKJ One Staff 1.8.3 - Pelepasan terminal Fiuu VT tepat

## Release

- Track: Production
- Version code: `21`
- Version name: `1.8.3`
- AAB SHA-256: `EC2DA735A6CA2AED4C815B3E5B173B5957C86BBF85B6EBA90603B402B9892AD3`

## Nota keluaran BM

Terminal Fiuu VT kini boleh dilepaskan dengan selamat selepas ralat semakan STATUS direkod untuk audit, tanpa mengulangi caj atau SALE. Transaksi lama kekal dikuarantin untuk semakan Finance/HQ, sementara staf boleh meneruskan pelanggan seterusnya. Amaun QR penuh juga sentiasa sama tepat dengan jumlah troli.

## Release notes EN

The Fiuu VT terminal can now be safely released after a STATUS-check error is recorded for audit, without repeating a charge or SALE. The previous transaction remains quarantined for Finance/HQ review while staff can continue with the next customer. Full QR payments are also always pinned to the exact cart total.

## Acceptance gates

- Unit, Android bridge, TypeScript, lint and production-build checks pass.
- Signed AAB SHA-256 is recorded; the Play Console performs the final bundle/version validation during upload.
- BR001 physical-tablet smoke test confirms the old quarantined order is released, the next cart amount remains exact and no duplicate SALE is created.
- Google Play Production submission is reviewed before full rollout.
