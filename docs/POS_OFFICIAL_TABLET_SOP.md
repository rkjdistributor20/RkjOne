# SOP Tablet POS Rasmi Cawangan

## Objektif

Pastikan jualan sebenar hanya dibuat pada satu tablet milik syarikat yang didaftarkan untuk cawangan tersebut. Telefon, komputer, dan tablet lain kekal sebagai mod latihan tanpa menjejaskan jualan, tunai, atau stok sebenar.

## Tanggungjawab HQ

1. Buka `Tetapan > Tablet POS Rasmi` dan tekan `Pra-daftar Semua` sekali.
2. Sistem menyediakan satu slot berstatus `Menunggu tablet` untuk setiap cawangan aktif.
3. Pilih cawangan, model rasmi dan masukkan nombor siri, IMEI utama, tarikh pembelian serta tamat waranti.
4. Tekan `Simpan Aset Sahaja`. Status bertukar kepada `Aset direkod` tanpa kod aktivasi atau tempoh luput.
5. Simpan tablet di stor atau serahkan kepada AM mengikut rekod aset. Tiada login POS sebenar dibenarkan pada tahap ini.
6. Apabila tablet sudah berada di cawangan dan sedia digunakan, buka rekod yang sama dan tekan `Simpan & Jana Kod`.
7. Masukkan kod yang sah selama 24 jam itu pada tablet fizikal cawangan melalui halaman POS.
8. Pastikan status tablet menjadi `Aktif`, `Disahkan HQ` dan cawangan yang dipaparkan adalah betul.
9. Tarik balik akses dengan segera jika tablet hilang, rosak, dipindahkan, atau diganti.

Nombor siri dan IMEI mesti direkod oleh Pentadbir HQ atau pegawai aset. AM menyemak tablet fizikal semasa penerimaan dan melaporkan perbezaan kepada HQ sebelum aktivasi. Staf jualan tidak boleh mengubah rekod aset, menjana kod atau mengetahui PIN pentadbir.

Setiap cawangan hanya boleh mempunyai satu tablet rasmi yang aktif pada satu masa.

## Tanggungjawab AM

1. Pastikan staf jualan dimasukkan dalam jadual syif yang betul.
2. Semak dan luluskan keahlian syif sebelum staf membuat jualan sebenar.
3. Jika AM menggantikan staf semasa kecemasan, AM mesti memasukkan diri dalam jadual syif dahulu.
4. Jangan berkongsi kod pendaftaran melalui kumpulan umum atau menyimpannya dalam nota terbuka.

## Aliran Staf Jualan

1. Gunakan tablet syarikat yang ditetapkan untuk cawangan.
2. Log masuk menggunakan akaun sendiri. Jangan berkongsi kata laluan.
3. Pastikan paparan menunjukkan `POS Rasmi` dan nama cawangan yang betul.
4. Buka syif atau sertai syif yang telah diluluskan.
5. Lengkapkan semakan stok pembukaan sebelum transaksi pertama.
6. Jalankan transaksi, semak kaedah bayaran, dan keluarkan resit.
7. Tutup syif serta rekod kiraan tunai dan stok pada akhir operasi.

## Mod Kiosk Selepas Login

- Tablet rasmi terus membuka halaman POS selepas pengguna login.
- Sidebar dan modul selain POS tidak dipaparkan pada tablet rasmi.
- Nama staf bertugas, cawangan, status tablet dan butang log keluar kekal kelihatan.
- Staf biasa tidak boleh keluar daripada Mod Kiosk.
- SUPER_ADMIN, ADMIN, OM atau AM boleh membuka `Mod Pengurusan` selama 15 minit menggunakan akaun pengurusan sendiri.
- Selepas 15 minit, tablet kembali dikunci kepada POS secara automatik. Pengurus juga boleh menekan `Kembali ke POS` lebih awal.

## Mod Latihan

- Login dari peranti selain tablet rasmi akan masuk ke `Mod Latihan` secara automatik.
- Staf boleh belajar pilih produk, bina troli, dan simulasi bayaran.
- Resit latihan ditanda sebagai latihan.
- Tiada transaksi, stok, tunai, atau laporan sebenar akan diubah.

## Tablet Hilang Atau Rosak

1. HQ tarik balik akses tablet lama di `Tetapan > Tablet POS Rasmi`.
2. Tukar kata laluan akaun yang pernah digunakan jika ada risiko akses tidak sah.
3. Sediakan tablet ganti dan jana kod pendaftaran baharu.
4. Daftar tablet baharu dan buat satu transaksi ujian bernilai rendah mengikut SOP UAT.
5. Semak transaksi, stok, resit, dan laporan sebelum operasi diteruskan.

## Tetapan Peranti Disyorkan

- Gunakan hanya Samsung Galaxy Tab S10 Lite 5G 128GB atau HONOR Pad X8b LTE 256GB yang diluluskan HQ.
- Provision sebagai Android Enterprise dedicated device melalui QR selepas factory reset.
- Aktifkan PIN sekurang-kurangnya enam digit yang hanya diketahui HQ atau AM.
- Gunakan Managed Google Play; jangan login Gmail peribadi atau berkongsi satu akaun Gmail kepada staf.
- Aktifkan kemas kini automatik, Play Protect dan laporan status melalui EMM.
- Gunakan remote locate, lock dan wipe EMM sebagai kawalan kehilangan peranti.
- Gunakan Wi-Fi cawangan sebagai rangkaian utama dan SIM 5G/LTE syarikat sebagai sandaran.

Arahan penuh terdapat di `docs/android-enterprise/TABLET_PROVISIONING.md`.
