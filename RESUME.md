# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 INGATKAN BUKA NANTI:** Payroll 3 syarikat + AI cadangan (edit sebelum sahkan) LIVE. Mat Isa guna **password baharu sendiri**.

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 21 Jun 2026  
**Branch:** `master` · commit terkini **`044d80f`**  
**Production:** https://rkj-one.vercel.app  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00075**

---

## ✅ Siap — Payroll & HR

| Commit | Kandungan |
|--------|-----------|
| `044d80f` | Peraturan tempatan ikut syarikat + edit cadangan AI sebelum sahkan |
| `680b02a` | AI cadangan gaji + hantar slip ke dashboard staf |
| `72994ec` | Payroll 3 syarikat + portal HR/gaji staf |

### Polisi gaji tempatan

| Syarikat | Cara kira |
|----------|-----------|
| **RKJ** (Roti Kaya Junus) | Staf jualan: peraturan PR + komisen POS + EPF/SOCSO/EIS |
| **RKJ_DIST** | Gaji bulanan rekod HR (`monthly_amount`) |
| **RKJ_MFG** | Gaji bulanan rekod HR (`monthly_amount`) |
| Pekerja asing (RKJ kiosk) | Mingguan PR001–PR005 + OT |

### UAT Payroll (belum dijalankan manual)

1. Login **mohdali@rkj.com** → `/payroll` → **3 Syarikat**
2. **Cadangan Mingguan** → semak 56 pekerja asing RKJ
3. **Cadangan Bulanan** → RKJ (3 tempatan jualan) vs DIST (13) vs MFG (17)
4. **Edit** kasar/bersih jika perlu → **Sahkan & Hantar Slip**
5. Login staf → Dashboard → **Slip Gaji Saya** → muat turun

### Verify (21 Jun 2026)

| Perintah | Hasil |
|----------|--------|
| `verify:production` | **6/6** |
| `verify:payroll` | **13/13** |
| `verify:hr` | HR 3 syarikat |

---

## ⚠️ Belum

- [ ] **UAT Payroll** — jana & hantar slip pertama (0 rekord payslip setakat ini)
- [ ] **UAT AM** — Safuan → Hakim → Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Hari H** — [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md)

---

## 🔐 Login pantas

| Peranan | Email |
|---------|-------|
| Owner | matisa@rkj.com |
| HR | mohdali@rkj.com |
| AM | safuan / hakim / yati @rkj.com |

Password: `csv_import/.go-live-temp-password.txt` · `npm run reset:am-uat`

---

## 📋 Rujukan

| Item | Lokasi |
|------|--------|
| Payroll HR | `/payroll` → **3 Syarikat** → **Cadangan AI** |
| Slip staf | Dashboard / `/profile` → **HR & Gaji Saya** |
| Verify | `npm run verify:payroll` |

**Jangan commit:** `_restore/` · CSV kredensial · fail password
