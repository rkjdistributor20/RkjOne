# RKJ One Staff 1.8.0 - Fiuu VT Checkout Recovery

Status: **Prepared for coordinated Google Play Production release**

## Version

- Package: `com.rkjone.staff`
- Version name: `1.8.0`
- Version code: `18`
- Production URL: `https://rkj.one`

## Included

- Cashier can safely cancel or leave an expired, cancelled or abandoned Fiuu VT attempt and start the next sale.
- A final provider-status reconciliation runs before cancellation so a late successful payment is not discarded.
- Native callback recovery handles app resume/restart, duplicate callbacks and stale pending state.
- Receipt, stock deduction and payment fulfillment remain idempotent and exactly once.
- Fiuu VT eligibility remains limited to an active registered official tablet mapped to the exact `BR001`-`BR036` branch.
- Existing static/manual QR fallback remains available when the official VT app or registered tablet is not ready.

## Play Store Release Notes (BM)

> Aliran Fiuu VT diperkemas untuk BR001-BR036. Staf kini boleh membatalkan atau memulakan jualan baharu apabila QR tamat tempoh, semakan bayaran lewat dipulihkan dengan selamat, dan resit serta stok kekal direkod tepat sekali. Pemulihan selepas aplikasi terganggu turut dipertingkat.

## Coordinated Release Gate

The Android bundle loads `https://rkj.one`. Publish version code 18 only after the matching server commit is deployed to Production. Keep the current release available until both server smoke checks and the Play Console pre-launch checks pass.

## Build

```powershell
npm run mobile:android:release
```

The release requires the existing protected `android/keystore.properties` and `android/keystores/rkj-one-upload-key.jks`. Never commit or disclose either signing secret.
