# Fiuu VT cashier-release hotfix — 2026-11-23

Status: **Calon pelepasan disahkan secara automatik; production dan tablet
fizikal belum disahkan.**

## Punca sebenar

Insiden BR001 menunjukkan payment `PENDING` dengan QR validity 899 saat. SALE
berakhir dengan provider error `9999` (user back), VOID menerima `5000` (cannot
void) dan STATUS kemudian `EXPIRED`. RKJ One lama menggunakan kewujudan payment
`PENDING/REPORTED` sebagai kunci tunggal bagi pesanan, pengguna dan tablet.
Akibatnya staf terpaksa menunggu hampir tempoh sah QR walaupun mereka sudah
menutup skrin atau meminta batal.

Tempoh 15 minit ialah validity transaksi/QR yang RKJ jadikan tempoh kunci
operasi. Bukti yang ada tidak menunjukkan Fiuu mewajibkan lorong juruwang
terkunci selama tempoh itu. Fiuu pula tidak mengesahkan pembatalan hanya kerana
aplikasi berjaya melancarkan VOID, jadi RKJ tidak boleh menukar payment terus
kepada `CANCELLED`.

## Reka bentuk pembaikan

- Simpan `fiuu_vt_cancel_requested_at`, exact VOID attempt dan
  `fiuu_vt_cashier_released_at` secara atomik.
- Keluarkan hanya payment VT yang telah dilepaskan daripada indeks
  one-active-cashier/device; status asal kekal recoverable.
- Lindungi perlumbaan callback vs release dengan row lock yang sama. Callback
  kejayaan yang menang dahulu menghalang release; release yang menang dahulu
  menyebabkan kejayaan lewat dikuarantin pada pesanan asal.
- Simpan callback fingerprint/result pertama tanpa penggantian dan jadikan
  semua replay idempotent.
- Sediakan worker timeout untuk payment released yang tidak menerima callback;
  selepas validity + grace, hanya pesanan asal dikuarantin untuk Finance/HQ.
- Simpan marker retirement pada tablet sehingga native cleanup selesai supaya
  basket lama tidak muncul semula selepas WebView/process mati.
- Gating berasingan membolehkan BR001 sahaja diaktifkan dahulu dan fail closed
  jika worker/cron belum sedia.

## Bukti calon pelepasan

| Pemeriksaan | Keputusan |
| --- | --- |
| Vitest | 56 fail, 610/610 lulus |
| TypeScript | Lulus |
| ESLint penuh | Lulus |
| `git diff --check` | Lulus |
| Next.js Production build | Lulus, 166 laluan |
| Supabase linked schema lint | Lulus, tiada error |
| Supabase linked dry-run | Hanya migrasi `20261123150000` |
| Reset skema Supabase tempatan | Lulus dari migrasi pertama hingga `20261123150000` |
| Ujian integrasi RPC tempatan | Lulus dalam transaksi yang di-`ROLLBACK`: pelepasan pertama, pesanan baharu serta-merta pada staf/syif/tablet sama, replay idempotent, konflik attempt lain dan guard bukti `STATUS 00` |
| SHA-256 migrasi akhir | `9C96570C7D32E4370D71F10987B08B9CB7F3EC195D0BE05F68D8CAA6AFB60896` |
| AAB sedia ada | 1.8.4 / code 22; SHA-256 sepadan |
| Tablet fizikal selepas hotfix | Belum diuji |
| Production migration/web | Belum diterbitkan |

## Urutan pelepasan dan rollback

1. Sahkan backup terakhir dan tiada query/checkout kritikal aktif.
2. Pastikan recovery worker/cron tersedia, tetapi biarkan cashier-release
   allowlist kosong.
3. Terapkan migrasi yang telah direview.
4. Deploy commit web yang sama dan semak `/api/health` serta endpoint cron.
5. Aktifkan `BR001` sahaja pada cashier-release allowlist.
6. Jalankan semua ujian fizikal di bawah. Jika mana-mana gate gagal, kosongkan
   allowlist dahulu. Jangan padam bukti payment atau memaksa status berjaya.

Rollback utama ialah mematikan canary gate. Skema baharu adalah additive dan
payment yang telah dilepaskan mesti terus dipulihkan/dikuarantin oleh worker;
jangan rollback web kepada versi yang tidak memahami row released selagi ada
payment tersebut belum terminal.

## UAT fizikal wajib BR001

- Jana QR, jangan bayar, tekan batal; ukur dari tekan batal sehingga POS boleh
  menerima basket pelanggan baharu.
- Semasa/selepas batal, hantar keputusan kejayaan simulasi dan satu ujian
  provider sebenar yang diluluskan; pastikan ia masuk pesanan asal sekali sahaja.
- Putus/sambung internet semasa release dan ulang selepas respons hilang.
- Tutup/buka semula aplikasi ketika payment lama belum selesai.
- Sahkan jualan tunai, resit, shift, stok dan laporan tidak berubah.
- Sahkan payment lama dan basket baharu mempunyai ID berbeza serta tiada
  duplikasi receipt, movement atau shift aggregate.

Catat masa sebenar end-to-end; sela polling 250 ms bukan ukuran masa staf.

## Inventori sasaran

BR001–BR036 ialah senarai sasaran konfigurasi, tetapi status peranti semasa
belum boleh dianggap lengkap tanpa bacaan production dan tablet. Bukti terakhir
yang boleh dinamakan dengan yakin ialah BR001 Samsung `SM-X406B`, Android 16,
serta satu HONOR `ELN2-L29` pada akaun Play. Versi aplikasi yang benar-benar
terpasang, status enrollment, merchant/terminal dan hasil smoke test bagi setiap
branch mesti diisi daripada production sebelum rollout kumpulan berikutnya.

| Cawangan | Peranti / Android / app | Pembayaran | Operasi | Status |
| --- | --- | --- | --- | --- |
| BR001 | SM-X406B / Android 16 / versi terpasang perlu dibaca | Canary belum diuji | UAT hotfix belum dijalankan | Terhalang |
| BR002–BR036 | Perlu inventori production dan bacaan tablet | Belum disahkan | Belum diuji | Terhalang |

Gunakan hanya tiga label fleet: **Siap dan disahkan**, **Dipasang tetapi belum
diuji**, atau **Terhalang**. Keseluruhan rollout tidak boleh ditanda siap sehingga
semua tablet sasaran mempunyai bukti versi, enrollment, terminal, pembayaran
dan smoke test.
