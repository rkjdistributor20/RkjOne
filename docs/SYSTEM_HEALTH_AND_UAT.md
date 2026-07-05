# RKJ One - Kawalan Kesihatan Sistem & UAT

Dokumen ini menjadi rujukan owner dan pentadbir utama sebelum sistem digunakan secara real di cawangan, kilang, distributor dan ejen.

## 1. Pemeriksaan Harian Owner

1. Log masuk sebagai Pentadbir Utama.
2. Buka `Tetapan > Kesihatan Sistem`.
3. Pastikan status kritikal berikut `OK`:
   - Security headers aktif.
   - Fail rahsia tidak dijejak git.
   - Profil syarikat berasingan.
   - Health endpoint aktif.
   - Checkpoint dan migrasi database tersedia.
4. Jika ada status `Perlu Baiki`, jangan deploy production sehingga isu itu disemak.

## 2. UAT POS Cawangan

Sebelum staf test POS di cawangan:

1. QR online/payment gateway kekal manual sehingga merchant approved dan webhook diuji.
2. Staf wajib buka syif dan buat kiraan stok permulaan.
3. Jika ada penghantaran dibuat ketika kiosk tutup, staf pertama wajib sahkan penerimaan stok dahulu.
4. Jualan hanya dibuka selepas kiraan stok dan penerimaan stok disahkan.
5. Pertengahan syif dan tutup syif wajib rekod baki stok mengikut production date.
6. Jika jumlah staf berbeza daripada anggaran AI, AM/OM perlu sahkan sebelum stok rasmi berubah.

## 3. UAT Akses Mengikut Syarikat

Semak setiap kategori pengguna:

- Staf RKJ Manufacturing hanya nampak kerja kilang, bahan mentah, produksi dan stok kilang.
- Staf RKJ Distributor hanya nampak HQ Distributor, logistik, driver, ejen dan penghantaran.
- Staf Roti Kaya Junus hanya nampak kiosk, POS, inventori cawangan, syif dan maintenance cawangan.
- Ejen hanya nampak portal ejen dan outlet/POS yang dipautkan.
- Pentadbir Utama boleh melihat semua untuk tujuan test, audit dan pembetulan.

## 4. Backup & Recovery

Sebelum kerja besar:

1. Jalankan `npm run system:audit`.
2. Jalankan `npm run verify:readiness`.
3. Jalankan `npm run bundle:migrations`.
4. Pastikan `CHECKPOINT.json` dan `RESUME.md` dikemas kini.
5. Simpan nota deploy production terakhir.

## 5. Payment Gateway

Jangan aktifkan pembayaran online sebenar sehingga:

- Akaun merchant Billplz/Fiuu/Razer approved.
- API key dan webhook production sudah dimasukkan dalam Vercel environment.
- Webhook callback berjaya menukar status bayaran kepada paid.
- Resit POS keluar selepas bayaran sah.
- Laporan kewangan membezakan tunai, QR manual dan online payment.

## 6. Mobile App

Sebelum submit Play Store/App Store:

1. Jalankan `npm run mobile:readiness`.
2. Pastikan D-U-N-S 9 digit diterima untuk akaun organisasi.
3. Upload AAB/IPA hanya selepas build production terkini stabil.
4. Reviewer account mesti disediakan tanpa akses rahsia syarikat.
5. Screenshot store listing mesti tidak dedahkan data sebenar pelanggan, staf, gaji, token atau credential.
