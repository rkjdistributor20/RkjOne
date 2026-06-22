# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 22 Jun 2025 (sesi: legal entities · HQ Distributor · go-live 36)  
**Branch:** `master` · commit terkini **`94c7076`** (sync GitHub + Vercel)  
**Production:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00069**

---

## 🚀 Keputusan operasi

| Item | Keputusan |
|------|-----------|
| Go-live | **Terus 36 cawangan** (tiada pilot wajib) |
| Pilot 14 hari | Optional — [`docs/PILOT_14_UTARA.md`](docs/PILOT_14_UTARA.md) |
| Checklist hari H | [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md) |
| Delivery 36 | [`docs/GO_LIVE_DELIVERY_36.md`](docs/GO_LIVE_DELIVERY_36.md) · **36/36 stok OK** |

| Kawasan | AM | Email | Cawangan |
|---------|-----|-------|----------|
| Utara | Safuan | safuan@rkj.com | 12 |
| Tengah | Hakim | hakim@rkj.com | 10 |
| Selatan | Yati | yati@rkj.com | 14 |

---

## ✅ Siap hari ini (22 Jun 2025)

### Commits utama (urutan)

| Commit | Kandungan |
|--------|-----------|
| `94c7076` | Go-live 36 · verify auth & delivery · GO_LIVE_36/DELIVERY_36 |
| `8672aa2` | verify:am — majikan AM RKJ Distributor + legal_entities |
| `cbce588` | 3 syarikat undang-undang · AM RKJ Dist · label HQ Distributor |
| `2a45a08` | verify:login 13/13 · fix embed region profil |

### Migration DB (di-push Supabase)

| Migration | Kandungan |
|-----------|-----------|
| **00067** | Jadual `legal_entities` · 3 syarikat · `legal_entity_id` profil/staf |
| **00068** | AM majikan = RKJ Distributor · urus operasi Roti Kaya Junus |
| **00069** | Skop syarikat + HQ Distributor (ganti label Gudang HQ) |

### Tiga syarikat undang-undang

1. **Roti Kaya Junus** — staf jualan kiosk (36 cawangan)
2. **RKJ Distributor Sdn Bhd** — pengedaran, fleet, AM, **HQ Distributor**
3. **Roti Kaya Junus Manufacturing Sdn Bhd** — kilang · gudang kilang

### Modul / UI siap

- Profil HR — 3 syarikat, AM: majikan + tanggungjawab operasi
- Tetapan staf — dropdown syarikat majikan (lalai RKJ untuk staf jualan)
- Sidebar / fleet / inventori — **HQ Distributor** (bukan Gudang HQ)
- Dashboard AM — header RKJ Distributor · Pengurus Kawasan

### Verify automatik (semua lulus terakhir)

| Perintah | Hasil |
|----------|--------|
| `verify:go-live` | **19/19** |
| `verify:login` | **13/13** peranan |
| `verify:production` | **6/6** |
| `verify:am` | 12+10+14 cawangan · 3 AM · legal entities |
| `verify:go-live-36` | Auth ✓ · **36/36 kiosk + stok** |

---

## ⚠️ Belum — manual owner (hari go-live)

- [ ] Supabase Auth Dashboard — **signup OFF** (semak manual walaupun verify lulus)
  - Site URL: `https://rkj-one.vercel.app`
  - Redirect: `https://rkj-one.vercel.app/auth/callback`
- [ ] **Tukar password** semua pengguna dari `RkjOne@2025`
- [ ] UAT AM pantas — Safuan / Hakim / Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] WhatsApp SOP + bookmark URL ke 36 cawangan
- [ ] Hari H: staf buka syif · jual · tutup syif · review dashboard petang

> Stok permulaan: **36/36 kiosk ada baki** (`npm run verify:delivery`)

---

## 🔐 Akaun ujian

Password sementara: **`RkjOne@2025`** (wajib tukar)

| Peranan | Email |
|---------|-------|
| Owner | matisa@rkj.com |
| AM Utara / Tengah / Selatan | safuan / hakim / yati @rkj.com |
| Staf contoh | s001@rkj.com · s052@rkj.com |

---

## 📋 Rujukan pantas

| Item | Lokasi |
|------|--------|
| Go-live 36 | `docs/GO_LIVE_36.md` |
| Delivery 36 + CSV | `docs/GO_LIVE_DELIVERY_36.md` · `csv_import/go_live_delivery_36.csv` |
| Setup teknikal | `docs/GO_LIVE_CHECKLIST.md` |
| UAT AM | `docs/UAT_AM.md` |
| Legal entities code | `lib/brand/legal-entities.ts` |
| Verify go-live 36 | `npm run verify:go-live-36` |

---

## 🔄 Sambung sesi — tanya AI

1. **Go-live hari ini** — ikut `GO_LIVE_36.md`
2. **UAT AM** — Safuan dahulu
3. **Tukar password** production — script / manual Supabase
4. **Deploy** — sudah LIVE; commit baru auto Vercel

**Jangan commit:** `_restore/` · `csv_import/login_users_generated.csv` (local/regenerated)
