# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 21 Jun 2025  
**Branch:** `master`  
**Commit terakhir:** `facceef` — fix: audit all dashboards (BM, real data, UX)

---

## Apa yang sudah siap

- App di **root repo** (bukan `web/`)
- **4 menu POS:** Roti Kaya, Kacang, Kelapa, Benggali + bar stok
- Migration **00019–00030** applied ke Supabase (`mtygxueknokcihofdttl`)
- **67 akaun** seeded — `npm run seed:users`
- Verify go-live **13/13 lulus** — `npm run verify:go-live`
- Build lulus — `npm run build`
- **Area Manager:** cawangan & staf grouped ikut region
- **Dashboard audit siap:** BM labels, data armada sebenar, inventori fix, empty/error states

---

## Langkah seterusnya (belum buat)

1. [ ] **Deploy Vercel**
   ```powershell
   npx vercel login
   npx vercel --prod
   ```
   Set env di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`

2. [ ] **Supabase Dashboard** (Authentication → Settings)
   - Matikan email signup
   - Site URL = URL Vercel production
   - Redirect: `https://.../auth/callback`, `http://localhost:3000/auth/callback`

3. [ ] **Storage buckets** (automatik atau manual)
   ```powershell
   npm run setup:storage
   ```
   Buckets: `delivery-proof`, `bank-slips`, `receipts`

4. [ ] **Uji pilot 14 hari** — Gombak, Dengkil Utara, Simpang Pulai Utara
5. [ ] **Uji login Area Manager** — `safuan@rkj.com`, `hakim@rkj.com`, `yati@rkj.com`
6. [ ] **Tukar kata laluan** dari `RkjOne@2025` sebelum production

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
| Env template | `.env.example` |
| SQL manual | `docs/sql/00019_00030_manual_bundle.sql` |

---

## Cakap dengan AI

Taip: **"sambung deploy Vercel"** atau **"uji pilot"**
