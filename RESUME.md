# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 CHECKPOINT — Portal Ejen Jualan RKJ Distributor LIVE**

**Tarikh save:** 21 Jun 2026  
**Branch:** `master` · commit *(selepas push sesi ini)*  
**Production:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00077** ✓

---

## ✅ Status Go-Live

| Semakan | Hasil |
|---------|--------|
| `verify:production` | **6/6** |
| `verify:payroll` | **14/14** · **89 payslip** dihantar |
| `verify:am` | **Lulus** · 3 AM aktif |
| `uat:payroll:direct` | Mingguan 56 + bulanan 33 slip |
| `uat:am` | Login + inventori skop 3 kawasan ✓ |
| Email staf | `{staffcode}@rkj.com` |
| Kata laluan | **`RkjOne@2026`** (94 auth users) |
| **Portal Ejen** | `/sales-agent` · peranan `SALES_AGENT` · migration **00076–00077** |

---

## 🏪 Portal Ejen Jualan (RKJ Distributor)

- **URL:** `/sales-agent` · peranan **Ejen Jualan** (`SALES_AGENT`)
- **Order stok** ikut tarikh production kilang + cutoff T-1 22:00
- **Bayaran:** FPX / Kad Kredit / Debit → hantar automatik ke kilang
- **POS cawangan ejen:** langganan **RM150/bulan** — bayar dulu, baru akses `/pos`
- **Payment UAT:** `SALES_AGENT_PAYMENT_MODE=simulate` (default)
- **Payment live:** set `SALES_AGENT_PAYMENT_MODE=live` + merchant keys di Vercel

**Cipta ejen:** Tetapan → Pengguna → peranan **Ejen Jualan** · syarikat **RKJ_DIST**

---

## 🔐 Login Pantas

| Peranan | Email | Password |
|---------|-------|----------|
| Owner | matisa@rkj.com | RkjOne@2026 |
| HR | dist006@rkj.com | RkjOne@2026 |
| AM Utara | dist009@rkj.com | RkjOne@2026 |
| AM Tengah | dist001@rkj.com | RkjOne@2026 |
| AM Selatan | dist010@rkj.com | RkjOne@2026 |
| Staf kiosk | s001@rkj.com | RkjOne@2026 |

**Jangan guna:** safuan/hakim/yati@rkj.com (legacy INACTIVE), norashikin/mohdali@rkj.com (INACTIVE)

---

## 📦 UAT Siap (sesi ini)

### Payroll
- **89 slip** dihantar ke dashboard staf (56 mingguan asing + 33 bulanan tempatan)
- HR publisher: `dist006@rkj.com`
- Staf contoh: `s001@rkj.com` ada 1 slip mingguan

### Area Manager
- Akaun aktif: **dist009** (Utara 12) · **dist001** (Tengah 10) · **dist010** (Selatan 14)
- Majikan: RKJ Distributor · operasi kiosk Roti Kaya Junus
- Inventori: kiosk kawasan sahaja · payroll/POS ditolak

---

## 🚀 Perintah Verify / UAT

```powershell
npm run verify:production
npm run verify:payroll
npm run verify:am
npm run verify:login
npm run uat:payroll:direct -- --both   # ulang hantar slip (elak duplicate)
npm run uat:am
npm run reset:am-passwords             # reset 3 AM
```

---

## ⚠️ Belum (manual browser)

- [ ] **UAT browser AM** — [`docs/UAT_AM.md`](docs/UAT_AM.md) checklist per AM (~15 min)
- [ ] **UAT browser payroll** — dist006 → `/payroll` semak UI cadangan AI
- [ ] **Staf muat turun slip** — s001 → Dashboard/Profil
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **Hari H 36 cawangan** — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## Commits utama

| Commit | Ringkasan |
|--------|-----------|
| `0c4e194` | Admin pengguna + AI dashboard |
| `04b723d`–`ec9666b` | Fix senarai pengguna 89 staf |
| `d39be67` | Email @rkj.com |
| `ab936b9` | Password RkjOne@2026 |
| `0c3fc44` | Verify scripts default-password |
| `c859013` | UAT payroll + AM scripts · dist009/001/010 AM |
| `0af1df4` | RESUME + cursor rules checkpoint |
| `b3fd6a7` | Sync checkpoint semua connection files |

---

## Data live

| Item | Bilangan |
|------|----------|
| Staf aktif | 89 |
| Auth users | 94 |
| Payslip dihantar | **89** |
| AM aktif | 3 (dist009/001/010) |

---

## 📋 Jangan commit

| Fail | Sebab |
|------|-------|
| `_restore/` | Backup tempatan |
| `csv_import/*credentials*` | Kredensial |
| `csv_import/password_rotation_*.csv` | Log password |
| `csv_import/.go-live-temp-password.txt` | Password local |

---

## 🔄 Sambung — pilih satu

1. **UAT browser AM** — dist009 → `/inventory` → checklist [`UAT_AM.md`](docs/UAT_AM.md)
2. **Go-live Auth** — Supabase signup OFF + tukar password owner
3. **Hari H** — [`GO_LIVE_36.md`](docs/GO_LIVE_36.md)

**Production:** https://rkj-one.vercel.app
