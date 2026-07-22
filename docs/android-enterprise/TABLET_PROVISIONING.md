# Provisioning Tablet POS Android Enterprise

## Model rasmi syarikat

1. Samsung Galaxy Tab S10 Lite 5G 128GB.
2. HONOR Pad X8b LTE 256GB.

Nama model yang dilaporkan oleh Android kadangkala menggunakan kod perkakasan. Dashboard menerima padanan jenama sebagai amaran lembut, tetapi HQ mesti menyemak kotak, nombor siri, IMEI dan kapasiti storan sebelum menyerahkan tablet kepada cawangan.

## Reka bentuk yang digunakan

Terdapat dua kod berbeza dan kedua-duanya tidak boleh ditukar ganti:

1. **QR Android Enterprise** disediakan melalui EMM. Ia digunakan sekali selepas factory reset untuk menjadikan tablet `fully managed/device owner`, memasang RKJ One dan mengenakan polisi kiosk.
2. **Kod aktivasi RKJ One** dijana di `Tetapan > Tablet POS Rasmi`. Ia mengikat tablet yang sudah diurus kepada satu cawangan.

Kod aktivasi RKJ One tidak mempunyai kuasa untuk menjadikan aplikasi sebagai Device Owner. Android menetapkan kuasa itu hanya semasa provisioning peranti baharu atau selepas factory reset.

## Persediaan pusat oleh HQ

1. Pilih penyedia EMM yang menyokong Android Enterprise dedicated devices, atau gunakan Android Management API dengan kelayakan organisasi yang sah.
2. Daftar enterprise dan pautkan Managed Google Play.
3. Terbitkan `com.rkjone.staff` kepada Managed Google Play bagi organisasi.
4. Cipta polisi kiosk berdasarkan `docs/android-enterprise/rkj-pos-policy.template.json`.
5. Tetapkan Wi-Fi setiap cawangan dalam EMM. Jangan simpan kata laluan Wi-Fi dalam repo atau kod aplikasi.
6. Jana enrollment token dan QR khusus polisi POS.
7. Simpan QR, akses EMM dan PIN pentadbir hanya dalam peti kata laluan HQ.

## Penyediaan setiap tablet

1. Rekod jenama, model, nombor siri, IMEI, kapasiti dan cawangan sasaran dalam daftar aset.
2. Masukkan SIM syarikat dan uji data mudah alih jika tablet menggunakan sambungan sandaran.
3. Hidupkan tablet baharu. Jika pernah digunakan, factory reset dahulu.
4. Pada skrin Welcome Android, ketik skrin enam kali dan imbas QR Android Enterprise.
5. Sambung Wi-Fi sementara dan tunggu sehingga Android Device Policy serta RKJ One siap dipasang.
6. Cipta PIN peranti sekurang-kurangnya enam digit apabila diminta. PIN ini milik HQ/AM dan tidak dikongsi dengan staf jualan.
7. Buka RKJ One, login menggunakan akaun staf sebenar dan masuk ke POS.
8. Di komputer HQ, pilih cawangan dan model rasmi, kemudian jana kod aktivasi 10 aksara.
9. Masukkan kod pada tablet. Tablet akan terikat kepada cawangan dan meminta lock task Android.
10. Semak dashboard sehingga semua status hijau: aplikasi Android, kunci skrin, Device Owner dan kiosk.

## Akaun Google dan pemulihan peranti

- Dedicated device menggunakan akaun Managed Google Play yang disediakan EMM. Jangan login Gmail peribadi atau berkongsi satu kata laluan Gmail kepada semua tablet.
- Untuk cari, kunci atau padam tablet, gunakan fungsi remote action EMM. Consumer `Find My Device` bukan kawalan utama bagi dedicated device tanpa akaun pengguna biasa.
- Factory reset dari Settings disekat oleh polisi. HQ masih boleh wipe atau retire peranti melalui EMM.

## Rangkaian

- Wi-Fi cawangan ialah sambungan utama dan perlu menggunakan SSID serta kata laluan yang dikawal syarikat.
- SIM 5G/LTE menjadi sandaran. Pastikan pelan data aktif dan APN betul sebelum serahan.
- Jangan dedahkan kata laluan Wi-Fi kepada staf jika EMM boleh memasangnya terus.
- Buat transaksi latihan dan semakan sambungan sebelum transaksi sebenar.

## Tukar, hilang atau rosak

1. HQ batalkan tablet dalam RKJ One dengan segera.
2. Lock atau wipe melalui EMM.
3. Jangan pindahkan cookie, backup aplikasi atau kod aktivasi lama ke tablet baharu.
4. Provision tablet ganti dengan QR Android Enterprise dan jana kod RKJ One yang baharu.
5. Ulang UAT cawangan sebelum dibenarkan menerima jualan sebenar.

## Pemeriksaan penerimaan

- Model dan kapasiti sepadan dengan pesanan.
- IMEI dan nombor siri direkod.
- Android dikemas kini dan Play Protect aktif.
- PIN peranti aktif.
- RKJ One dipasang daripada Managed Google Play.
- `Device Owner`, `Lock task permitted` dan `Lock task active` dilaporkan benar.
- Aplikasi lain, pemasangan APK, penambahan akaun dan Settings disekat.
- Wi-Fi utama dan data mudah alih sandaran lulus ujian.
- Tablet hanya memaparkan POS selepas staf login.
