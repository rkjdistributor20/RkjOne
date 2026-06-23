# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 SAVE CHECKPOINT 21 Jun 2026** — Tetapan pentadbir **Pengguna + AI dashboard** + Payroll 3 syarikat **LIVE** di production.

> **Buka fail ini bila buka semula projek.** Kata **"sambung"** untuk teruskan UAT payroll, UAT AM, atau UAT cadangan dashboard AI.

**Tarikh save:** 21 Jun 2026 (akhir sesi · **GO-LIVE DISAHKAN**)  
**Branch:** `master` · commit terkini **`0c4e194`**  
**Production:** https://rkj-one.vercel.app · deploy **`0c4e194`** (auto) · GitHub = Vercel ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00075** · DB **up to date** ✓

---

## ✅ Go-Live — semakan akhir (21 Jun 2026)

| Semakan | Hasil |
|---------|--------|
| `verify:production` | **6/6** · commit `9de12b0` |
| `verify:go-live` | **19/19** |
| `verify:go-live-36` | Auth ✓ · Safuan OK · **36/36 stok** |
| `verify:payroll` | **14/14** |
| `verify:hr` | **11/11** |
| `db:push` | Remote database up to date |
| Storage buckets | delivery-proof, bank-slips, receipts, profile-avatars, staff-payslips (migration) |

**URL production:** https://rkj-one.vercel.app

---

## 📦 Kerja siap hari ini (21 Jun 2026)

### 1. Payroll 3 Syarikat (`/payroll` → tab **3 Syarikat**)
- Pecahan automatik **RKJ · RKJ_DIST · RKJ_MFG**
- KPI mingguan (asing) & bulanan (tempatan) per syarikat
- Laporan mingguan pekerja asing (auto PR001–PR005)

### 2. Pembantu AI — Cadangan Gaji
- **Cadangan Mingguan** — 56 pekerja asing RKJ (shift + OT)
- **Cadangan Bulanan** — tempatan ikut polisi syarikat (lihat bawah)
- **Edit kasar/bersih** dalam jadual sebelum sahkan
- **Sahkan & Hantar Slip** → slip HTML ke dashboard semua staf

### 3. Portal Staf — HR & Gaji
- Panel di **Dashboard staf** (compact) + **Profil** (penuh)
- 3 syarikat kumpulan · slip **Dihantar HR** · muat turun peribadi
- Muat naik slip tambahan (pilihan)

### 4. Polisi gaji tempatan (kemaskini petang)

| Syarikat | Staf tempatan | Cara kira |
|----------|---------------|-----------|
| **RKJ** (Roti Kaya Junus) | Staf **jualan kiosk** sahaja | Peraturan PR + komisen POS + EPF/SOCSO/EIS |
| **RKJ Distributor** | 13 tempatan | `monthly_amount` rekod HR |
| **RKJ Manufacturing** | 17 tempatan | `monthly_amount` rekod HR |
| Pekerja asing | 56 (RKJ kiosk) | Mingguan PR001–PR005 + OT |

### 5. Database & skrip
- Migration **00074** — `staff_payslips`, `report_type` payroll_runs, bucket storage
- Migration **00075** — auto-distribute metadata, HR storage policy
- **`npm run verify:payroll`** — 14/14 semakan (DIST/MFG 30/30 ada gaji rekod)

### 6. Tetapan Pentadbir — Pengguna + AI Dashboard (`/settings?tab=users`)
- Senarai staf **dikumpul ikut 3 syarikat** (RKJ · RKJ_DIST · RKJ_MFG) + HQ
- **Edit** nama, peranan, cawangan, status, dashboard
- **Cadangan AI** per pengguna — nilai jawatan + syarikat → profil dashboard sesuai
- **Cadangan AI Semua** — apply pukal ke metadata `profiles`
- Dashboard staf guna metadata (label + quick actions) — tiada maklumat tidak berkaitan

**Profil dashboard:** Pemilik Kumpulan · Operasi HQ · HR · Kewangan · AM · Kiosk · Pengedaran · Kilang · Logistik · Maintenance

---

## Commits hari ini (urutan)

| Commit | Ringkasan |
|--------|-----------|
| `72994ec` | Payroll 3 syarikat + portal HR/gaji staf + payslip upload |
| `680b02a` | AI cadangan gaji + hantar slip ke dashboard staf |
| `91d412e` | Skrip `verify:payroll` + RESUME |
| `044d80f` | Polisi gaji ikut syarikat + edit cadangan AI |
| `7d2945d` | Verify DIST/MFG + RESUME checkpoint |
| `0c4e194` | Admin edit pengguna + cadangan AI dashboard ikut syarikat |
| *(next)* | Fix senarai pengguna — query FK + 89 rekod staf ikut syarikat |

---

## Verify (21 Jun 2026 — lulus)

| Perintah | Hasil |
|----------|--------|
| `npm run verify:production` | **6/6** |
| `npm run verify:payroll` | **14/14** |
| `npm run verify:hr` | HR 3 syarikat OK |
| `npx tsc --noEmit` | Lulus |
| `npm run build` | Lulus |

---

## Data live (Supabase)

| Item | Bilangan |
|------|----------|
| Staf aktif | 89 |
| Staf dengan portal | 89 |
| Pekerja asing (RKJ) | 56 |
| Tempatan RKJ | 3 |
| Tempatan RKJ_DIST | 13 |
| Tempatan RKJ_MFG | 17 |
| Payslip dihantar | **0** (UAT belum) |

---

## ⚠️ Belum — bila sambung

- [ ] **UAT Payroll HR** — jana cadangan → edit → hantar slip → staf muat turun
- [ ] **UAT AM** — Safuan → Hakim → Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **Hari H** — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 🔐 Login

| Peranan | Email | Nota |
|---------|-------|------|
| Owner | matisa@rkj.com | Password baharu sendiri |
| HR | mohdali@rkj.com | `.go-live-temp-password.txt` |
| AM UAT | safuan / hakim / yati @rkj.com | `npm run reset:am-uat` |

---

## 📋 Fail penting (jangan commit)

| Fail | Sebab |
|------|-------|
| `_restore/` | Backup tempatan |
| `csv_import/login_users_generated.csv` | Generated |
| `csv_import/company_staff_credentials.csv` | Kredensial |
| `csv_import/.go-live-temp-password.txt` | Password |

---

## 🔄 Sambung sesi — pilih satu

1. **UAT Payroll** — `mohdali@rkj.com` → `/payroll` → Cadangan AI → Sahkan slip
2. **UAT AM** — `safuan@rkj.com` → `/inventory`
3. **Deploy semak** — `npm run verify:production`

**Rujukan pantas:** Payroll HR → `/payroll` · Slip staf → Dashboard/`/profile` · Verify → `npm run verify:payroll`
