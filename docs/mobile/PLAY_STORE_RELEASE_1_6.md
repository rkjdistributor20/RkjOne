# RKJ One Staff 1.6.2 - Bluetooth Receipt Printer Release

Status: **Physical UAT required before Play upload**

## Version

- Package: `com.rkjone.staff`
- Version name: `1.6.2`
- Version code: `9`
- Target SDK: `36`

## Release Scope

- Direct Android Bluetooth receipt printing for paired 58 mm `POS-5890U-L` units.
- Printer setup and test page available from the POS header before the first customer.
- Saved per-tablet printer selection.
- 32-column ESC/POS customer receipt.
- System print and share fallback remain available.
- On Android, an unconfigured printer now opens the setup guidance instead of silently invoking system print.
- Bluetooth connection attempts are time-limited and retry through the compatible bonded-device RFCOMM mode before showing a safe error.
- Android kiosk enforcement is dispatched on the UI thread to prevent the `CalledFromWrongThreadException` observed in Production 1.5.
- No payment, sale, stock, authentication, RBAC or database behavior is changed.

## Required Gate

Complete `docs/POS_BLUETOOTH_PRINTER.md` on one official branch tablet and physical printer. Do not upload or promote the AAB if pairing, test printing, long item names, totals, retry after power loss or app restart persistence fail.

## Internal Testing Release Notes

> Cetakan resit Bluetooth 58 mm diperkemas. Butang cetak kini membuka panduan persediaan jika printer belum dipilih, dan sambungan printer mempunyai had masa serta cubaan keserasian tambahan. Pasangkan, pilih dan uji printer sekali sebelum menggunakan Cetak terus.

## Build

```powershell
npm run mobile:android:release
```

The release command requires the existing protected `android/keystore.properties` and upload keystore. Never commit either file or disclose signing values.

## Rollout

1. Upload version code 9 to Internal testing only.
2. Add the pilot branch tester account.
3. Install through the Play Internal Testing link.
4. Complete the physical-printer checklist.
5. Monitor crashes and ANRs for the pilot.
6. Promote only after owner acceptance; do not change the current Production release automatically.
