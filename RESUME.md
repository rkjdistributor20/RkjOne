# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 22 Jun 2025 (go-live terus **36 cawangan**)  
**Branch:** `master` (sync GitHub + Vercel)  
**Status LIVE:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migration sehingga **00069**

---

## 🚀 Keputusan go-live

**Go-live terus 36 cawangan** — tiada pilot wajib.  
Checklist hari go-live: **[`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)**

| Kawasan | AM | Cawangan |
|---------|-----|----------|
| Utara | Safuan | 12 |
| Tengah | Hakim | 10 |
| Selatan | Yati | 14 |

---

## ✅ Sudah siap (teknikal)

| Verify | Hasil |
|--------|--------|
| `verify:go-live` | **19/19** |
| `verify:login` | **13/13** |
| `verify:production` | **6/6** |
| `verify:am` | 36 cawangan + 3 AM + legal entities |

Modul: POS 4 menu · Inventori · Syif · AM · Profil HR · 3 syarikat · HQ Distributor

---

## ⚠️ WAJIB sebelum hari go-live

### IT (~30 min)
- [ ] Supabase Auth — signup **OFF**, Site URL = `https://rkj-one.vercel.app`
- [ ] Tukar kata laluan owner/AM/HQ dari `RkjOne@2025`
- [ ] Delivery stok ke **36 kiosk** (HQ Distributor → fleet)

### Operasi (hari go-live)
- [ ] 3 AM brief staf — login, buka syif, POS
- [ ] Bookmark URL di setiap tablet/PC kiosk
- [ ] SOP 1 muka surat edarkan WhatsApp

---

## 🔐 Akaun penting

| Peranan | Email | Password (sementara) |
|---------|-------|----------------------|
| Owner | matisa@rkj.com | RkjOne@2025 → **tukar** |
| AM Utara/Tengah/Selatan | safuan / hakim / yati @rkj.com | tukar |
| Staf kiosk | s001@rkj.com, … | tukar |

---

## 📋 Rujukan

| Item | Fail |
|------|------|
| **Go-live 36** | `docs/GO_LIVE_36.md` |
| **Delivery 36** | `docs/GO_LIVE_DELIVERY_36.md` · `npm run verify:delivery` |
| Setup teknikal | `docs/GO_LIVE_CHECKLIST.md` |
| UAT AM (pantas) | `docs/UAT_AM.md` |
| Pilot (optional) | `docs/PILOT_14_UTARA.md` |
