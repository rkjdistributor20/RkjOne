# RKJ One Mobile App Release

Dokumen ini merekod status PWA, Android shell dan laluan penerbitan Play Store/App Store untuk RKJ One.

## Status Semasa

- PWA installable sudah disediakan melalui `public/manifest.json`.
- Service worker sudah ditambah di `public/sw.js` dengan offline fallback yang tidak cache data operasi sensitif.
- Ikon aplikasi rasmi sudah dijana di `public/app-icon-*.png`.
- Android shell sudah dibuat dengan Capacitor menggunakan package id `com.rkjone.staff`.
- Android app memuatkan production URL `https://rkj.one`.
- Halaman privacy policy tersedia di `https://rkj.one/privacy`.
- Fiuu DuitNow QR dinamik disediakan dalam kod tetapi kekal dalam mod manual sehingga channel merchant, sandbox callback dan pilot satu cawangan diluluskan. Android shell memuatkan `https://rkj.one`, jadi perubahan web tidak memerlukan AAB baharu selagi kod native, permission dan konfigurasi Capacitor tidak berubah.
- Android debug APK sudah berjaya dibina di `android/app/build/outputs/apk/debug/app-debug.apk`.
- Android release AAB sudah berjaya dibina dan ditandatangani di `android/app/build/outputs/bundle/release/app-release.aab`.
- iOS project scaffold sudah dibuat di `ios/` untuk sambungan build di Mac/Xcode.
- Bahan Play Store/App Store sudah dijana di `outputs/mobile-release/store-assets/`.
- Dokumen submission tersedia di `docs/mobile/`.
- D-U-N-S rasmi RKJ Distributor sudah diterima: `47-331-2040` / digit-only `473312040`.

## Kawalan Keselamatan Mobile

- Android cleartext HTTP dimatikan.
- Android app backup/cloud extraction dimatikan supaya data app tidak disalin automatik.
- Service worker tidak cache halaman login, dashboard, POS, HR, laporan, inventory, API atau halaman operasi.
- Metadata login dan PWA tidak mendedahkan email contoh, bilangan cawangan atau maklumat rahsia syarikat.
- Release Android tidak boleh debug.

## Build Android Untuk Play Store

Syarat komputer:

- Android Studio terkini
- JDK yang disokong Android Studio
- Google Play Developer Account
- D-U-N-S `473312040` untuk akaun Organization jika diminta
- Keystore upload rasmi syarikat

Command dari root projek:

```bash
npm install
npm run build
npm run mobile:android:release
```

Fail untuk upload Play Store:

- `android/app/build/outputs/bundle/release/app-release.aab`
- Salinan release juga boleh dikumpulkan di `outputs/mobile-release/builds/` jika diperlukan.

Signing key lokal:

- Keystore: `android/keystores/rkj-one-upload-key.jks`
- Konfigurasi signing: `android/keystore.properties`
- Kedua-dua fail ini sengaja di-ignore oleh Git kerana ia rahsia syarikat.

Dalam Android Studio jika mahu build manual:

1. Buka projek Android.
2. Pilih `Build > Generate Signed Bundle / APK`.
3. Pilih `Android App Bundle`.
4. Guna keystore upload rasmi syarikat.
5. Upload fail `.aab` ke Google Play Console.

Maklumat store yang sudah disediakan:

- Nama app: `RKJ One Staff`
- Package id: `com.rkjone.staff`
- Privacy Policy URL: `https://rkj.one/privacy`
- App category: Business / Productivity
- App access: Restricted internal staff login
- Draft store listing: `docs/mobile/PLAY_STORE_SUBMISSION.md`
- Data Safety draft: `docs/mobile/DATA_SAFETY.md`
- Screenshot phone dan feature graphic: `outputs/mobile-release/store-assets/`
- Test account untuk reviewer masih perlu dicipta/diberi dalam Google Play Console.

## Laluan App Store

iOS tidak boleh dibina sepenuhnya dari Windows sahaja. Untuk App Store, perlu salah satu:

- Mac dengan Xcode dan Apple Developer Program
- Cloud Mac build service
- Apple Business Manager Custom App jika aplikasi hanya untuk staf dalaman

D-U-N-S untuk Apple Developer Organization:

```text
RKJ DISTRIBUTOR SDN. BHD. - 473312040
```

Cadangan terbaik untuk RKJ One ialah `Custom App` melalui Apple Business Manager kerana sistem ini aplikasi operasi dalaman, bukan aplikasi umum.

Langkah teknikal iOS nanti di Mac:

```bash
npm install
npm run build
npm run mobile:sync:ios
npm run mobile:ios
```

Kemudian build dan upload melalui Xcode / Transporter.

## Checklist Sebelum Submit

- Pastikan semua login production telah diuji.
- Pastikan role staff, AM, OM, HQ dan owner tidak bocor silang syarikat.
- Pastikan POS boleh buka syif, kira stok, jualan, tutup syif dan simpan rekod.
- Pastikan dokumen privacy policy boleh dibuka tanpa login.
- Pastikan reviewer store diberi akaun test khas yang tidak dedahkan data sebenar.
- Pastikan Supabase RLS dan API route tidak bergantung pada UI sahaja.
- Pastikan semua secret hanya berada di Vercel/Supabase, bukan dalam source code atau mobile app.
