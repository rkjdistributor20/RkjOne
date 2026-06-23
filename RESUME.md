# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 SAVE CHECKPOINT 21 Jun 2026** — Production LIVE · email `@rkj.com` · kata laluan **`RkjOne@2026`**

> **Buka fail ini bila buka semula projek.** Kata **"sambung"** untuk teruskan UAT payroll, UAT AM, atau commit skrip verify.

**Tarikh save:** 21 Jun 2026 (akhir sesi)  
**Branch:** `master` · commit terkini **`ab936b9`**  
**Production:** https://rkj-one.vercel.app · deploy **`ab936b9`** ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00075** · DB **up to date** ✓

---

## ✅ Go-Live — semakan akhir

| Semakan | Hasil |
|---------|--------|
| `verify:production` | **6/6** · commit `ab936b9` |
| `verify:settings-users` | Staff embed + API 89 pengguna |
| `verify:payroll` | **14/14** |
| `verify:hr` | **11/11** |
| Email staf | Semua `{staffcode}@rkj.com` |
| Kata laluan | **94/94** auth → `RkjOne@2026` |

**URL production:** https://rkj-one.vercel.app

---

## 📦 Kerja siap (sesi terkini)

### 1. Tetapan Pengguna — fix senarai kosong (`04b723d`, `ec9666b`)
- Query FK betul (`lib/settings/users-list.ts`) — 89 staf aktif ikut 3 syarikat
- Preload server-side · carian · kod staf · Muat Semula
- `npm run verify:settings-users`

### 2. Normalisasi email (`d39be67`)
- 30 dikemas kini → `{staffcode}@rkj.com`
- 3 kecuali (group owner `matisa@rkj.com`)
- Skrip: `npm run normalize:staff-emails:apply`

### 3. Putar kata laluan production (`ab936b9`)
- **94/94** auth users → `RkjOne@2026`
- `scripts/lib/default-password.mjs` — sumber tunggal verify scripts
- `csv_import/.go-live-temp-password.txt` (local, gitignored)

### 4. Admin Pengguna + AI Dashboard (`0c4e194`)
- Edit pengguna · Cadangan AI · Cadangan AI Semua (88 profil)
- Payroll 3 syarikat + portal slip staf (migrations 00074–00075)

---

## Commits (urutan)

| Commit | Ringkasan |
|--------|-----------|
| `0c4e194` | Admin edit pengguna + cadangan AI dashboard |
| `04b723d` | Fix query FK senarai pengguna |
| `ec9666b` | Preload staf + verify:settings-users |
| `d39be67` | Normalisasi email @rkj.com |
| `ab936b9` | Default password RkjOne@2026 + seed scripts |
| *(uncommitted)* | Verify scripts guna default-password.mjs |

---

## Data live (Supabase)

| Item | Bilangan |
|------|----------|
| Staf aktif | 89 |
| Auth users | 94 |
| Email @rkj.com | Semua staf dengan login |
| Payslip dihantar | **0** (UAT belum) |

---

## 🔐 Login (standard semasa)

| Peranan | Email | Kata laluan |
|---------|-------|-------------|
| Owner | matisa@rkj.com | `RkjOne@2026` |
| Admin DIST | dist011@rkj.com | `RkjOne@2026` |
| HR DIST | dist006@rkj.com | `RkjOne@2026` |
| Staf kiosk | s001@rkj.com … | `RkjOne@2026` |

**Nota:** `must_change_password: true` selepas putar kata laluan.  
**Jangan guna:** norashikin@rkj.com, mohdali@rkj.com, safuan@rkj.com (INACTIVE).

---

## ⚠️ Belum — bila sambung

- [ ] **Commit** skrip verify + default-password (jika diminta)
- [ ] **UAT Payroll HR** — dist006@rkj.com → `/payroll` → Cadangan AI → Sahkan slip
- [ ] **UAT AM** — akaun AM aktif perlu semak ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **Hari H** — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 📋 Fail penting (jangan commit)

| Fail | Sebab |
|------|-------|
| `_restore/` | Backup tempatan |
| `csv_import/*credentials*` | Kredensial |
| `csv_import/password_rotation_*.csv` | Log putar kata laluan |
| `csv_import/.go-live-temp-password.txt` | Password |

---

## 🔄 Sambung sesi — pilih satu

1. **UAT Payroll** — `dist006@rkj.com` → `/payroll` → Cadangan AI → Hantar slip
2. **UAT AM** — semak AM aktif → `/inventory`
3. **Verify** — `npm run verify:settings-users` · `npm run verify:login` · `npm run verify:production`

**Rujukan pantas:** Payroll HR → `/payroll` · Slip staf → Dashboard/`/profile` · Verify → `npm run verify:payroll`
