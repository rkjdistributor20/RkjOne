# UAT HRMIS 3 Syarikat

Dokumen ini ialah checklist manual untuk mengesahkan HRMIS RKJ One berfungsi merentas tiga syarikat legal tanpa data bercampur.

## Scope

| Kod | Syarikat | Fokus ujian |
| --- | --- | --- |
| RKJ | Roti Kaya Junus | Staf jualan kiosk, syif, POS, cuti cawangan dan payroll staf jualan |
| RKJ_DIST | RKJ Distributor Sdn Bhd | HQ Distributor, AM, driver, fleet, maintenance, ejen dan payroll distributor |
| RKJ_MFG | Roti Kaya Junus Manufacturing Sdn Bhd | Kilang, produksi, gudang kilang dan payroll manufacturing |

## Akaun Ujian

Gunakan akaun sebenar UAT yang disediakan oleh owner/admin. Jangan tulis password dalam dokumen, chat, screenshot atau tiket.

| Role | Syarikat / scope | Tujuan |
| --- | --- | --- |
| Owner / Super Admin | Semua syarikat | Audit kumpulan dan semak semua tab HR |
| Admin HQ | Semua syarikat | User, legal entity, staff, transfer dan dokumen |
| HR | Syarikat yang dibenarkan | Proses profil, cuti, permohonan dan payroll support |
| AM | RKJ_DIST sebagai majikan, RKJ sebagai operasi | Semak isu staf cawangan dan POS emergency selepas masuk jadual |
| OM | Distributor / operasi rentas kawasan | PIC sementara bila AM cuti, order dan route driver |
| Staff RKJ | Roti Kaya Junus | HRMIS kendiri, cuti, jadual, kehadiran, payslip sendiri |
| Staff RKJ_MFG | RKJ Manufacturing | HRMIS kilang dan akses manufacturing sahaja |
| Driver / HQ Distributor | RKJ Distributor | HRMIS distributor dan akses logistik sahaja |

## UAT-01 Login Dan Paparan Role

| Step | Expected result |
| --- | --- |
| Login setiap role UAT | Login berjaya tanpa auth loop |
| Buka dashboard utama | Menu yang dipaparkan ikut role dan scope |
| Tukar bahasa jika perlu | Label HRMIS penting kekal jelas dalam BM/EN |
| Logout dan login semula | Session stabil dan tidak masuk akaun lain |

## UAT-02 HR Dashboard 3 Syarikat

| Step | Expected result |
| --- | --- |
| Login sebagai Owner/Admin/HR | Menu **HR & Gaji** boleh dibuka |
| Semak badge jumlah syarikat | Papar tiga legal entity jika user ada akses semua |
| Pilih RKJ | Staf jualan/cawangan dipaparkan, ejen tidak bercampur |
| Pilih RKJ_DIST | HQ Distributor, AM, driver, maintenance dan ejen dipaparkan mengikut seksyen |
| Pilih RKJ_MFG | Staf kilang/production dipaparkan |
| Pilih rekod belum tetap jika ada | Sistem nyatakan perlu semak syarikat |
| Semak label majikan legal | Nama syarikat, kod dan scope operasi jelas |

## UAT-03 Staff HRMIS Kendiri

| Step | Expected result |
| --- | --- |
| Login sebagai staf RKJ | Staf nampak rekod sendiri sahaja |
| Buka **HR & Gaji** | Papar majikan legal, staff code, profil, cuti, jadual, kehadiran dan gaji |
| Semak tab **Rekod Saya** | Rekod majikan, cawangan, area dan bank payroll dipaparkan |
| Hantar permohonan **Kemaskini profil HR** | Permohonan masuk dengan legal entity dan branch staf |
| Hantar permohonan **Dokumen / surat HR** | Status bermula sebagai **Dihantar** |
| Batalkan permohonan sebelum lulus | Status berubah kepada **Dibatalkan** |
| Cuba lihat data staf lain | Tidak ada akses kepada rekod staf lain |

## UAT-04 Cuti Dan Pending Leave

| Step | Expected result |
| --- | --- |
| Login staf local dengan baki cuti | Baki cuti rasmi dipaparkan |
| Pilih cuti tahunan dan tarikh sah | Sistem kira jumlah hari dimohon |
| Hantar cuti dalam baki | Status **Dihantar** dan pending leave bertambah |
| Hantar cuti melebihi baki | Sistem halang dengan mesej baki tidak cukup |
| HR buka tab syarikat staf | Permohonan muncul dalam syarikat yang betul |
| HR ambil, lulus, tolak atau selesai | Status berubah dan audit kekal jelas |
| Staf batalkan sebelum lulus | Pending leave dilepaskan semula |

## UAT-05 Transfer Antara Syarikat

| Step | Expected result |
| --- | --- |
| HR pilih staf aktif | Dialog pindah syarikat boleh dibuka |
| Tukar dari RKJ ke RKJ_DIST atau RKJ_MFG | Staf berpindah ke tab syarikat destinasi selepas refresh |
| Semak role dan cawangan selepas transfer | Role, lokasi dan akses masih logik |
| Semak permohonan lama | Rekod lama tidak hilang |
| Semak payroll/cuti | HR perlu audit manual sebelum payroll final jika transfer dibuat dalam bulan sama |

## UAT-06 AM Emergency POS Dan HR

| Step | Expected result |
| --- | --- |
| Login sebagai AM | AM nampak scope kawasan dan menu yang dibenarkan |
| AM cuba buka POS tanpa jadual syif | Sistem halang penggunaan POS |
| Masukkan AM dalam jadual syif cawangan | AM boleh buka POS untuk emergency |
| Buat transaksi POS | Transaksi berjaya dan mode ganti staf jelas |
| Semak HRMIS AM | Majikan legal AM ialah RKJ Distributor, operasi cawangan ialah RKJ |

## UAT-07 OM Dan Fallback AM Cuti

| Step | Expected result |
| --- | --- |
| Login sebagai OM | OM boleh semak operasi rentas kawasan yang dibenarkan |
| Simulasi AM cuti | OM menjadi PIC sementara dalam SOP, bukan mengambil alih semua permission sensitif |
| Semak order/driver route | Order dan route ikut hari production kilang |
| Escalate isu HR/operation | Laluan AM -> OM -> Pentadbir HQ -> Owner jelas |

## UAT-08 Negative Access Test

| Test | Expected result |
| --- | --- |
| Staf RKJ cuba akses HR staf RKJ_DIST | Ditolak atau tidak dipaparkan |
| Staf RKJ_MFG cuba akses POS retail | Ditolak kecuali role memang diberi kuasa |
| Ejen cuba akses HR internal | Ditolak |
| AM cuba guna POS tanpa jadual | Ditolak |
| User tanpa legal entity cuba proses payroll | Perlu semakan HR/admin dahulu |
| Request dengan branch/syarikat luar organisasi | Ditolak oleh API/RLS jika laluan itu wujud |

## UAT-09 Data Quality Checklist

- Semua staf aktif ada legal entity.
- Semua staf aktif ada worker type.
- Semua staf cawangan ada branch atau region.
- Semua AM berada bawah RKJ Distributor.
- Semua staf jualan kiosk berada bawah Roti Kaya Junus.
- Semua staf kilang berada bawah RKJ Manufacturing.
- Semua driver/HQ Distributor berada bawah RKJ Distributor.
- Semua permohonan HR aktif ada requester, status, legal entity dan branch jika berkaitan.
- Tiada password, token, service role key atau data sensitif dalam screenshot UAT.

## Severity

| Severity | Maksud | Tindakan |
| --- | --- | --- |
| Critical | Data staf/gaji syarikat lain bocor, payroll salah, login down | Stop rollout dan fix segera |
| High | HR/cuti/POS emergency role utama tidak boleh digunakan | Fix sebelum UAT diteruskan |
| Medium | Ada workaround tetapi menyusahkan operasi | Jadualkan patch terdekat |
| Low | Copy, label atau polish minor | Batch dalam cleanup |

## Done Criteria

- Semua role utama berjaya login.
- HR boleh tapis RKJ, RKJ_DIST dan RKJ_MFG.
- Staf hanya nampak data sendiri.
- Permohonan cuti dan HR masuk ke syarikat yang betul.
- AM emergency POS hanya boleh digunakan selepas AM ada jadual syif.
- OM fallback untuk AM cuti jelas dalam SOP.
- Tiada Critical atau High bug terbuka.
