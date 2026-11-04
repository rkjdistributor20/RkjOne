# Pelan rollout Fiuu VT untuk 36 cawangan

Last updated: 2026-11-04

## Hasil yang disediakan oleh sistem

- Kod cawangan `BR001` hingga `BR036` boleh disenaraikan sebagai calon VT.
- Cawangan tanpa tablet rasmi berdaftar kekal menggunakan QR statik/manual.
- VT hanya muncul apabila organisasi dan cawangan aktif, aset tablet rasmi telah
  disahkan, serial/IMEI lengkap, dan pendaftaran sekali guna berjaya pada tablet
  fizikal cawangan itu.
- Setiap bayaran diikat kepada UUID peranti, kod peranti dan generasi pendaftaran
  semasa. Pertukaran tablet atau pendaftaran semula tidak boleh mengambil alih
  bayaran lama.
- Satu cubaan yang belum selesai menyekat cubaan kedua, pertukaran identiti tablet
  dan penutupan syif yang tidak selamat.
- Hanya padanan `SALE` dan `STATUS=00` yang tepat boleh menghasilkan satu jualan,
  satu resit dan satu kemas kini stok.

## Satu-satunya kerja fizikal bagi setiap cawangan

1. Pastikan tablet sebenar berada di cawangan yang betul dan Fiuu Virtual
   Terminal serta RKJ One telah dipasang.
2. HQ semak rekod aset, model, serial, IMEI dan kod cawangan, kemudian jana kod
   sekali guna untuk tablet tersebut.
3. Pada tablet fizikal itu, buka RKJ One, masukkan kod sekali guna dan log masuk
   menggunakan akaun staf cawangan sendiri.
4. Jangan salin cookie, kod, aplikasi, sandaran atau identiti peranti daripada
   tablet/cawangan lain.
5. Semak nama dan kod cawangan pada POS sebelum membuka syif.
6. Buat satu transaksi kecil terkawal. Tunggu keputusan muktamad; jangan tekan
   bayar dua kali.
7. Pastikan satu resit dicetak dan stok serta jumlah QR dalam syif berubah sekali.
8. Penyelia/Finance padankan transaksi Fiuu dan settlement sebelum penggunaan
   biasa cawangan itu.

## Keputusan selepas pendaftaran

| Keadaan | Aliran yang mesti muncul |
|---|---|
| Tablet belum didaftarkan | QR statik/manual |
| Cawangan tidak aktif atau aset belum disahkan | QR statik/manual |
| Tablet cawangan lain atau generasi lama | Ditolak; jangan cuba pintas |
| Tablet rasmi tepat dan pendaftaran semasa | Fiuu VT automatik |
| Fiuu VT tidak dipasang/dipercayai | QR statik/manual |
| Bayaran masih `PENDING`/`REPORTED` | Semak status; jangan cipta bayaran kedua |

## Go/no-go cawangan

Cawangan hanya dianggap siap selepas semua perkara ini lulus:

- tablet, cawangan, staf dan syif sepadan;
- Fiuu memaparkan QR sebenar dengan amaun tepat;
- bayaran berjaya sekali dan RKJ One menghasilkan satu resit;
- cetakan 58 mm berjaya;
- stok dan ringkasan syif berubah sekali;
- tiada bayaran tergantung atau transaksi pendua; dan
- settlement/kredit bank dipadankan oleh Finance.

Jika mana-mana semakan gagal, hentikan VT untuk cawangan itu dan teruskan QR
statik/manual. Jangan padam rekod bayaran, resit atau rujukan gateway.

## Penggunaan harian staf

1. Log masuk dengan akaun sendiri dan buka syif.
2. Masukkan produk, tekan **Sahkan Bayaran**, kemudian pilih **DuitNow QR**.
3. Jika Fiuu VT dibuka, biarkan aplikasi memaparkan QR dan tunggu RKJ One
   mengesahkan secara automatik.
4. Jika QR statik dipaparkan, semak bukti berjaya, jumlah dan penerima sebelum
   menandakan pengesahan manual.
5. Cetak resit sedia ada. Jika cetakan gagal, cetak semula resit yang sama;
   jangan caj pelanggan kali kedua.

Peraturan utama: **satu pesanan, satu cubaan bayaran, satu resit**.
