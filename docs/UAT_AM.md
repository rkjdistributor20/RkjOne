# UAT Area Manager — Checklist Manual

**URL AM:** https://rkj-one.vercel.app/inventory (server auto pilih UI AM)  
**Kata laluan (sementara):** lihat `csv_import/.go-live-temp-password.txt` (local) — **bukan** `RkjOne@2025` selepas go-live:passwords  

**Semak betul:** tajuk **Inventori Kawasan** + badge header **Pengurus Kawasan** (bukan "36 cawangan")

Hard refresh: **Ctrl+Shift+R** atau buka **Incognito** sebelum mula.

---

## Akaun & skop

| AM | Email | Kawasan | Bil. cawangan | Syarikat majikan |
|----|-------|---------|---------------|------------------|
| Safuan | safuan@rkj.com | Utara | 12 | RKJ Distributor Sdn Bhd |
| Hakim | hakim@rkj.com | Tengah | 10 | RKJ Distributor Sdn Bhd |
| Yati | yati@rkj.com | Selatan | 14 | RKJ Distributor Sdn Bhd |

**Tanggungjawab operasi:** staf jualan & cawangan kiosk di bawah **Roti Kaya Junus** (bukan syarikat majikan AM).

**Pilot 14 hari:** semua **12 cawangan Utara** (BR001–BR012) — rujuk [`PILOT_14_UTARA.md`](./PILOT_14_UTARA.md)

Cawangan contoh untuk uji Buka stok (satu daripada 12 pilot):

| Cawangan | Kod | Kawasan |
|----------|-----|---------|
| Simpang Pulai Utara | BR008 | Utara (Safuan) |
| Tapah Utara | BR015 | Tengah (Hakim) |
| Rawang Arah Utara | BR024 | Selatan (Yati) |

---

## Uji setiap AM (~15 min / orang)

Tandakan `[ ]` → `[x]` bila lulus.

### 1. Login & menu sidebar

- [ ] Login berjaya
- [ ] Sidebar **hanya** menu AM: Papan Pemuka, Inventori, Syif, Kelulusan, Tetapan
- [ ] **Tiada** Kilang, HQ Distributor, Logistik, POS (URL `/pos`, `/fleet` → blocked / redirect)

### 2. Papan Pemuka

- [ ] Hero **emas/hitam RKJ** — logo, nama kawasan, tarikh hari ini
- [ ] Tajuk / data **kawasan sendiri sahaja** (bukan 36 cawangan)
- [ ] **Panel Bantuan AI** (tema emas) — insight stok, jualan, syif, jadual staf
- [ ] KPI jualan **harian / mingguan / bulanan** per kawasan
- [ ] Jadual prestasi cawangan — toggle Harian / Mingguan / Bulanan
- [ ] Grid kiosk — bilangan cawangan match jadual atas
- [ ] Tiada angka stok HQ / kilang

### 2a. Profil HR (`/profile`)

- [ ] **Syarikat majikan:** RKJ Distributor Sdn Bhd
- [ ] **Tanggungjawab operasi:** Roti Kaya Junus (staf & cawangan)

- [ ] Klik avatar/nama sidebar → halaman profil load
- [ ] **Bar kelengkapan HR** — % naik bila medan wajib diisi
- [ ] **Maklumat peribadi** — IC, tarikh lahir, jantina, warganegara
- [ ] **Alamat** — telefon, alamat, bandar, negeri, poskod
- [ ] **Hubungan kecemasan** — nama, telefon, hubungan
- [ ] Upload **gambar muka** (JPG/PNG/WebP)
- [ ] **Maklumat pekerjaan** — cawangan/kawasan read-only betul
- [ ] Simpan → badge **Lengkap** bila semua medan wajib (*) siap
- [ ] Peringatan AI jika gambar/profil belum lengkap (boleh terus guna sistem)

### 2b. Jadual Staf Mingguan (Syif)

- [ ] Tab **Jadual Mingguan** — pilih cawangan → grid staf × 7 hari
- [ ] Simpan draf & **Terbitkan** jadual minggu depan
- [ ] Reminder AI / notifikasi jika jadual belum siap sebelum Ahad

### 3. Inventori → Detail Lokasi

- [ ] Tajuk: **Inventori Kawasan**
- [ ] **Hanya 1 dropdown:** *Semua kiosk kawasan saya*
- [ ] **Tiada** dropdown `ALL` atau UUID
- [ ] Mod "Semua kiosk" — grid stok roti + butang **Buka**
- [ ] Klik **Buka** pada cawangan pilot → tab Baki / Pergerakan / Pindah
- [ ] Pilih cawangan dari dropdown → label **Kiosk: BRxxx — …** (bukan UUID)

### 4. Inventori → Pindah Cawangan (jika tab wujud)

- [ ] Hanya cawangan **dalam kawasan** (bukan 36)
- [ ] Pratonton laluan / hantar pindahan (optional — jika ada stok)

### 5. Syif & Kelulusan

- [ ] Syif — senarai cawangan kawasan sahaja
- [ ] Kelulusan — item dalam skop kawasan

### 6. Tetapan Staf

- [ ] Boleh **tambah staf** — popup kredensial login auto (email + password)
- [ ] Boleh **edit staf** (pensel) — lihat username & kata laluan semasa
- [ ] Staf baharu **mesti tukar password** pada log masuk pertama
- [ ] Hanya staf **cawangan kawasan sendiri**
- [ ] **Tidak** boleh urus pengguna HQ / kilang

---

## Log isu (isi jika gagal)

| AM | Langkah | Isi yang nampak | Screenshot? |
|----|---------|-----------------|-------------|
| | | | |

---

## Selepas semua AM lulus

1. **Supabase Auth** (5 min) — Dashboard → Authentication → Settings:
   - Site URL = `https://rkj-one.vercel.app`
   - Redirect URLs: production + `http://localhost:3000/auth/callback`
   - **Enable email signup = OFF**
2. **Tukar kata laluan** semua akaun ujian
3. Selepas go-live — **`docs/GO_LIVE_36.md`** (36 cawangan serentak)

---

*Semakan automatik: `npm run verify:login` · `npm run verify:am` · `npm run verify:go-live`*
