# UAT Area Manager — Checklist Manual

**URL AM:** https://rkj-one.vercel.app/inventory (server auto pilih UI AM)  
**Kata laluan (sementara):** `RkjOne@2025` — tukar selepas UAT  

**Semak betul:** tajuk **Inventori Kawasan** + badge header **Pengurus Kawasan** (bukan "36 cawangan")

Hard refresh: **Ctrl+Shift+R** atau buka **Incognito** sebelum mula.

---

## Akaun & skop

| AM | Email | Kawasan | Bil. cawangan |
|----|-------|---------|---------------|
| Safuan | safuan@rkj.com | Utara | 12 |
| Hakim | hakim@rkj.com | Tengah | 10 |
| Yati | yati@rkj.com | Selatan | 14 |

Cawangan pilot (contoh untuk uji Buka stok):

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
- [ ] **Tiada** Kilang, Gudang HQ, Fleet, POS (URL `/pos`, `/fleet` → blocked / redirect)

### 2. Papan Pemuka

- [ ] Hero **emas/hitam RKJ** — logo, nama kawasan, tarikh hari ini
- [ ] Tajuk / data **kawasan sendiri sahaja** (bukan 36 cawangan)
- [ ] **Panel Bantuan AI** (tema emas) — insight stok, jualan, syif, jadual staf
- [ ] KPI jualan **harian / mingguan / bulanan** per kawasan
- [ ] Jadual prestasi cawangan — toggle Harian / Mingguan / Bulanan
- [ ] Grid kiosk — bilangan cawangan match jadual atas
- [ ] Tiada angka stok HQ / kilang

### 2a. Profil pengguna

- [ ] Klik avatar/nama sidebar → `/profile`
- [ ] Boleh edit nama & telefon
- [ ] Upload gambar muka (JPG/PNG/WebP)
- [ ] **Peringatan AI** muncul jika tiada gambar (boleh terus guna sistem)

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
3. Teruskan **UAT pilot 3 cawangan** — `docs/GO_LIVE_CHECKLIST.md` Fasa 3

---

*Semakan automatik: `npm run verify:am` · `npm run verify:go-live`*
