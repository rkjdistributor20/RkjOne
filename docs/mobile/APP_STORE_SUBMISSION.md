# RKJ One Staff - App Store Submission Pack

iOS scaffold sudah disediakan dalam folder `ios/`. Fail ini ialah panduan kerja untuk siapkan Apple Developer, App Store Connect, TestFlight dan Custom App.

## Status Semasa

- iOS Capacitor project: `ios/`
- Bundle identifier: `com.rkjone.staff`
- App name: `RKJ One Staff`
- Version awal: `1.0`
- Privacy policy: `https://rkj.one/privacy`
- Kategori: `Business`
- Akses app: login staf dalaman sahaja
- Online payment QR: belum live; payment manual masih digunakan
- D-U-N-S: `47-331-2040` / digit-only `473312040`

## Laluan Disyorkan

Pilih laluan ini untuk RKJ One:

```text
Apple Developer Program (Organization) -> App Store Connect -> Custom App / Apple Business Manager
```

Sebab: RKJ One ialah sistem operasi dalaman staf, bukan app pelanggan awam. Custom App masih melalui review Apple, tetapi pengedaran boleh dihadkan kepada organisasi yang dibenarkan.

## Maklumat Untuk Apple Developer Enrollment

Gunakan maklumat syarikat sebenar dan konsisten dengan SSM/D&B:

- Legal entity: `RKJ DISTRIBUTOR SDN. BHD.`
- SSM: `201901043508`
- Developer name dicadangkan: `RKJ Distributor Sdn. Bhd.`
- Website/public URL: `https://rkj.one`
- Privacy policy URL: `https://rkj.one/privacy`
- Apple ID: guna akaun syarikat, aktifkan 2FA
- D-U-N-S: `473312040` (D&B email format: `47-331-2040`)

Jika mahu App Store untuk syarikat lain secara berasingan, setiap legal entity perlu semakan D-U-N-S masing-masing.

## App Store Connect - Maklumat App

Isi app baru seperti ini:

- Platform: `iOS`
- Name: `RKJ One Staff`
- Primary language: `English (U.S.)` atau `Malay` jika tersedia
- Bundle ID: `com.rkjone.staff`
- SKU: `RKJONESTAFF001`
- User Access: Restricted staff login

## Store Listing Draft

Subtitle:

```text
Internal operations for RKJ staff
```

Promotional text:

```text
RKJ One helps authorized staff manage POS, shifts, stock, branch operations, logistics, HR and internal approvals in one secure mobile workspace.
```

Description:

```text
RKJ One Staff is an internal operations app for authorized Roti Kaya Junus staff and management teams.

The app supports day-to-day branch POS workflows, shift opening and closing, stock confirmation, delivery acknowledgements, branch profiles, maintenance reporting, HR access, payroll references, logistics coordination and management approvals based on assigned roles.

Access is restricted to staff accounts created by company administrators. Public user registration is not available.
```

Keywords:

```text
RKJ One, staff operations, POS, inventory, logistics, HR
```

Support URL:

```text
https://rkj.one/privacy
```

Marketing URL:

```text
https://rkj.one
```

## App Review Notes

Masukkan nota ini di App Review:

```text
This is a restricted internal staff operations app. Public registration is not available.

Please use the provided reviewer account to test login, POS demo flow, shift summary, stock/SOP screens, branch profile, HR/payroll reference screens and logistics workflow. Online QR payment is not active for live payment; manual payment verification is used during this review build.
```

Credential reviewer boleh guna akaun yang sama seperti Google Play:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

Jangan masukkan akaun owner sebenar ke App Review.

## App Privacy Answers

Tracking:

```text
No, this app does not track users across apps or websites owned by other companies.
```

Data linked to user:

- Contact Info: name, email address, phone number
- Identifiers: internal user ID / staff profile ID
- Financial Info: internal payroll and sales records, visible only to authorized roles
- User Content: company/branch documents and operational reports where access is granted
- Usage Data: app activity required for audit logs, POS actions, approvals and shift records

Purpose:

- App Functionality
- Account Management
- Analytics for internal operations only

Data not used for third-party advertising.

## Encryption / Export Compliance

App menggunakan HTTPS/TLS standard untuk sambungan selamat. iOS `Info.plist` sudah ditambah:

```text
ITSAppUsesNonExemptEncryption = false
```

Jika App Store Connect tanya tentang encryption, jawab bahawa app tidak menggunakan non-exempt/proprietary encryption. Ia hanya menggunakan standard secure transport.

## Build iOS Di Mac

Di Mac/Xcode nanti:

```bash
git pull
npm install
npm run build
npm run mobile:sync:ios
npm run mobile:ios
```

Dalam Xcode:

1. Pilih project `App`.
2. Set `Team` kepada Apple Developer organization syarikat.
3. Pastikan Bundle Identifier `com.rkjone.staff`.
4. Signing & Capabilities: guna automatic signing jika sesuai.
5. Pilih generic iOS device.
6. `Product > Archive`.
7. `Distribute App > App Store Connect`.
8. Upload build.
9. Uji melalui TestFlight dahulu.
10. Submit sebagai Custom App/internal distribution.

## Bahan Store

- Screenshots: `outputs/mobile-release/store-assets/01-secure-login.png` hingga `05-logistics-agent.png`
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- Privacy explanation: `docs/mobile/DATA_SAFETY.md`
- Release checklist: `docs/mobile/RELEASE_CHECKLIST.md`

## Belum Boleh Disiapkan Dari Windows / Tanpa Akaun Apple

- Apple Developer enrollment final memerlukan akses Apple ID syarikat dan pembayaran Apple Developer Program
- Xcode archive
- Apple code signing
- Upload build ke App Store Connect
- TestFlight / App Review submission

Semua ini memerlukan akses akaun Apple Developer Organization dan Mac/Xcode atau cloud Mac.
