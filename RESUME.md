# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 21 Jun 2025 (sesi rehat)  
**Branch:** `master` (sync dengan GitHub + Vercel)  
**Status LIVE:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migration sehingga **00060**

---

## 🗺 Perjalanan syarikat (RKJ One)

```
Ramalan/Order HQ → Kilang (production) → Cross-dock Gudang HQ
       → Arahan driver (max 20 hentian/hari, susunan AI)
       → 36 kiosk R&R (Utara · Tengah · Selatan)
       → POS jual (4 menu roti + Pelbagai) → Dashboard HQ
```

**Peranan kritikal:** Super Admin · Admin HQ · Operation Manager · Area Manager (kawasan) · Staf kiosk · Pemandu · Kewangan

**Stok operasi (9 jenis):** 4 roti + Kaya + Butter + Plastik S/M/B · Roti shelf life **5 hari** (batch ikut tarikh production)

---

## ✅ Sudah siap & deployed

### Platform
| Platform | Status |
|----------|--------|
| **GitHub** `rkjdistributor20/RkjOne` | `master` commit `c989922` |
| **Vercel** | Auto-deploy dari `master` |
| **Supabase DB** | Migration **00001–00060** applied |

### Commit terkini (Fleet + Inventori)
| Commit | Kandungan |
|--------|-----------|
| `c989922` | DO manual: tambah/padam pukal **+1/+3/+5/Isi 10** arahan |
| `2f75ff0` | Susunan laluan **AI + GPS** driver (DO manual, migration 00060) |
| `4a447cf` | Pindah cawangan multi-stop + batch roti 5 hari |
| `eb8dd5c` | Pindah stok kiosk OM/AM (migration 00058, 00059) |
| `8ed1763` | Manifest driver + AI laluan kilang (migration 00057) |

### Modul siap kod
- **POS** — 5 tab (Kaya, Kacang, Kelapa, Benggali, Pelbagai), validasi stok, syif
- **Inventori** — HQ, kiosk, kilang, armada; reject stok kiosk; batch roti
- **Pindah Cawangan** — OM (semua) / AM (kawasan); max 10 cawangan; ambil=hantar; pratonton laluan kiosk↔kiosk / HQ→kiosk
- **Production HQ** — order kilang, laluan driver, pecah max 20 hentian, optimize AI
- **Fleet** — DO manual max 10 arahan; panel driver GPS + Susun AI; manifest harian
- **AM scope** — cawangan/staf ikut region
- **Tetapan Admin** — produk, cawangan ON/OFF, ambang stok, pengguna
- **Auth** — tukar kata laluan wajib `/change-password`
- **80 akaun** seed + profiles

---

## ⚠️ Belum siap sepenuhnya — WAJIB sebelum guna 36 cawangan

### A. Manual IT (~30 min) — **blok go-live**
- [ ] Supabase Auth → matikan **Enable email signup**
- [ ] **Site URL** = `https://rkj-one.vercel.app`
- [ ] **Redirect URLs:** production + `http://localhost:3000/auth/callback`
- [ ] Semua pengguna **tukar kata laluan** dari `RkjOne@2025`
- [ ] Jalankan semula: `npm run verify:go-live` (pastikan lulus dengan migration 00060)
- [ ] `npm run build` — sahkan tiada ralat production

### B. Data master HQ (~half day)
- [ ] Isi **email & telefon** semua staf
- [ ] **No plat lori** + slot armada setiap kenderaan
- [ ] **Ambang stok** min/kritikal (Kaya, Butter, roti, plastik) per cawangan
- [ ] Semak **harga produk** POS ikut HQ
- [ ] **Koordinat GPS cawangan** (`branches.latitude/longitude`) — kebanyakan NULL; AI laluan masih jalan (heuristik arah jalan) tetapi **GPS pemandu lebih tepat bila koordinat diisi**

### C. UAT operasi — **pilot 14 hari** (3 cawangan)
**Pilot:** Gombak · Dengkil Utara · Simpang Pulai Utara

| Aliran | Uji |
|--------|-----|
| Order HQ → Kilang → laluan driver | Manifest AI, max 20 hentian |
| Delivery HQ → kiosk | Stok masuk kiosk betul |
| **DO manual** (kes khas) | 3–10 arahan, Susun AI, driver GPS |
| **Pindah stok cawangan** | OM + AM (kawasan), batch roti luput ditolak |
| POS 4 menu + Pelbagai | Jual, stok tolak, halang oversell |
| Syif buka/tutup | Tunai + laporan |
| AM | Hanya cawangan region sendiri |
| Driver | Arahan kilang + DO manual, Susun AI dari lokasi |

### D. Go-live penuh (36 cawangan)
- [ ] Pilot stabil — tiada isu stok/harga/login 14 hari
- [ ] **SOP bertulis:** buka syif, terima stok, tutup syif, hubungi HQ
- [ ] Tablet/kiosk — bookmark URL production
- [ ] Rollout ikut kawasan: **Utara → Tengah → Selatan**
- [ ] Backup Supabase diaktifkan

### E. Nice-to-have / fasa seterusnya
- [ ] Isi GPS semua 36 cawangan (import CSV atau manual)
- [ ] Susun semula laluan **mid-route** untuk arahan kilang (driver GPS semasa perjalanan — bukan hanya DO manual)
- [ ] Padam folder `_restore/` (backup tempatan, jangan commit)
- [ ] Modul Kewangan/payroll — UAT jika syarikat aktifkan

---

## 🔐 Akaun ujian pantas

| Peranan | Email | Kata laluan (tukar selepas login) |
|---------|-------|-----------------------------------|
| Super Admin | matisa@rkj.com | RkjOne@2025 |
| AM Utara | safuan@rkj.com | RkjOne@2025 |
| AM Tengah | hakim@rkj.com | RkjOne@2025 |
| AM Selatan | yati@rkj.com | RkjOne@2025 |
| Pemandu | d001@rkj.com | RkjOne@2025 |

---

## 🚀 Jalankan dev (bila sambung)

```powershell
cd "c:\Users\ashik\OneDrive\Desktop\RKJ_ONE_Production_Pack"
npm run dev
```

→ http://localhost:3000

---

## 📋 Prioriti bila sambung sesi

1. **Auth Supabase** (A) — 5 min, impak besar
2. **`npm run verify:go-live`** + **`npm run build`**
3. **Pilot UAT** 3 cawangan (C) — dokumentasi isu
4. **Isi GPS cawangan** + data master (B)
5. Rollout 36 cawangan (D)

---

## 💬 Cakap dengan AI (bila buka semula)

Taip salah satu:
- **"sambung sesi"** — AI baca fail ini + teruskan kerja
- **"uji pilot"** — checklist UAT 3 cawangan
- **"isi GPS cawangan"** — bantu import koordinat
- **"verify go-live"** — jalankan semakan sistem
- **"commit deploy"** — jika ada perubahan tempatan

---

## Rujukan

| Item | Lokasi |
|------|--------|
| Checklist penuh | `docs/GO_LIVE_CHECKLIST.md` |
| Deploy | `docs/DEPLOYMENT.md` |
| Env | `.env.example` |
| Login CSV | `csv_import/login_users_generated.csv` |

---

*RKJ One · Roti Kaya Junus · Simpan di GitHub + Vercel + Supabase — tiada kerja kod belum commit (kecuali `_restore/`)*
