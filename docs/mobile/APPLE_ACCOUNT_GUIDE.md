# Apple Developer Account Guide - RKJ One Staff

Panduan ini untuk siapkan akaun Apple sehingga RKJ One boleh dihantar ke TestFlight dan App Store/Custom App.

## 1. D-U-N-S Syarikat

Status semasa: D-U-N-S rasmi daripada D&B Malaysia sudah diterima pada 16 Julai 2026.

```text
Legal entity: RKJ DISTRIBUTOR SDN. BHD.
D-U-N-S: 47-331-2040
D-U-N-S digit-only: 473312040
```

Semasa isi Apple/Google, semak:

- D-U-N-S number mesti 9 digit.
- Nama syarikat mesti padan dengan `RKJ DISTRIBUTOR SDN. BHD.`
- Alamat syarikat mesti padan dengan rekod rasmi.

Jangan masukkan nombor SSM sebagai D-U-N-S.

## 2. Sediakan Apple ID Syarikat

Guna Apple ID syarikat, bukan akaun peribadi jika boleh.

Wajib:

- Two-factor authentication aktif.
- Email boleh diakses oleh syarikat.
- Nombor telefon aktif untuk verifikasi.

## 3. Enroll Apple Developer Program

Pilih:

```text
Organization
```

Masukkan:

- Legal entity: `RKJ DISTRIBUTOR SDN. BHD.`
- D-U-N-S: `473312040`
- Website: `https://rkj.one`
- Contact person: wakil syarikat yang boleh jawab panggilan/email Apple

Jika Apple minta bukti, sediakan dokumen SSM dan pengesahan wakil syarikat.

## 4. Selepas Akaun Lulus

Masuk App Store Connect dan buat app baru:

- Name: `RKJ One Staff`
- Bundle ID: `com.rkjone.staff`
- SKU: `RKJONESTAFF001`
- Category: `Business`
- Pricing: free
- Distribution: Custom App / internal jika tersedia untuk organisasi

## 5. Build Dan Upload

Ini perlu Mac dengan Xcode:

```bash
npm install
npm run build
npm run mobile:sync:ios
npm run mobile:ios
```

Dalam Xcode:

1. Set signing team kepada organisasi Apple Developer syarikat.
2. Archive.
3. Upload ke App Store Connect.
4. Uji melalui TestFlight.
5. Submit review.

## 6. App Review Account

Guna akaun reviewer khas:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

Akaun ini terhad kepada cawangan test dan tidak mendedahkan akaun owner sebenar.

## 7. Nota Penting

- App Store biasanya lebih sesuai melalui Custom App kerana RKJ One ialah app operasi dalaman.
- Jangan letak rahsia syarikat dalam store listing.
- Jangan aktifkan payment online live dalam review build sehingga gateway benar-benar siap.
- Pastikan privacy policy boleh dibuka tanpa login.
