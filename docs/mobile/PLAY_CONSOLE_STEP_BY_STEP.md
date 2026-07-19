# Google Play Console - Step By Step

Dokumen ini untuk submit `RKJ One Staff` ke Google Play Console.

## 1. Developer Account

1. Login ke Google Play Console.
2. Pilih atau cipta developer account jenis `Organization`.
3. Guna maklumat syarikat:

```text
Legal entity: RKJ DISTRIBUTOR SDN. BHD.
SSM: 201901043508
D-U-N-S: 473312040
Website: https://rkj.one
Contact email: rkjdistributor20@gmail.com
```

4. Lengkapkan identity/payment verification Google jika diminta.

## 2. Create App

Isi:

```text
App name: RKJ One Staff
Default language: English (United States) atau Malay jika tersedia
App or game: App
Free or paid: Free
Category: Business
```

Tick declaration yang berkaitan selepas semak Play Console.

## 3. App Content

Privacy policy:

```text
https://rkj.one/privacy
```

App access:

```text
All or some functionality is restricted.
```

Reviewer instruction:

```text
This is a restricted internal staff operations app. Please use the provided test account to review the login flow, POS demo screens, branch profile, HR/payroll demo, logistics workflow and privacy policy. No public customer registration is available.
```

Reviewer credential:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

Jangan guna akaun owner/admin sebenar.

## 4. Store Listing

Copy store listing daripada:

```text
docs/mobile/PLAY_STORE_SUBMISSION.md
```

Upload assets:

```text
outputs/mobile-release/store-assets/play-store-feature-graphic.png
outputs/mobile-release/store-assets/01-secure-login.png
outputs/mobile-release/store-assets/02-pos-counter.png
outputs/mobile-release/store-assets/03-branch-operations.png
outputs/mobile-release/store-assets/04-hr-payroll.png
outputs/mobile-release/store-assets/05-logistics-agent.png
```

## 5. Data Safety

Rujuk jawapan:

```text
docs/mobile/DATA_SAFETY.md
```

Pastikan jawapan selari dengan app sebenar:

- Login dalaman sahaja.
- Data digunakan untuk operasi syarikat.
- Tiada advertising tracking.
- Data tidak dijual kepada pihak ketiga.
- Payment live hanya aktif selepas merchant/provider approve.

## 6. Upload Release

Mula dengan `Internal testing`.

Upload:

```text
outputs/mobile-release/builds/rkj-one-staff-v1.0-release.aab
```

Release notes:

```text
Initial internal release for RKJ staff operations: secure login, POS, stock SOP, shift workflow, HR/payroll reference, logistics, approvals and reports.
```

## 7. Final Review Sebelum Submit

- App bundle uploaded.
- Store listing complete.
- Screenshots uploaded.
- Feature graphic uploaded.
- Privacy policy URL works.
- App access reviewer credential entered.
- Data Safety complete.
- Content Rating complete.
- Internal testing release created.

Jangan release public production sebelum internal testing lulus.
