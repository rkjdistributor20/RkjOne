# RKJ One - Sistem HR Syarikat Legal

Dokumen ini menerangkan cara RKJ One mengurus sumber manusia untuk syarikat-syarikat legal di bawah kumpulan Roti Kaya Junus.

## Objektif

Sistem HR ini memisahkan rekod pekerja mengikut majikan legal masing-masing, sambil mengekalkan pemantauan kumpulan melalui satu dashboard Pentadbir Utama.

## Syarikat Legal

1. **Roti Kaya Junus**
   - Fokus: staf jualan kiosk dan operasi 36 cawangan.
   - Rekod utama: staf cawangan, portal staf, profil HR, jadual syif, payroll operasi.

2. **RKJ Distributor Sdn Bhd**
   - Fokus: pengedaran, fleet, HQ Distributor, Area Manager dan Maintenance.
   - Rekod utama: pengurus kawasan, driver, staf logistik, Manager Maintenance.

3. **Roti Kaya Junus Manufacturing Sdn Bhd**
   - Fokus: kilang, pengeluaran roti dan gudang kilang.
   - Rekod utama: staf kilang, pengurusan produksi, profil HR dan payroll kilang.

## Akses Pengguna

| Role | Akses HR |
| --- | --- |
| SUPER_ADMIN | Lihat semua syarikat, semua staf dan semua pengguna |
| ADMIN | Lihat dan urus rekod HR syarikat |
| HR | Lihat dan lengkapkan rekod HR |
| AREA_MANAGER | Urus staf dalam skop cawangan/kawasan melalui Tetapan Staff |
| STAFF | Lihat profil sendiri sahaja |

## Modul Dalam Aplikasi

- **Dashboard Pentadbir Utama**: paparan ringkas jumlah HR mengikut syarikat legal.
- **/hr - HR Syarikat**: paparan penuh syarikat, staf, pengguna, portal, status profil HR dan compliance.
- **/settings - Staff**: tambah, edit, reset password dan kemaskini staf operasi.
- **/profile - Profil Saya**: staf melengkapkan maklumat HR sendiri.

## Standard Rekod HR Profesional

Setiap pekerja perlu mempunyai rekod berikut:

- Nama penuh seperti dokumen rasmi.
- Kod staf atau employee code.
- Syarikat legal / majikan sebenar.
- Role atau jawatan sistem.
- Cawangan atau lokasi kerja jika berkaitan.
- Jenis pekerja: tempatan atau asing.
- Email portal login.
- Status aktif / inactive / suspended.
- Maklumat profil HR lengkap.
- Rekod payroll asas: mingguan atau bulanan.
- Maklumat emergency contact dan dokumen pengenalan melalui profil HR.

## Aliran Kerja HR

1. HR atau Pentadbir tambah staf di **Tetapan > Staff**.
2. Sistem cipta akaun portal staf jika diperlukan.
3. Staf log masuk dan lengkapkan **Profil HR**.
4. Pentadbir semak `/hr` untuk pastikan semua staf berada bawah syarikat legal yang betul.
5. Jika staf berpindah syarikat, HR kemaskini legal entity dalam rekod staff.
6. Payroll dan operasi menggunakan rekod staff yang sama untuk elak data berpecah.

## Checklist Go-Live HR

- Semua syarikat legal aktif.
- Semua staf mempunyai legal entity.
- Semua staf operasi mempunyai cawangan atau skop kerja yang jelas.
- Staff portal tersedia untuk staf yang perlu login.
- Profil HR lengkap untuk semua staf aktif.
- Role pengurusan tidak bercampur dengan staf cawangan.
- Staff RKJ Distributor dan RKJ Manufacturing telah dipisahkan daripada Roti Kaya Junus.
- Manager Maintenance Muhammad Hanif berada bawah RKJ Distributor.

## Prinsip Audit

- Jangan padam staf yang pernah ada transaksi payroll, syif atau POS tanpa semakan.
- Gunakan status `INACTIVE` atau `SUSPENDED` untuk pekerja lama jika rekod sejarah perlu disimpan.
- Pastikan setiap staff code unik dan konsisten dengan dokumen syarikat.
- Semakan HR bulanan dibuat melalui `/hr` dan laporan payroll.

## Status Production

Modul HR Syarikat sudah live di:

https://rkj-one.vercel.app/hr
