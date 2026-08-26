# RKJ One Staff 1.6.9 - Bluetooth Receipt Printer and Cash Drawer Release

Status: **Ready for Internal Testing; physical UAT required before Production promotion**

## Version

- Package: `com.rkjone.staff`
- Version name: `1.6.9`
- Version code: `16`
- Version code: `10`
- Target SDK: `36`

## Release Scope

- Direct Android Bluetooth receipt printing for paired 58 mm `POS-5890U-L` units.
- Printer setup and test page available from the POS header before the first customer.
- Saved per-tablet printer selection.
- Verified test-page state and an explicit per-tablet auto-print setting.
- Exactly-once automatic print attempt after a confirmed receipt, with manual reprint retained.
- 32-column ESC/POS customer receipt.
- System print and share fallback remain available.
- On Android, an unconfigured printer now opens the setup guidance instead of silently invoking system print.
- Bluetooth connection attempts are time-limited and retry through the compatible bonded-device RFCOMM mode before showing a safe error.
- Generic printer compatibility adds a final RFCOMM channel 1 attempt for the photographed POS-5890U-L class after both standard SPP modes fail.
- Android kiosk enforcement is dispatched on the UI thread to prevent the `CalledFromWrongThreadException` observed in Production 1.5.
- No payment, sale, stock, authentication, RBAC or database behavior is changed.

## Required Gate

Upload to Internal Testing so the exact Play-delivered build can be tested. Complete `docs/POS_BLUETOOTH_PRINTER.md` on one official branch tablet, physical printer and connected drawer. Do not promote to Production if pairing, test printing, long item names, totals, auto-print, drawer timing, duplicate protection, retry after power loss or app restart persistence fail.

## Internal Testing Release Notes

> Tetapan printer Bluetooth 58 mm kini menyokong ujian wajib dan auto-cetak selepas bayaran berjaya. Sambungan POS-5890U-L diperkemas dengan mod keserasian tambahan, auto-cetak dilindungi daripada cetakan berganda, dan Cetak terus kekal tersedia untuk salinan pelanggan.

## Build

```powershell
npm run mobile:android:release
```

The release command requires the existing protected `android/keystore.properties` and upload keystore. Never commit either file or disclose signing values.

## Rollout

1. Upload version code 10 to Internal testing only.
2. Add the pilot branch tester account.
3. Install through the Play Internal Testing link.
4. Complete the physical-printer checklist.
5. Monitor crashes and ANRs for the pilot.
6. Promote only after owner acceptance; do not change the current Production release automatically.
