# RKJ One Staff 1.8.1 - Fiuu VT Checkout Resilience

Status: **Prepared for coordinated Google Play Production release**

## Version

- Package: `com.rkjone.staff`
- Version name: `1.8.1`
- Version code: `19`
- Production URL: `https://rkj.one`

## Included

- Cashier can safely cancel or leave an expired, cancelled or abandoned Fiuu VT attempt and start the next sale.
- A final provider-status reconciliation runs before cancellation so a late successful payment is not discarded.
- Native callback recovery handles app resume/restart, duplicate callbacks, a missing VOID callback and stale pending state.
- An unresolved VT payment is never released by the local countdown or VOID alone; two matching provider STATUS checks are required before another payable attempt is allowed.
- Foreground, connectivity and visibility recovery now rechecks STATUS automatically without repeatedly reopening Fiuu VT.
- A protected server recovery job finalizes durable successful reports even if the cashier closes or reloads the payment screen.
- Receipt, stock deduction and payment fulfillment remain idempotent and exactly once.
- Fiuu VT eligibility remains limited to an active registered official tablet mapped to the exact `BR001`-`BR036` branch.
- Existing static/manual QR fallback remains available when the official VT app or registered tablet is not ready.

## Play Store Release Notes (BM)

> Aliran Fiuu VT diperkemas untuk BR001-BR036. Pembatalan yang tersekat kini pulih sendiri, semakan bayaran disambung semula apabila aplikasi kembali aktif, dan jualan berjaya dipulihkan tanpa menggandakan resit atau stok. Kaunter boleh bergerak semula dengan lebih cepat selepas status akhir Fiuu disahkan.

## Coordinated Release Gate

The Android bundle loads `https://rkj.one`. Publish version code 19 only after the matching server commit is deployed to Production. Keep the current release available until both server smoke checks and the Play Console pre-launch checks pass.

## Build

```powershell
npm run mobile:android:release
```

The release requires the existing protected `android/keystore.properties` and `android/keystores/rkj-one-upload-key.jks`. Never commit or disclose either signing secret.
