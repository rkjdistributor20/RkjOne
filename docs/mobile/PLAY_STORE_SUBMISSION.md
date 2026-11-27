# RKJ One Staff - Play Store Submission Pack

Disahkan melalui Play Console pada 27 November 2026: Google Play Production menjalankan `1.8.7` (version code `25`) pada rollout 100%. Perubahan matriks AM susulan hanya memerlukan deployment web/SQL; jangan muat naik semula AAB ini.

## Fail Utama

- Current production release: `RKJ One Staff 1.8.7`
- Package name: `com.rkjone.staff`
- Version code: `25`
- Version name: `1.8.7`
- Rollout: `100%` (verified 2026-11-27; not an installed-device count)
- Published AAB: `artifacts/android/rkj-one-staff-1.8.7-release.aab`
- Privacy policy: `https://rkj.one/privacy`
- Support: `https://rkj.one/support`
- Account deletion: `https://rkj.one/delete-account`
- Feature graphic: `outputs/mobile-release/store-assets/play-store-feature-graphic.png`
- Phone screenshots: `outputs/mobile-release/store-assets/01-secure-login.png` hingga `05-logistics-agent.png`

## Store Listing

App name:

```text
RKJ One Staff
```

Short description:

```text
Aplikasi operasi dalaman RKJ untuk POS, stok, HR, logistik dan laporan.
```

Full description:

```text
RKJ One Staff ialah aplikasi operasi dalaman untuk pasukan Roti Kaya Junus.

Aplikasi ini membantu staf dan pengurusan menjalankan kerja harian seperti POS kiosk, kiraan stok syif, pengesahan penghantaran, profil cawangan, HR dan gaji, logistik, agent, laporan dan kelulusan operasi.

Akses aplikasi adalah terhad kepada pengguna yang didaftarkan oleh syarikat. Setiap pengguna hanya melihat fungsi yang berkaitan dengan syarikat, cawangan dan peranan masing-masing.

Fungsi utama:
- POS kiosk dan rekod syif
- Kiraan stok permulaan, pertengahan dan penutup syif
- Pengesahan penghantaran driver
- Profil cawangan dan dokumen rujukan
- HR, gaji dan akses staf
- Logistik, driver, route dan agent
- Laporan operasi dan kelulusan pengurusan

RKJ One Staff dibina untuk kegunaan dalaman sahaja dan bukan aplikasi pengguna awam.
```

Category:

```text
Business
```

Contact email:

```text
rkjdistributor20@gmail.com
```

## App Access Untuk Reviewer

Pilih:

```text
All or some functionality is restricted
```

Masukkan arahan reviewer:

```text
This is a restricted internal staff operations app. Please use the provided test account to review the login flow, POS demo screens, branch profile, HR/payroll demo, logistics workflow and privacy policy. No public customer registration is available.
```

Akaun reviewer khas telah disediakan sebagai staf kiosk terhad untuk BR011 sahaja. Jangan guna akaun owner sebenar.

Credential reviewer disimpan secara tempatan di:

```text
outputs/mobile-release/play-store-reviewer-account.txt
```

Jika perlu jana/kemas kini semula akaun reviewer:

```bash
npm run mobile:reviewer
```

Masukkan email dan password daripada fail tempatan tersebut di bahagian App Access Play Console.

## Data Safety Ringkas

Rujuk `docs/mobile/DATA_SAFETY.md`.

## Checklist Submit

- Guna D-U-N-S `473312040` untuk akaun Organization Google Play Console jika diminta.
- Untuk keluaran Android baharu sahaja, upload AAB selepas hash, sijil signing dan version code disahkan. AAB 1.8.7 sudah diterbitkan.
- Upload 5 phone screenshots.
- Upload feature graphic.
- Masukkan privacy policy URL.
- Isi Data Safety.
- Pilih app access restricted dan beri test account.
- Pastikan Content Rating diisi sebagai aplikasi business/internal operations.
- Kekalkan allowlist Fiuu VT dan cashier-release pada BR001 dahulu; perluaskan berperingkat hanya selepas bukti tablet fizikal lulus.
