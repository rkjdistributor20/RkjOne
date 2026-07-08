# SOP HRMIS 3 Syarikat

Dokumen ini menetapkan cara HRMIS RKJ One mengurus pekerja, cuti, gaji, dokumen dan akses untuk tiga syarikat legal di bawah kumpulan Roti Kaya Junus.

## Prinsip Utama

- RKJ One ialah satu sistem kumpulan, tetapi rekod HR mesti ikut majikan legal sebenar.
- Setiap staf mesti ada satu rekod `legal_entity_id` yang betul sebelum payroll, cuti, akses dan dokumen diproses.
- HR boleh melihat paparan kumpulan, tetapi tindakan harian perlu ditapis mengikut syarikat aktif.
- Permohonan staf daripada HRMIS kendiri perlu ikut legal entity, cawangan dan rekod staf yang dipautkan.
- Pemilik kumpulan boleh mempunyai rekod merentas tiga syarikat, tetapi staf operasi biasa tidak boleh dicampur tanpa rekod transfer.

## Syarikat Dalam Scope

| Kod | Syarikat legal | Scope HRMIS |
| --- | --- | --- |
| RKJ | Roti Kaya Junus | Staf jualan kiosk, operasi 36 cawangan, POS, syif, cuti cawangan dan payroll staf jualan |
| RKJ_DIST | RKJ Distributor Sdn Bhd | HQ Distributor, Area Manager, driver, fleet, maintenance, ejen, logistik dan payroll distributor |
| RKJ_MFG | Roti Kaya Junus Manufacturing Sdn Bhd | Kilang, produksi, gudang kilang, pekerja manufacturing dan payroll kilang |

## Role Dan Tanggungjawab HRMIS

| Role | Tanggungjawab 3 syarikat |
| --- | --- |
| Owner / Super Admin | Pantau semua syarikat, polisi, risiko, akses sensitif dan keputusan akhir |
| Admin / Pentadbir HQ | Kawal user, role, legal entity, master data, audit dan dokumen kumpulan |
| HR | Proses profil staf, cuti, dokumen, payroll support dan permohonan mengikut syarikat aktif |
| OM | Semak isu operasi rentas kawasan, order, driver, exception dan jadi PIC bila AM cuti |
| AM | Urus staf cawangan dalam kawasan, jadual, kehadiran, cuti emergency dan POS ganti staf jika telah masuk syif |
| Finance | Semak isu gaji, claim, elaun, potongan dan pembayaran mengikut syarikat legal |
| Staff | Lengkap profil sendiri, hantar permohonan HR, semak cuti, jadual, kehadiran dan gaji sendiri |

## Flow Rekod Pekerja Baru

1. HR atau Pentadbir HQ tambah staf dalam **Settings > Staff**.
2. Pilih syarikat legal yang betul: RKJ, RKJ_DIST atau RKJ_MFG.
3. Tetapkan cawangan, kawasan atau lokasi kerja jika berkaitan.
4. Tetapkan worker type: local atau foreign.
5. Cipta atau pautkan akaun portal jika staf perlu login.
6. Staf login dan lengkapkan profil HR.
7. HR semak dashboard `/hr` untuk pastikan staf muncul dalam syarikat yang betul.

## Flow Permohonan HR Staf

1. Staf buka **HR & Gaji**.
2. Sistem guna rekod staf aktif sebagai majikan legal utama.
3. Staf pilih urusan: cuti, kehadiran, gaji, dokumen, claim, transfer atau bantuan HR.
4. Permohonan masuk ke kaunter HR mengikut legal entity staf.
5. HR proses dalam tab syarikat aktif supaya data tidak bercampur.
6. Jika isu operasi cawangan, HR boleh rujuk AM atau OM.
7. Jika isu gaji atau claim, HR rujuk Finance.
8. Jika isu policy, role sensitif atau risiko besar, escalate kepada Owner.

## Flow Cuti 3 Syarikat

1. Cuti hanya dikira pada rekod staf tempatan yang dipautkan kepada syarikat legal.
2. Sistem tahan cuti sebagai `pending` semasa permohonan dihantar.
3. HR semak baki cuti, cawangan, jadual dan kesan operasi.
4. Untuk staf RKJ cawangan, AM perlu disemak jika cuti menyebabkan kekurangan staf.
5. Untuk isu rentas kawasan atau AM cuti, OM menjadi PIC sementara.
6. Jika lulus, baki cuti rasmi ditolak.
7. Jika ditolak atau dibatalkan sebelum lulus, pending leave dilepaskan semula.

## Transfer Antara Syarikat

Transfer hanya boleh dibuat oleh HR, Admin atau role yang diberi kuasa.

1. Semak rekod lama: syif, POS, payroll, cuti, dokumen dan akses.
2. Jangan padam rekod lama jika ada transaksi sejarah.
3. Tukar legal entity melalui fungsi pindah syarikat.
4. Tetapkan lokasi kerja dan role baru.
5. Semak semula akses menu supaya staf hanya nampak modul yang sesuai.
6. Catat sebab transfer dalam nota HR atau dokumen sokongan.

## Akses Dan Data Boundary

- Staf hanya boleh melihat profil, permohonan, cuti, jadual, kehadiran dan gaji sendiri.
- HR/Admin memproses rekod ikut syarikat aktif dalam dashboard HR.
- Super Admin/Admin boleh melihat semua syarikat untuk audit kumpulan.
- Role syarikat RKJ_MFG tidak patut diberi akses operasi retail kecuali ada arahan rasmi.
- Role syarikat RKJ_DIST tidak patut mengubah data RKJ/RKJ_MFG kecuali sebagai OM/Admin/HQ yang diberi kuasa.
- Service role key, database key dan secret tidak boleh dimasukkan ke repo.

## Checklist Mingguan HR

- Semak staf tanpa legal entity.
- Semak staf aktif tanpa cawangan atau lokasi kerja.
- Semak portal staf yang belum aktif.
- Semak profil HR belum lengkap.
- Semak cuti pending melebihi SLA.
- Semak transfer staf yang belum lengkap.
- Semak role sensitif dan akses syarikat.
- Semak dokumen penting yang belum lengkap atau hampir tamat.

## Definition Of Done HRMIS 3 Syarikat

- Semua staf aktif ada legal entity.
- Semua permohonan HR staf mempunyai syarikat dan cawangan jika berkaitan.
- HR boleh tapis dan proses staf mengikut syarikat aktif.
- Staff dashboard memaparkan majikan legal sebenar.
- Payroll, cuti dan dokumen tidak bercampur antara RKJ, RKJ_DIST dan RKJ_MFG.
- Isu operation escalation jelas antara AM, OM, Pentadbir HQ dan Owner.
