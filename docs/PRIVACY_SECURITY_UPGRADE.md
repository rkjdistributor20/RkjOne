# RKJ One Privacy & Security Upgrade

Tarikh semakan: 2026-06-28

## Status Semasa

RKJ One kini dinaik taraf daripada tahap go-live dalaman kepada tahap operasi yang lebih selamat untuk data staf, ejen, cawangan, stok, POS dan pembayaran.

## Upgrade Yang Telah Dibuat

1. Header keselamatan production ditambah:
   - `Content-Security-Policy`
   - `Strict-Transport-Security`
   - `X-Frame-Options`
   - `X-Content-Type-Options`
   - `Referrer-Policy`
   - `Permissions-Policy`

2. Cache data sensitif ditutup untuk laluan utama:
   - `/api/*`
   - `/settings/*`
   - `/hr/*`
   - `/finance/*`
   - `/reports/*`
   - `/inventory/*`

3. Rate limit ditambah pada API sensitif:
   - Tukar password
   - Cipta/kemas kini/padam staf
   - Reset password staf
   - Cipta/kemas kini/padam ejen
   - POS QR payment
   - Webhook pembayaran POS dan ejen

4. Password tetap dibuang:
   - Tiada lagi default tetap `[REDACTED_TEMP_PASSWORD]`.
   - Tiada lagi default tetap `[REDACTED_TEMP_PASSWORD]`.
   - Password sementara dijana secara rawak.
   - Password sementara hanya dipaparkan sekali kepada pentadbir.

5. Password staf portal tidak lagi disimpan dalam bentuk sebenar:
   - Rekod lama ditanda sebagai `[HIDDEN_AFTER_ISSUE]`.
   - Jika perlu password baharu, pentadbir perlu guna fungsi reset password.

## Proses Syarikat Yang Perlu Dilengkapkan

1. Tetapkan seorang Data Protection Officer atau PIC privasi.
2. Sediakan notis privasi kepada staf, ejen dan pelanggan.
3. Tetapkan tempoh simpanan data:
   - Staf aktif: sepanjang tempoh bekerja.
   - Staf berhenti: ikut keperluan HR dan undang-undang.
   - Rekod POS dan pembayaran: ikut keperluan audit, cukai dan bank.
4. Buat semakan akses setiap bulan:
   - Staf yang berhenti mesti dinyahaktif.
   - Ejen tidak aktif mesti diarkib.
   - Role yang salah mesti dibetulkan.
5. Aktifkan 2FA untuk semua akaun pentadbir.
6. Simpan API key payment gateway hanya dalam environment variable Vercel/Supabase.
7. Jangan kongsi service role key, webhook secret atau merchant key melalui WhatsApp/chat biasa.

## Risiko Yang Masih Perlu Dipantau

1. Supabase service role masih digunakan untuk operasi server yang memerlukan akses penuh.
   Kawalan dibuat melalui API server, tetapi secret mesti dijaga ketat.

2. `profile-avatars` ialah bucket public.
   Jangan upload dokumen IC, payslip atau dokumen syarikat ke bucket avatar.

3. Dependency audit masih perlu dipantau.
   Jalankan `npm audit --omit=dev` sebelum release besar.

4. Sistem perlu audit log penuh untuk semua perubahan penting:
   - Role pengguna
   - Staf pindah cawangan
   - Stok manual adjustment
   - Dokumen syarikat
   - Payment verification

5. Developer scripts lama yang digunakan untuk seed/UAT perlu disemak sebelum digunakan semula.
   Jangan jalankan script yang menetapkan password pukal tanpa `GO_LIVE_PASSWORD` atau generator password baharu.

## Cadangan Upgrade Seterusnya

1. Tambah audit log immutable untuk semua tindakan admin.
2. Tambah 2FA wajib untuk `SUPER_ADMIN`, `ADMIN`, `OPERATION_MANAGER` dan kewangan.
3. Tambah session timeout untuk dashboard sensitif.
4. Tambah export laporan akses bulanan.
5. Pisahkan bucket storage:
   - `company-documents`
   - `hr-documents`
   - `payment-proofs`
   - `profile-avatars`
6. Buat RLS audit untuk semua table baharu selepas migration 00092.
