# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh berhenti:** 21 Jun 2025  
**Branch:** `master`  
**Commit terakhir:** `9de94b8` — chore: remove legacy web/ folder

---

## Apa yang sudah siap

- App di **root repo** (bukan `web/`)
- **4 menu POS:** Roti Kaya, Kacang, Kelapa, Benggali + bar stok (roti, kaya/butter kg, packaging)
- Migration **00019–00030** applied ke Supabase (`mtygxueknokcihofdttl`)
- **67 akaun** seeded — `npm run seed:users`
- Verify go-live **13/13 lulus** — `npm run verify:go-live`
- Build lulus — `npm run build`
- **Area Manager:** cawangan & staf grouped ikut region (Shifts, Settings, Inventory)

---

## Langkah seterusnya (belum buat)

1. [ ] **Deploy Vercel** — ikut `docs/DEPLOYMENT.md`
2. [ ] **Supabase Dashboard**
   - Matikan email signup
   - Set Site URL + Redirect URLs (production)
   - Storage buckets: `delivery-proof`, `bank-slips`, `receipts`
3. [ ] **Uji pilot 14 hari** — Gombak, Dengkil Utara, Simpang Pulai Utara
4. [ ] **Uji login Area Manager** — `safuan@rkj.com`, `hakim@rkj.com`, `yati@rkj.com`
5. [ ] **Tukar kata laluan** dari `RkjOne@2025` sebelum production

---

## Jalankan dev

```powershell
cd "c:\Users\ashik\OneDrive\Desktop\RKJ_ONE_Production_Pack"
npm run dev
```

→ http://localhost:3000

---

## Rujukan pantas

| Item | Lokasi |
|------|--------|
| Checklist penuh | `docs/GO_LIVE_CHECKLIST.md` |
| Deploy | `docs/DEPLOYMENT.md` |
| Env template | `.env.example` (`.env.local` jangan commit) |
| SQL manual | `docs/sql/00019_00030_manual_bundle.sql` |

---

## Cakap dengan AI

Bila sambung, taip: **"sambung dari RESUME.md"** — agent akan terus deploy / uji pilot.
