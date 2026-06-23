# ⏸ Sambung Di Sini — RKJ One ERP

> **🔔 INGATKAN BUKA NANTI:** Payroll 3 syarikat + AI cadangan gaji LIVE. Mat Isa guna **password baharu sendiri**. AM UAT → password dari `.go-live-temp-password.txt` · `npm run reset:am-uat` jika perlu.

> **Buka fail ini bila buka semula projek.** Kemaskini tarikh bila selesai satu fasa.

**Tarikh kemaskini:** 21 Jun 2026 (payroll AI + payslip distribution)  
**Branch:** `master` · commit terkini **`680b02a`**  
**Production:** https://rkj-one.vercel.app · deploy **`680b02a`** ✓  
**Supabase:** `mtygxueknokcihofdttl` · migrations **00001–00075**

---

## 🚀 Keputusan operasi

| Item | Keputusan |
|------|-----------|
| Go-live | **Terus 36 cawangan** (tiada pilot wajib) |
| Checklist hari H | [`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md) |
| Delivery 36 | **36/36 stok OK** |

| Kawasan | AM | Email | Cawangan |
|---------|-----|-------|----------|
| Utara | Safuan | safuan@rkj.com | 12 |
| Tengah | Hakim | hakim@rkj.com | 10 |
| Selatan | Yati | yati@rkj.com | 14 |

---

## ✅ Siap (kumulatif sesi)

### Commits terkini

| Commit | Kandungan |
|--------|-----------|
| `680b02a` | AI cadangan gaji + hantar slip ke dashboard staf (3 syarikat) |
| `72994ec` | Payroll pecah 3 syarikat + portal HR/gaji staf + payslip upload |
| `0afab10` | Purge staf INACTIVE dari senarai HR |
| `cf14962` | Mat Isa — profil pemilik kumpulan 3 syarikat |
| `f7c5b98` | HR Syarikat transfer/edit/delete |

### Payroll & HR (21 Jun 2026)

- **`/payroll` → tab 3 Syarikat** — pecahan RKJ / RKJ_DIST / RKJ_MFG
- **Pembantu AI** — cadangan mingguan (asing) & bulanan (tempatan)
- **Hantar slip** — satu klik ke dashboard semua staf · muat turun peribadi
- **Dashboard staf** — panel HR & Gaji + slip di `/profile`
- Migration **00074–00075** — `staff_payslips`, `report_type`, auto-distribute

### Verify

| Perintah | Hasil |
|----------|--------|
| `verify:production` | **6/6** · commit `680b02a` |
| `verify:payroll` | Jalankan selepas deploy |
| `verify:hr` | HR 3 syarikat |
| `verify:go-live-36` | Auth · **36/36 stok** |

---

## 🔐 Login

| Peranan | Email | Password |
|---------|-------|----------|
| **Owner (Mat Isa)** | matisa@rkj.com | **Password baharu sendiri** |
| **HR** | mohdali@rkj.com | `.go-live-temp-password.txt` |
| **AM UAT** | safuan / hakim / yati @rkj.com | sama → wajib tukar |

---

## ⚠️ Belum — bila sambung

- [ ] **UAT Payroll** — HR jana cadangan AI → hantar slip → staf muat turun
- [ ] **UAT AM** — Safuan → Hakim → Yati ([`docs/UAT_AM.md`](docs/UAT_AM.md))
- [ ] **Supabase Auth** — signup OFF ([`docs/SUPABASE_AUTH_SETUP.md`](docs/SUPABASE_AUTH_SETUP.md))
- [ ] **Hari H** — 36 cawangan buka syif ([`docs/GO_LIVE_36.md`](docs/GO_LIVE_36.md))

---

## 📋 Rujukan pantas

| Item | Lokasi |
|------|--------|
| Payroll HR | `/payroll` → **3 Syarikat** → **Cadangan AI** |
| Slip staf | Dashboard / `/profile` → **HR & Gaji Saya** |
| Verify payroll | `npm run verify:payroll` |
| Verify production | `npm run verify:production` |

---

## 🔄 Sambung sesi

Kata **"sambung"** → AI baca fail ini · teruskan **UAT Payroll HR** atau **UAT AM**.

**Jangan commit:** `_restore/` · `login_users_generated.csv` · fail password/kredensial gitignored
