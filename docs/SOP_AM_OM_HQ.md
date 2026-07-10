# SOP AM, OM dan Pentadbir HQ

Dokumen ini menerangkan skop kerja, had akses, SOP harian, dan laluan escalation untuk tiga role operasi utama dalam RKJ One.

## Prinsip Utama

| Role | Fokus utama | Had utama |
| --- | --- | --- |
| AM / Pengurus Kawasan | Cawangan dalam kawasan sendiri | Tidak urus stok HQ/kilang atau cawangan luar kawasan |
| OM / Pengurus Operasi | Operasi rentas kawasan, order, driver, dan exception | Tidak ubah role sensitif atau stok HQ/kilang tanpa kuasa HQ |
| Pentadbir HQ | Sistem, user, permission, data master, HQ stock, audit | Tidak bypass SOP operasi harian tanpa sebab jelas |

## AM / Pengurus Kawasan

### Boleh Buat

- Pantau dashboard kawasan sendiri.
- Semak prestasi cawangan dalam kawasan sendiri.
- Urus syif, kehadiran, isu staf, dan operasi harian cawangan.
- Buat dan semak stock count, adjustment, serta transfer antara kiosk dalam kawasan sendiri.
- Semak cash collection atau isu kewangan cawangan.
- Buat laporan isu maintenance.
- Reset password staf cawangan jika permission tersedia.
- Semak report prestasi cawangan sendiri.
- Ganti staf jualan jika perlu atau dalam kes kecemasan.
- Gunakan POS semasa mengganti staf jualan, dengan syarat AM mesti masukkan diri sendiri ke dalam jadual syif terlebih dahulu.

### Tidak Patut Buat

- Akses stok HQ atau kilang.
- Ubah data cawangan luar kawasan sendiri.
- Ubah role admin atau permission sensitif.
- Gunakan POS tanpa rekod jadual syif.
- Mengambil alih syif staf tanpa catatan sebab emergency atau arahan operasi.

### SOP Harian AM

1. Semak cawangan aktif, status staf, syif, stok kritikal, dan isu belum selesai.
2. Pastikan staf jualan sudah masuk syif sebelum mula menjual.
3. Semak stock movement dan cash collection cawangan.
4. Selesaikan isu biasa di kawasan sendiri seperti stok kecil, staf lewat, atau pertukaran syif.
5. Jika AM perlu mengganti staf jualan, AM mesti:
   - masukkan diri dalam jadual syif cawangan berkaitan;
   - buka atau sambung syif mengikut SOP POS;
   - rekod sebab penggantian;
   - tutup syif dan serahkan ringkasan jualan/cash selepas selesai.
6. Rekod isu maintenance dan follow up sehingga selesai.
7. Escalate kepada OM jika isu melibatkan cawangan luar kawasan, kekurangan staf berulang, kekurangan stok besar, cash discrepancy, atau operasi terganggu.

## OM / Pengurus Operasi

### Boleh Buat

- Pantau operasi semua kawasan dan cawangan.
- Semak laporan dan escalation daripada AM.
- Koordinasi isu rentas kawasan.
- Mengatur cross-branch stock transfer jika perlu.
- Membuat order operasi berdasarkan keperluan cawangan.
- Mengatur perjalanan driver untuk setiap cawangan berdasarkan hari production kilang.
- Menjadi PIC kawasan apabila mana-mana AM bercuti, tidak aktif, atau tidak dapat menjalankan tugas.
- Ambil cover operasi untuk permohonan cuti AM dalam **HR & Gaji > Cover Cuti Area Manager** sebelum HR meluluskan cuti.
- Pantau jadual operasi, delivery, maintenance, dan isu harian.
- Menyusun priority tindakan untuk AM, driver, maintenance, dan HQ.

### Tidak Patut Buat

- Ubah role admin, permission sensitif, atau data master tanpa arahan HQ.
- Buat perubahan manual pada production database.
- Urus stok masuk/keluar HQ atau kilang secara terus jika bukan role yang diberi kuasa.
- Bypass AM untuk isu kecil kecuali AM bercuti, emergency, atau isu perlu tindakan segera.

### SOP Harian OM

1. Semak semua red flag operasi daripada dashboard, report, dan laporan AM.
2. Semak jadual production kilang.
3. Buat order berdasarkan permintaan cawangan, stok semasa, dan hari production kilang.
4. Susun perjalanan driver mengikut route, keutamaan cawangan, dan masa production siap.
5. Sahkan delivery plan dengan driver atau pihak HQ Distributor.
6. Semak isu dari AM seperti stok kritikal, cash discrepancy, staf shortage, maintenance urgent, atau cawangan tidak beroperasi.
7. Jika AM bercuti, OM menjadi PIC sementara kawasan tersebut sehingga AM kembali bertugas atau pengganti rasmi ditetapkan.
8. Untuk cuti AM, OM perlu buka HR & Gaji, semak panel **Cover Cuti Area Manager**, tekan **Ambil cover**, dan tulis nota ringkas kawasan/route/cawangan yang di-cover.
9. Pastikan semua isu critical ada owner tindakan, status, dan target selesai.
10. Petang: semak isu belum selesai dan escalate kepada Pentadbir HQ atau Owner jika melibatkan risiko besar, polisi, data, kewangan, atau keselamatan sistem.

### Aliran Cuti AM

1. AM hantar permohonan cuti melalui HRMIS kendiri.
2. Sistem tandakan permohonan sebagai cuti AM yang perlukan cover OM.
3. OM semak impact kawasan dan ambil cover sementara di panel HR.
4. HR/Admin semak baki cuti, rekod staf, dan nota cover OM.
5. HR/Admin sahaja boleh lulus/tolak cuti rasmi.
6. Jika OM belum ambil cover, sistem akan sekat kelulusan HR untuk cuti AM tersebut.

## Pentadbir HQ

### Boleh Buat

- Manage users, roles, dan permissions.
- Manage cawangan, produk, item stok, dan setting sistem.
- Pantau semua report utama.
- Urus stok HQ, warehouse, dan aliran stok ke kiosk.
- Semak audit, approval, finance, HR, dan payroll mengikut permission.
- Reset akses user jika perlu.
- Kawal data master supaya sistem konsisten.
- Semak isu teknikal sebelum escalate kepada developer atau Owner.

### Tidak Patut Buat

- Padam data penting tanpa audit, backup, atau approval.
- Tukar role sensitif tanpa sebab jelas.
- Sentuh production database secara manual tanpa arahan jelas.
- Mengambil alih kerja harian AM atau OM kecuali untuk fallback, audit, atau emergency.

### SOP Harian Pentadbir HQ

1. Semak sistem, user aktif, cawangan aktif, HQ stock, dan isu pending.
2. Pastikan role, permission, dan branch assignment betul.
3. Semak order, delivery, approval, dan report HQ.
4. Urus master data jika ada produk, cawangan, staf, atau setting baharu.
5. Semak isu teknikal yang dilaporkan AM/OM.
6. Mingguan: audit permission, user inactive, report kewangan, data stok, dokumen penting, dan perubahan role.
7. Escalate kepada Owner untuk isu policy, security, payroll besar, deploy, atau risiko data.

## Laluan Escalation

| Isu | PIC pertama | Escalate kepada |
| --- | --- | --- |
| Staf tidak hadir atau lewat | AM | OM |
| AM bercuti | OM sebagai PIC sementara | Pentadbir HQ jika perlu akses sistem |
| Kelulusan cuti AM | OM cover operasi dahulu | HR/Admin lulus atau tolak rasmi |
| Staf jualan tiada semasa emergency | AM boleh ganti selepas masuk jadual syif | OM |
| Stok kiosk kawasan sendiri | AM | OM |
| Stok kritikal banyak cawangan | OM | Pentadbir HQ |
| Order ke kilang / HQ Distributor | OM | Pentadbir HQ |
| Route driver ikut hari production | OM | Pentadbir HQ |
| User, role, permission | Pentadbir HQ | Owner |
| HQ stock / warehouse | Pentadbir HQ | Owner |
| Risiko besar, security, data, deploy | Pentadbir HQ | Owner |

## Ringkasan RACI

| Proses | AM | OM | Pentadbir HQ | Owner |
| --- | --- | --- | --- | --- |
| Operasi cawangan harian | Responsible | Accountable | Informed | Informed |
| AM ganti staf jualan emergency | Responsible | Accountable | Informed | Informed |
| Jadual syif cawangan | Responsible | Consulted | Informed | Informed |
| Order ikut production kilang | Consulted | Responsible | Accountable | Informed |
| Susun driver dan route delivery | Consulted | Responsible | Accountable | Informed |
| PIC kawasan bila AM cuti | Informed | Responsible | Consulted | Informed |
| Kelulusan cuti AM | Responsible untuk mohon | Responsible untuk cover operasi | Accountable untuk approve/reject HR | Informed |
| User dan permission | Informed | Consulted | Responsible | Accountable |
| HQ stock dan master data | Informed | Consulted | Responsible | Accountable |
| Policy dan keputusan risiko tinggi | Informed | Consulted | Consulted | Accountable |
