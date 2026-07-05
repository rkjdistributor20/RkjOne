# RKJ One - Production Readiness Playbook

Dokumen ini digunakan sebelum sistem dibuka untuk operasi sebenar. Fokusnya ialah memastikan RKJ One selamat, pantas, jelas untuk staf, dan mudah diaudit oleh owner.

## 1. Semakan Wajib Sebelum Deploy

Jalankan arahan ini dari folder projek:

```bash
npm run verify:readiness
npm run build
npm run verify:ui-polish
npm run verify:production
```

Jika ada kegagalan P0, jangan deploy untuk penggunaan real sehingga isu itu selesai.

## 2. UAT Ikut Peranan

Setiap role perlu diuji dengan akaun sebenar atau akaun reviewer yang diskopkan:

- Pentadbir Utama: semua syarikat, audit, tetapan, HR, payroll dan laporan.
- OM: operasi cawangan dan isu yang perlu kelulusan operasi.
- AM: cawangan kawasan sendiri, syif, stok, staf, pindahan stok dan maintenance.
- Staf POS: buka syif, kira stok, sahkan delivery, jualan, rehat, mid-shift count, tutup syif.
- Staf Kilang: jadual production, bahan mentah, order HQ dan stok kilang.
- Driver: laluan, penghantaran, bukti sampai dan isu delivery.
- HR: profil staf, cuti, kehadiran, isu staf, payroll draft dan payslip preview.
- Finance: tunai, QR manual, payment online, collection, bank-in dan laporan.
- Ejen: order stok, group rate, POS subscription dan outlet/POS sendiri.

## 3. Backup Dan Recovery

Sebelum kerja besar:

1. Jalankan `npm run bundle:migrations`.
2. Jalankan `npm run system:audit`.
3. Update `CHECKPOINT.json`.
4. Update `RESUME.md`.
5. Simpan nombor deployment production terakhir.

## 4. Payment Gateway

Payment online hanya boleh dibuka selepas semua ini lulus:

- Merchant account approved.
- API key production dimasukkan di Vercel Environment Variables.
- Webhook payment berjaya menukar status kepada paid.
- Resit keluar selepas payment sah.
- Laporan kewangan boleh asingkan Tunai, QR manual dan Online.

Semasa testing, kekalkan QR manual atau tunai.

## 5. POS Go-Live

Pilot paling selamat:

1. Uji 1 cawangan: BR011 - RNR Sg Nyiur Arah Utara.
2. Uji 1 hari penuh dengan SOP sebenar.
3. Semak laporan stok, tunai, QR manual dan masa staf.
4. Tambah 3 cawangan mengikut kawasan AM.
5. Selepas stabil, buka semua cawangan mengikut fasa.

## 6. HR Dan Payroll

Sebelum payroll real:

- Set kadar gaji ikut syarikat masing-masing.
- Semak cuti dan baki cuti pekerja local.
- Semak potongan rehat terlebih masa, OT, elaun dan advance.
- Generate payroll draft dahulu.
- Preview payslip staf.
- Hanya finalize payroll selepas HR dan Finance setuju.

## 7. Mobile Store

Untuk Play Store dan App Store:

- Tunggu D-U-N-S 9 digit jika akaun organisasi memerlukan pengesahan.
- Jalankan `npm run mobile:readiness`.
- Pastikan screenshot tidak dedahkan gaji, password, token, dokumen sensitif atau data pelanggan.
- Sediakan reviewer account dengan akses terhad.

## 8. Monitoring Harian Owner

Owner perlu semak:

- Dashboard Owner.
- Tetapan > Kesihatan Sistem.
- Stok kritikal.
- Payment tertunggak.
- Delivery gagal.
- Kelulusan sensitif.
- Audit perubahan role, gaji, delete/archive dan dokumen.

## 9. Data Quality

Setiap minggu:

- Semak staf tanpa legal entity.
- Semak cawangan tanpa AM.
- Semak produk tanpa SKU.
- Semak stok negatif.
- Semak ejen tanpa group rate.
- Semak driver tanpa laluan.
- Semak dokumen cawangan tamat tempoh.

## 10. Prinsip Owner

Pentadbir Utama boleh buat tindakan testing semasa sistem belum live. Sistem akan beri amaran SOP yang betul, tetapi tidak menghalang owner membetulkan data semasa UAT.
