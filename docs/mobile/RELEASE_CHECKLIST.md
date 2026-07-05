# RKJ One Staff - Final Release Checklist

## Sudah Siap

- PWA manifest.
- Service worker dan offline fallback.
- Android Capacitor shell.
- Android cleartext HTTP disabled.
- Android backup disabled.
- Android APK debug.
- Android AAB release signed.
- iOS Capacitor project scaffold.
- Privacy policy live.
- Store screenshots draft.
- Play Store listing draft.
- App Store listing draft.
- Data Safety draft.
- Google Play reviewer account untuk BR011.
- D-U-N-S request kepada D&B Malaysia telah dihantar; tunggu nombor 9 digit.
- iOS export-compliance flag ditetapkan untuk standard HTTPS/TLS sahaja.
- App Store review notes, privacy answers dan Custom App flow sudah disediakan.

## Perlu Dibuat Dalam Akaun Store

Google Play Console:

- Selesaikan developer account Organization selepas D-U-N-S diterima.
- Buat app baru `RKJ One Staff`.
- Upload `android/app/build/outputs/bundle/release/app-release.aab`.
- Isi Store Listing menggunakan `docs/mobile/PLAY_STORE_SUBMISSION.md`.
- Upload screenshots dari `outputs/mobile-release/store-assets`.
- Isi Data Safety menggunakan `docs/mobile/DATA_SAFETY.md`.
- Masukkan test login reviewer.
- Release ke Internal testing dahulu.

Apple:

- Tunggu nombor D-U-N-S daripada D&B Malaysia.
- Siapkan Apple Developer Program jenis Organization untuk `RKJ DISTRIBUTOR SDN. BHD.`.
- Jika app hanya untuk staf dalaman, gunakan Custom App / Apple Business Manager.
- Build iOS di Mac/Xcode.
- Upload ke App Store Connect.
- Uji melalui TestFlight.
- Submit sebagai Custom App/internal app.

## Arahan Build Semula

Android release:

```bash
npm run build
npm run mobile:android:release
```

Android debug:

```bash
npm run mobile:android:debug
```

iOS sync:

```bash
npm run mobile:sync:ios
```
