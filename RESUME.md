# ⏸ Sambung Di Sini — RKJ One ERP

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 21 Jun 2025  
**Branch:** `master`  
**Status:** **LIVE** — https://rkj-one.vercel.app

---

## Apa yang sudah siap

- App di **root repo** (Next.js 16)
- **5 tab menu POS:** Roti Kaya, Kacang, Kelapa, Benggali + **Pelbagai** (12 SKU set/varian)
- Migration **00019–00041** applied ke Supabase (`mtygxueknokcihofdttl`)
- **80 akaun** auth + profiles
- Verify go-live **16/16 lulus** — `npm run verify:go-live`
- Build production lulus — `npm run build`
- **Storage buckets** — `delivery-proof`, `bank-slips`, `receipts`
- **Area Manager:** cawangan, staf & pengguna grouped ikut region; CRUD staf kiosk
- **Tetapan Admin:** produk, cawangan ON/OFF, ambang stok, pengguna (senarai penuh)
- **Staf kiosk:** pekerja asing (gaji mingguan auto), borang tambah 3 langkah
- **Gaji:** bezakan tempatan vs asing, payroll default FOREIGN
- **Roti expiry** (5 hari), **production date** on order, **reject stok** kiosk
- **Tukar kata laluan wajib** — `/change-password`
- **Vercel production:** https://rkj-one.vercel.app

---

## Belum / manual

- Supabase Auth: matikan signup, Site URL production, redirect URLs
- Pilot 3 cawangan: Gombak, Dengkil Utara, Simpang Pulai Utara
- Tukar kata laluan default `RkjOne@2025` untuk semua pengguna
- Git commit semua perubahan tempatan (banyak fail belum commit)

---

## Langkah terakhir (manual ~2 minit)

### Supabase Auth (Dashboard → Authentication → Settings)

- Matikan **Enable email signup**
- **Site URL** = `https://rkj-one.vercel.app`
- **Redirect URLs:**
  - `https://rkj-one.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

### Uji pantas

- Login HQ: `matisa@rkj.com` / `RkjOne@2025` → tukar kata laluan
- **POS → Pelbagai** — jual set campur, semak tolakan stok roti
- **Tetapan → Staf / Pengguna** — tambah staf pekerja asing
- Area Manager: `safuan@rkj.com`, `hakim@rkj.com`, `yati@rkj.com`

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
| Siap production | `npm run finish:go-live` |

---

## Cakap dengan AI

Taip: **"deploy Vercel"** · **"uji pilot"** · **"uji Area Manager"** · **"commit git"**
