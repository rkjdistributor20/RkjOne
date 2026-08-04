# RKJ One Staff - Final Release Checklist

Last verified: 2026-08-05

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
- D-U-N-S rasmi RKJ Distributor telah diterima: `47-331-2040` / digit-only `473312040`.
- iOS export-compliance flag ditetapkan untuk standard HTTPS/TLS sahaja.
- App Store review notes, privacy answers dan Custom App flow sudah disediakan.
- Google Play Production version `1.4` (version code `5`) tersedia di Google Play dengan rollout `100%`.
- Android shell semasa menggunakan package `com.rkjone.staff` dan memuatkan `https://rkj.one`.

## Perlu Dibuat Dalam Akaun Store

Google Play Console:

- Pantau Android vitals, crash dan ANR untuk release Production `1.4` (code `5`).
- Pastikan test login reviewer kekal aktif dan terhad kepada BR011.
- Hanya bina AAB baharu jika native code, permission, package metadata, signing, target SDK atau konfigurasi Capacitor berubah.
- Perubahan Fiuu semasa ialah server-side; ia tidak memerlukan AAB baharu.

Apple:

- Siapkan Apple Developer Program jenis Organization untuk `RKJ DISTRIBUTOR SDN. BHD.` menggunakan D-U-N-S `473312040`.
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

Release AAB memerlukan JDK 21, Android SDK dan `android/keystore.properties` pada mesin signing. Fail signing tidak boleh dicommit.

Android debug:

```bash
npm run mobile:android:debug
```

iOS sync:

```bash
npm run mobile:sync:ios
```
