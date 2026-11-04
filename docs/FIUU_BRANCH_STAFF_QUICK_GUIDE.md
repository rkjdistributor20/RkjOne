# Panduan pantas Fiuu untuk staf cawangan

Last updated: 2026-11-04

## Status semasa

- **Semua cawangan BR001-BR036:** gunakan aliran DuitNow QR statik/manual yang
  dipadankan kepada cawangan. Aliran ini boleh digunakan tanpa Secret Key,
  tetapi staf mesti menyemak bukti bayaran yang berjaya sebelum mengesahkan.
- **BR001 sahaja:** aliran automatik Fiuu VT App-to-App telah lulus UAT
  operasi di Preview/staging, termasuk resit, stok, syif dan cetakan. Ia belum
  menjadi bukti signed OPA atau kelulusan rollout Production 36 cawangan.
- **OPA automatik semua cawangan:** belum aktif. Jangan anggap ikon QR atau
  paparan `Menunggu` sebagai bayaran berjaya.

## Sebelum mula jualan

1. Pastikan nama dan kod cawangan pada RKJ One adalah cawangan sebenar tablet.
2. Log masuk menggunakan akaun staf sendiri dan buka syif yang betul.
3. Semak stok pembukaan dan pastikan printer 58 mm menunjukkan sedia.
4. Pastikan tiada bayaran QR lama berstatus `Menunggu`, `PENDING` atau
   `REPORTED`. Jika ada, tekan **Semak status** atau panggil penyelia; jangan
   jana QR baharu.
5. Semak jumlah troli sebelum memilih kaedah bayaran.

## Jualan DuitNow QR — semua cawangan (manual/static)

1. Pilih produk dan tekan **Sahkan Bayaran**.
2. Pilih **DuitNow QR** dan pastikan jumlah pada skrin sama dengan jumlah troli.
3. Tunjukkan QR cawangan kepada pelanggan.
4. Tunggu pelanggan menunjukkan transaksi **Berjaya**, kemudian semak:
   - jumlah tepat;
   - nama penerima `ROTI KAYA JUNUS`;
   - masa transaksi semasa; dan
   - transaksi bukan tangkap layar lama atau status menunggu.
5. Hanya selepas semua padan, tandakan pengesahan staf dan lengkapkan jualan.
6. Pastikan satu resit sahaja terhasil, kemudian tekan **Cetak terus**.

Jika bukti tidak jelas, jumlah tidak padan atau status masih menunggu, jangan
sahkan jualan dan jangan minta pelanggan membayar kali kedua. Panggil penyelia
untuk semakan portal/Finance.

## Jualan Fiuu VT automatik — BR001 sahaja

1. Pilih produk, tekan **Sahkan Bayaran** dan pilih **DuitNow QR**.
2. Biarkan RKJ One membuka aplikasi rasmi Fiuu VT. Jangan tekan berulang kali,
   tutup aplikasi atau jana transaksi kedua.
3. Pelanggan mengimbas QR sebenar yang dipaparkan oleh aplikasi Fiuu VT.
4. Tunggu RKJ One kembali dan memaparkan keputusan muktamad. Hanya status
   berjaya yang dipadankan kepada pesanan dan jumlah semasa boleh menghasilkan
   resit.
5. Pastikan resit muncul sekali dan tekan **Cetak terus**.

Jika aplikasi kembali dengan ralat atau RKJ One masih menunggu, tekan
**Semak status** sekali dan tunggu. Jangan gunakan butang bayar semula sehingga
penyelia mengesahkan cubaan lama sudah gagal/luput dengan selamat.

## Selepas setiap jualan

- Semak nombor resit dan jumlah pada skrin.
- Pastikan printer mencetak satu salinan; cetak semula hanya daripada resit
  sedia ada, bukan dengan mencipta jualan baharu.
- Jika resit tidak keluar tetapi jualan sudah berjaya, buka resit sedia ada dan
  cetak semula. Jangan caj pelanggan lagi.
- Catat dan laporkan sebarang perbezaan jumlah, resit berganda, stok tidak
  berubah atau status tergantung kepada penyelia.

## Sebelum tutup syif

1. Pastikan tiada pembayaran berstatus menunggu atau belum diselesaikan.
2. Padankan jumlah QR dalam ringkasan syif dengan rekod transaksi berjaya.
3. Padankan bilangan resit dan semak tiada transaksi pendua.
4. Serahkan pengecualian kepada penyelia/Finance sebelum menutup syif.

## Semakan penyelia harian

- Cawangan, staf, syif, tablet dan printer adalah betul.
- Tiada pembayaran tergantung atau transaksi pendua.
- Jumlah jualan QR, resit, stok dan ringkasan syif sepadan.
- Transaksi manual disokong bukti pelanggan yang sah.
- Laporan settlement dan kredit bank dipadankan oleh Finance; staf kaunter
  tidak membuat refund atau pelarasan sendiri.

## Peraturan paling penting

**Satu pesanan, satu cubaan pembayaran, satu resit.** Jika keputusan tidak
pasti, hentikan cubaan baharu dan semak status. Jangan bayar dua kali, jangan
cipta jualan manual untuk menutup transaksi tergantung, dan jangan tukar
cawangan/tablet semata-mata untuk melepasi kawalan sistem.
