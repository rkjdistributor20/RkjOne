# RKJ One Staff - Store Submission Handoff

Dokumen ini ialah rujukan terakhir untuk submit RKJ One Staff ke Google Play Console dan Apple Developer/App Store Connect.

## Status Teknikal

- Mobile readiness audit: mesti dijalankan semula terhadap AAB `1.8.7` selepas build akhir
- Production URL: `https://rkj.one`
- Privacy policy: `https://rkj.one/privacy`
- Support: `https://rkj.one/support`
- Account deletion: `https://rkj.one/delete-account`
- Terms of use: `https://rkj.one/terms`
- App name: `RKJ One Staff`
- Package / bundle identifier: `com.rkjone.staff`
- Current Play version: `1.8.4` (`22`), rollout `100%`
- Candidate version: `1.8.7` (`25`), menunggu gate production dan BR001
- App access: restricted internal staff login
- Google Play Production: available, rollout `100%` (verified 2026-11-24)

## Legal Entity

Gunakan maklumat ini untuk akaun Organization:

```text
Legal entity: RKJ DISTRIBUTOR SDN. BHD.
SSM: 201901043508
D-U-N-S: 47-331-2040
D-U-N-S digit-only: 473312040
Website: https://rkj.one
Privacy policy: https://rkj.one/privacy
Public support email: developer@rkj.one
Account owner email: rkjdistributor20@gmail.com
```

## Google Play Console

Artefak production semasa yang telah diterbitkan:

```text
RKJ One Staff 1.8.4 (version code 22)
```

Calon `1.8.7` menggunakan version code `25` dan laluan `artifacts/android/rkj-one-staff-1.8.7-release.aab`. Jangan submit calon lama `1.8.6`; perubahan native 1.8.7 diperlukan untuk version gate, pemulihan callback dan telemetri armada.

Store listing:

```text
docs/mobile/PLAY_STORE_SUBMISSION.md
```

Step-by-step:

```text
docs/mobile/PLAY_CONSOLE_STEP_BY_STEP.md
```

Data Safety:

```text
docs/mobile/DATA_SAFETY.md
```

Graphic dan screenshots:

```text
outputs/mobile-release/store-assets/play-store-feature-graphic.png
outputs/mobile-release/store-assets/01-secure-login.png
outputs/mobile-release/store-assets/02-pos-counter.png
outputs/mobile-release/store-assets/03-branch-operations.png
outputs/mobile-release/store-assets/04-hr-payroll.png
outputs/mobile-release/store-assets/05-logistics-agent.png
```

App access:

```text
All or some functionality is restricted.
```

Reviewer instructions:

```text
This is a restricted internal staff operations app. Please use the provided test account to review the login flow, POS demo screens, branch profile, HR/payroll demo, logistics workflow and privacy policy. No public customer registration is available.
```

Reviewer credential disimpan secara tempatan dan tidak dicommit:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

## Apple Developer / App Store Connect

Enrollment:

```text
Type: Organization
Legal entity: RKJ DISTRIBUTOR SDN. BHD.
D-U-N-S: 473312040
Website: https://rkj.one
```

App Store Connect app:

```text
Platform: iOS
Name: RKJ One Staff
Bundle ID: com.rkjone.staff
SKU: RKJONESTAFF001
Category: Business
Distribution: Custom App / internal organization distribution
```

Submission copy:

```text
docs/mobile/APP_STORE_SUBMISSION.md
```

Step-by-step:

```text
docs/mobile/APP_STORE_CONNECT_STEP_BY_STEP.md
```

Build iOS di Mac/Xcode:

```bash
npm install
npm run build
npm run mobile:sync:ios
npm run mobile:ios
```

Kemudian dalam Xcode:

1. Set signing team kepada Apple Developer Organization.
2. Archive.
3. Upload ke App Store Connect.
4. Uji TestFlight.
5. Submit sebagai Custom App/internal distribution.

## Final Gate

Sebelum production release di store:

- Pastikan reviewer credential masih boleh login.
- Pastikan screenshots tidak dedah gaji, password, token, IC, nombor bank penuh, atau dokumen sensitif.
- Pastikan payment online live hanya dibuka pada allowlist cawangan selepas Fiuu/provider, worker recovery dan heartbeat production lulus.
- Jalankan BR001 sebagai canary; perluaskan production mengikut kumpulan dan hentikan kumpulan seterusnya jika ada masalah kritikal.
