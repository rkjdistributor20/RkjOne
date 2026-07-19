# App Store Connect - Step By Step

Dokumen ini untuk siapkan Apple Developer Organization, TestFlight dan App Store/Custom App untuk `RKJ One Staff`.

## 1. Apple Developer Enrollment

Enroll sebagai:

```text
Organization
```

Maklumat syarikat:

```text
Legal entity: RKJ DISTRIBUTOR SDN. BHD.
SSM: 201901043508
D-U-N-S: 473312040
Website: https://rkj.one
Privacy policy: https://rkj.one/privacy
```

Gunakan Apple ID syarikat yang:

- Ada two-factor authentication.
- Boleh akses email/telefon verifikasi.
- Bukan akaun peribadi staf jika boleh.

Apple mungkin hubungi wakil syarikat untuk verifikasi.

## 2. App Store Connect App

Selepas akaun Apple Developer lulus, cipta app:

```text
Platform: iOS
Name: RKJ One Staff
Primary language: English (U.S.) atau Malay jika tersedia
Bundle ID: com.rkjone.staff
SKU: RKJONESTAFF001
Category: Business
```

Distribution yang disyorkan:

```text
Custom App / Apple Business Manager
```

Sebab app ini ialah sistem operasi dalaman, bukan app pengguna awam.

## 3. App Information

Copy metadata daripada:

```text
docs/mobile/APP_STORE_SUBMISSION.md
```

Privacy policy:

```text
https://rkj.one/privacy
```

Review notes:

```text
This is a restricted internal staff operations app. Public registration is not available.

Please use the provided reviewer account to test login, POS demo flow, shift summary, stock/SOP screens, branch profile, HR/payroll reference screens and logistics workflow. Online QR payment is not active for live payment; manual payment verification is used during this review build.
```

Reviewer credential:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

## 4. App Privacy

Rujuk:

```text
docs/mobile/APP_STORE_SUBMISSION.md
docs/mobile/DATA_SAFETY.md
```

Jawapan ringkas:

- Tracking: No.
- Data linked to user: contact info, identifiers, internal operations records.
- Purpose: app functionality, account management, internal analytics.
- Not used for third-party advertising.

## 5. Build iOS

Perlu Mac/Xcode atau cloud Mac.

Di Mac:

```bash
git pull
npm install
npm run build
npm run mobile:sync:ios
npm run mobile:ios
```

Dalam Xcode:

1. Buka project `ios/App/App.xcworkspace`.
2. Pilih target `App`.
3. Signing & Capabilities: pilih Apple Developer Organization RKJ Distributor.
4. Pastikan bundle identifier `com.rkjone.staff`.
5. Product > Archive.
6. Distribute App > App Store Connect.
7. Upload build.

## 6. TestFlight

Selepas build diproses:

1. Tambah internal tester.
2. Test login reviewer.
3. Test POS demo, stock SOP, shift, HR/payroll reference, logistics dan reports.
4. Pastikan privacy policy boleh buka tanpa login.

## 7. Submit Review

Sebelum submit:

- Build uploaded.
- App privacy complete.
- Review notes complete.
- Reviewer credential entered.
- Screenshots uploaded.
- Custom App / internal distribution dipilih jika tersedia.

Jangan aktifkan live payment dalam review build sehingga merchant/provider payment benar-benar approved dan webhook production lulus.
