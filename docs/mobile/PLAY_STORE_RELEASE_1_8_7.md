# RKJ One Staff 1.8.7 - Pemulihan pembayaran Fiuu VT selamat

## Release

- Track: `Production`, diterbitkan 24 November 2026, rollout Google Play 100%.
- Version code: `25`
- Version name: `1.8.7`
- AAB: `artifacts/android/rkj-one-staff-1.8.7-release.aab`
- AAB SHA-256: `D834DC386CC7156D1A0AAC0AD5E1F19D5FA6EF00CBFBB6CCAE07A02E5B2CDE4D`
- AAB size: `1,742,619 bytes`
- Signer certificate SHA-256: `36:CE:05:C5:36:19:D4:F4:29:32:D2:14:CD:DC:9B:5F:F5:D4:95:C3:A4:03:49:AB:0C:0F:16:A1:0B:CE:2A:02`

## Nota keluaran BM

Pembatalan pembayaran Fiuu VT kini boleh melepaskan kaunter dengan selamat tanpa menunggu tempoh sah QR selesai. Callback lewat atau berulang kekal dipadankan kepada pesanan asal, sementara worker pelayan memulihkan callback yang terputus dan mengekalkan rekod jualan, resit serta stok tepat. Versi tablet dan aplikasi Fiuu VT turut dilapor untuk membantu pengesahan setiap cawangan.

## Release notes EN

Fiuu VT cancellation can now safely release the cashier without waiting for the QR validity window to end. Late or duplicate callbacks remain attached to the original order, while server recovery handles interrupted callbacks and preserves exact sales, receipt, and stock records. Tablet and Fiuu VT app versions are also reported for branch verification.

## Acceptance gates

- Semua Vitest, TypeScript, ESLint dan build production lulus.
- Migrasi pemulihan callback dan heartbeat worker dikompil serta diuji sebelum production.
- Pelepasan kaunter hanya tersedia pada build rasmi version code `25` atau lebih baharu.
- Heartbeat gagal tertutup jika callback yang diterima atau transaksi dilepaskan tidak dapat dipulihkan.
- Callback lewat/berulang tidak boleh dipadankan kepada pesanan pelanggan seterusnya atau menggandakan jualan, resit dan stok.
- Hash AAB, metadata manifest dan sijil signing sepadan dengan bukti release di atas.
- BR001 mesti lulus aliran pesanan A ke B, pembayaran sebenar dan pemulihan internet sebelum peluasan kumpulan seterusnya.

## Verified build evidence

- Gradle `bundleRelease` berjaya menggunakan Temurin JDK 21.
- Metadata bundle: application ID `com.rkjone.staff`, variant `release`, version code `25`, version name `1.8.7`.
- Pemeriksaan tandatangan Java standard berjaya; amaran yang tinggal ialah sijil upload self-signed, tiada timestamp dan sifat ZIP/JAR App Bundle yang dijangka.
- Sijil upload sepadan dengan release Play Store terdahulu.

Semakan Play Console pada 26 November 2026: versi 1.8.7 (25) ialah keluaran Production terkini dan tiada perubahan belum diterbitkan. Aplikasi rasmi memuatkan `https://rkj.one`; pembaikan susulan Web/SQL tidak memerlukan muat naik AAB baharu. Rollout Google Play 100% tidak bermaksud setiap tablet sudah memasangnya.
